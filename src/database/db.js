const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// DB is enabled by default. Set DB_ENABLED=false in .env to disable explicitly.
// ─────────────────────────────────────────────────────────────────────────────
const DB_ENABLED = process.env.DB_ENABLED !== 'false';
const DUPLICATE_CHECK_BYPASS_USER_IDS = ['1097428165963558914'];

const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'members.db');

let db;

function getDb() {
  if (!DB_ENABLED) return null;
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

// ── Init ──────────────────────────────────────────────────────────────────────
function initDatabase() {
  if (!DB_ENABLED) {
    console.log('[DB] Database disabled — skipping init.');
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) return reject(err);
      console.log(`[DB] Connected: ${DB_PATH}`);
    });

    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS members (
          discord_id   TEXT PRIMARY KEY,
          email        TEXT NOT NULL,
          verified     INTEGER NOT NULL DEFAULT 0,
          join_date    TEXT NOT NULL DEFAULT (datetime('now')),
          renewal_date TEXT
        )
      `);

      db.run(`CREATE INDEX IF NOT EXISTS idx_members_email ON members(email)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS verifications (
          id                INTEGER PRIMARY KEY AUTOINCREMENT,
          discord_id        TEXT NOT NULL,
          email             TEXT NOT NULL,
          verification_time TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      db.run(`CREATE INDEX IF NOT EXISTS idx_verifications_discord_id ON verifications(discord_id)`);

      db.run(`
        CREATE TABLE IF NOT EXISTS applications (
          id                   INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id              TEXT NOT NULL,
          username             TEXT,
          display_name         TEXT,
          email                TEXT NOT NULL,
          submitted_at         TEXT NOT NULL,
          status               TEXT NOT NULL DEFAULT 'pending',
          review_message_id    TEXT,
          review_channel_id    TEXT,
          interview_channel_id TEXT,
          approved_at          TEXT,
          denied_at            TEXT
        )
      `);

      // Migrations: add columns if upgrading from an older DB
      db.run(`ALTER TABLE applications ADD COLUMN approved_at TEXT`,        () => { /* ignore if already exists */ });
      db.run(`ALTER TABLE applications ADD COLUMN denied_at TEXT`,          () => { /* ignore if already exists */ });
      db.run(`ALTER TABLE applications ADD COLUMN review_channel_id TEXT`,  () => { /* ignore if already exists */ });

      db.run(`CREATE INDEX IF NOT EXISTS idx_applications_user_id ON applications(user_id)`);

      // Rebuild the unique-open index so bypass IDs can be excluded from duplicate restriction.
      db.run(`DROP INDEX IF EXISTS idx_unique_open_application`);
      const bypassIdList = DUPLICATE_CHECK_BYPASS_USER_IDS
        .map((id) => `'${String(id).replace(/'/g, "''")}'`)
        .join(', ');
      const bypassWhere = DUPLICATE_CHECK_BYPASS_USER_IDS.length
        ? ` AND user_id NOT IN (${bypassIdList})`
        : '';
      db.run(
        `
          CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_open_application
          ON applications(user_id)
          WHERE status IN ('pending', 'interview')${bypassWhere}
        `,
        (err) => {
          if (err) return reject(err);
          console.log('[DB] Tables ready.');
          resolve();
        }
      );
    });
  });
}

// ── Members ───────────────────────────────────────────────────────────────────
function upsertMember({ discordId, email, verified, joinDate, renewalDate }) {
  return new Promise((resolve, reject) => {
    getDb().run(
      `INSERT INTO members (discord_id, email, verified, join_date, renewal_date)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(discord_id) DO UPDATE SET
         email        = excluded.email,
         verified     = excluded.verified,
         renewal_date = excluded.renewal_date`,
      [discordId, email, verified ? 1 : 0, joinDate ?? new Date().toISOString(), renewalDate ?? null],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

function getMemberByDiscordId(discordId) {
  return new Promise((resolve, reject) => {
    getDb().get(
      `SELECT discord_id as discordId, email, verified, join_date as joinDate, renewal_date as renewalDate
       FROM members WHERE discord_id = ?`,
      [discordId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getMemberByEmail(email) {
  return new Promise((resolve, reject) => {
    getDb().get(
      `SELECT discord_id as discordId, email, verified, join_date as joinDate, renewal_date as renewalDate
       FROM members WHERE email = ?`,
      [email?.toLowerCase().trim()],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getAllVerifiedMembers() {
  return new Promise((resolve, reject) => {
    getDb().all(
      `SELECT discord_id as discordId, email, verified, join_date as joinDate, renewal_date as renewalDate
       FROM members WHERE verified = 1`,
      [],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

// ── Verifications ─────────────────────────────────────────────────────────────
function logVerification({ discordId, email, verificationTime }) {
  return new Promise((resolve, reject) => {
    getDb().run(
      `INSERT INTO verifications (discord_id, email, verification_time) VALUES (?, ?, ?)`,
      [discordId, email, verificationTime ?? new Date().toISOString()],
      function (err) {
        if (err) return reject(err);
        resolve(this.lastID);
      }
    );
  });
}

function getVerificationsByDiscordId(discordId) {
  return new Promise((resolve, reject) => {
    getDb().all(
      `SELECT discord_id as discordId, email, verification_time as verificationTime
       FROM verifications WHERE discord_id = ? ORDER BY verification_time DESC`,
      [discordId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * Delete a member record by Discord user ID.
 */
function deleteMember(discordId) {
  return new Promise((resolve, reject) => {
    getDb().run(`DELETE FROM members WHERE discord_id = ?`, [discordId], function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

// ── Applications ──────────────────────────────────────────────────────────────────
/**
 * Returns true if the user already has an application with status 'pending' or 'interview'.
 */
function hasOpenApplication(userId) {
  if (!DB_ENABLED) return Promise.resolve(false);
  return new Promise((resolve, reject) => {
    getDb().get(
      `SELECT id FROM applications WHERE user_id = ? AND status IN ('pending', 'interview') LIMIT 1`,
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(!!row);
      }
    );
  });
}

/**
 * Finds duplicate open-application conflicts for user ID, username, and email.
 * Returns null when there is no conflict.
 */
function findOpenApplicationConflict({ userId, username, email }) {
  if (!DB_ENABLED) return Promise.resolve(null);

  const normalizedUsername = username?.toLowerCase().trim() ?? '';
  const normalizedEmail = email?.toLowerCase().trim() ?? '';

  return new Promise((resolve, reject) => {
    getDb().get(
      `SELECT user_id, username, email, status FROM applications
       WHERE status IN ('pending', 'interview') AND user_id = ?
       LIMIT 1`,
      [userId],
      (userErr, userRow) => {
        if (userErr) return reject(userErr);
        if (userRow) {
          return resolve({ type: 'user', row: userRow });
        }

        getDb().get(
          `SELECT user_id, username, email, status FROM applications
           WHERE status IN ('pending', 'interview') AND lower(email) = ?
           LIMIT 1`,
          [normalizedEmail],
          (emailErr, emailRow) => {
            if (emailErr) return reject(emailErr);
            if (emailRow) {
              return resolve({ type: 'email', row: emailRow });
            }

            getDb().get(
              `SELECT user_id, username, email, status FROM applications
               WHERE status IN ('pending', 'interview') AND lower(username) = ?
               LIMIT 1`,
              [normalizedUsername],
              (usernameErr, usernameRow) => {
                if (usernameErr) return reject(usernameErr);
                if (usernameRow) {
                  return resolve({ type: 'username', row: usernameRow });
                }

                return resolve(null);
              }
            );
          }
        );
      }
    );
  });
}

/**
 * Inserts a new application row with status = 'pending'.
 * @param {{ userId, username, displayName, email, submittedAt, reviewMessageId, reviewChannelId }} data
 * @returns {Promise<number>} lastID
 */
function createApplication({ userId, username, displayName, email, submittedAt, reviewMessageId, reviewChannelId }) {
  if (!DB_ENABLED) return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    getDb().run(
      `INSERT INTO applications (user_id, username, display_name, email, submitted_at, status, review_message_id, review_channel_id)
       VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
      [userId, username ?? null, displayName ?? null, email, submittedAt ?? new Date().toISOString(), reviewMessageId ?? null, reviewChannelId ?? null],
      function (err) {
        if (err) {
          if (err.code === 'SQLITE_CONSTRAINT') {
            const conflictErr = new Error('OPEN_APPLICATION_EXISTS');
            conflictErr.code = 'OPEN_APPLICATION_EXISTS';
            return reject(conflictErr);
          }
          return reject(err);
        }
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Updates review message metadata for the current open application.
 */
function setApplicationReviewMessage(userId, reviewMessageId, reviewChannelId) {
  if (!DB_ENABLED) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    getDb().run(
      `UPDATE applications
       SET review_message_id = ?, review_channel_id = ?
       WHERE user_id = ? AND status IN ('pending', 'interview')`,
      [reviewMessageId ?? null, reviewChannelId ?? null, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

/**
 * Deletes the open application row for a user.
 */
function deleteOpenApplication(userId) {
  if (!DB_ENABLED) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    getDb().run(
      `DELETE FROM applications WHERE user_id = ? AND status IN ('pending', 'interview')`,
      [userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

/**
 * Updates the status of an application row.
 * @param {string} userId
 * @param {'pending'|'approved'|'denied'|'interview'} status
 * @param {string|null} timestamp  ISO timestamp — stored in approved_at or denied_at based on status
 */
function updateApplicationStatus(userId, status, timestamp = null) {
  if (!DB_ENABLED) return Promise.resolve(0);
  const approvedAt = status === 'approved' ? timestamp : null;
  const deniedAt   = status === 'denied'   ? timestamp : null;
  return new Promise((resolve, reject) => {
    getDb().run(
      `UPDATE applications SET status = ?, approved_at = ?, denied_at = ? WHERE user_id = ? AND status IN ('pending', 'interview')`,
      [status, approvedAt, deniedAt, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

/**
 * Sets the interview_channel_id on the user's open application.
 */
function setInterviewChannel(userId, channelId) {
  if (!DB_ENABLED) return Promise.resolve(0);
  return new Promise((resolve, reject) => {
    getDb().run(
      `UPDATE applications SET interview_channel_id = ?, status = 'interview'
       WHERE user_id = ? AND status IN ('pending', 'interview')`,
      [channelId, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

/**
 * Fetches the most recent application row for a user.
 * @param {string} userId
 * @returns {Promise<Object|null>}
 */
function getApplicationByUserId(userId) {
  if (!DB_ENABLED) return Promise.resolve({ status: 'pending' });
  return new Promise((resolve, reject) => {
    getDb().get(
      `SELECT * FROM applications WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1`,
      [userId],
      (err, row) => {
        if (err) return reject(err);
        resolve(row ?? null);
      }
    );
  });
}

module.exports = {
  initDatabase,
  upsertMember,
  getMemberByDiscordId,
  getMemberByEmail,
  getAllVerifiedMembers,
  logVerification,
  getVerificationsByDiscordId,
  deleteMember,
  hasOpenApplication,
  findOpenApplicationConflict,
  createApplication,
  setApplicationReviewMessage,
  deleteOpenApplication,
  updateApplicationStatus,
  setInterviewChannel,
  getApplicationByUserId,
};

const { getSheetsClient } = require('../config/googleSheets');

// Sheet column layout (1-indexed for Sheets API, 0-indexed for JS arrays):
// A(0): userId  B(1): username  C(2): displayName  D(3): email
// E(4): submittedAt  F(5): status  G(6): reviewMessageId  H(7): interviewChannelId

const SHEET_RANGE  = 'Sheet1!A:H';
const COL_USER_ID    = 0; // column A
const COL_EMAIL      = 3; // column D
const COL_STATUS     = 5; // column F
const COL_REVIEW_MESSAGE_ID = 6; // column G
const COL_INTERVIEW_CH = 7; // column H
const REQUIRED_FIELDS = ['userId', 'username', 'displayName', 'email', 'submittedAt', 'status'];

const ROW_LOOKUP_RETRIES = 4;
const ROW_LOOKUP_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findTargetApplicationRow(rows, userId, reviewMessageId = null) {
  if (!rows.length) return -1;

  if (reviewMessageId) {
    const byMessage = rows.findIndex((row) => row[COL_REVIEW_MESSAGE_ID] === reviewMessageId);
    return byMessage;
  }

  // Fallback: use the most recent open row for this user.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i][COL_USER_ID] === userId && ['Pending', 'Interview'].includes(rows[i][COL_STATUS])) {
      return i;
    }
  }

  // Final fallback: most recent row for this user.
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (rows[i][COL_USER_ID] === userId) return i;
  }

  return -1;
}

async function findTargetApplicationRowWithRetry(sheets, userId, reviewMessageId = null) {
  for (let attempt = 1; attempt <= ROW_LOOKUP_RETRIES; attempt += 1) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
    });

    const rows = res.data.values || [];
    const rowIndex = findTargetApplicationRow(rows, userId, reviewMessageId);
    if (rowIndex !== -1) {
      return rowIndex;
    }

    if (attempt < ROW_LOOKUP_RETRIES) {
      await sleep(ROW_LOOKUP_DELAY_MS);
    }
  }

  return -1;
}

/**
 * Validates required fields on an application object and returns a list of
 * missing field names (empty array = all good).
 *
 * @param {object} app
 * @returns {string[]}
 */
function validateApplication(app) {
  return REQUIRED_FIELDS.filter((f) => !app[f]);
}

/**
 * Appends one row to the Google Sheet for a new application submission.
 *
 * @param {{
 *   userId:             string,
 *   username:           string,
 *   displayName:        string,
 *   email:              string,
 *   submittedAt:        string,
 *   status:             string,
 *   reviewMessageId?:   string,
 *   interviewChannelId?: string,
 * }} application
 */
async function appendApplicationRow(application) {
  if (!process.env.GOOGLE_SHEET_ID) {
    console.warn('[SheetService] GOOGLE_SHEET_ID is not set — skipping sheet append.');
    return;
  }

  const missing = validateApplication(application);
  if (missing.length > 0) {
    console.error(`[SheetService] appendApplicationRow: missing required fields: ${missing.join(', ')}`);
    return;
  }

  const {
    userId,
    username,
    displayName,
    email,
    submittedAt,
    status,
    reviewMessageId   = '',
    interviewChannelId = '',
  } = application;

  try {
    const sheets = await getSheetsClient();

    await sheets.spreadsheets.values.append({
      spreadsheetId:   process.env.GOOGLE_SHEET_ID,
      range:           SHEET_RANGE,
      valueInputOption: 'RAW',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[userId, username, displayName, email, submittedAt, status, reviewMessageId, interviewChannelId]],
      },
    });

    console.log(`[SheetService] Appended row for ${username} (${userId})`);
  } catch (err) {
    console.error('[SheetService] appendApplicationRow failed:', err.message);
  }
}

/**
 * Checks whether a user ID or email already exists anywhere in the sheet.
 *
 * @param {string} userId
 * @param {string} email
 * @returns {Promise<{ userIdExists: boolean, emailExists: boolean }|null>}
 */
async function findSheetDuplicateSubmission(userId, email) {
  if (!process.env.GOOGLE_SHEET_ID) return null;

  const normalizedUserId = String(userId || '').trim();
  const normalizedEmail = String(email || '').toLowerCase().trim();

  try {
    const sheets = await getSheetsClient();
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: SHEET_RANGE,
    });

    const rows = res.data.values || [];
    let userIdExists = false;
    let emailExists = false;

    for (const row of rows) {
      const rowUserId = String(row[COL_USER_ID] || '').trim();
      const rowEmail = String(row[COL_EMAIL] || '').toLowerCase().trim();

      if (normalizedUserId && rowUserId === normalizedUserId) {
        userIdExists = true;
      }
      if (normalizedEmail && rowEmail === normalizedEmail) {
        emailExists = true;
      }

      if (userIdExists || emailExists) {
        break;
      }
    }

    return { userIdExists, emailExists };
  } catch (err) {
    console.error('[SheetService] findSheetDuplicateSubmission failed:', err.message);
    return null;
  }
}

/**
 * Updates the Status cell (column F) on the row matching userId (column A).
 * No-ops silently if GOOGLE_SHEET_ID is not set or the row isn't found.
 *
 * @param {string} userId
 * @param {string} status  e.g. 'Approved', 'Denied', 'Interview'
 * @param {string|null} reviewMessageId
 */
async function updateSheetApplicationStatus(userId, status, reviewMessageId = null) {
  if (!process.env.GOOGLE_SHEET_ID) return;

  try {
    const sheets = await getSheetsClient();
    const rowIndex = await findTargetApplicationRowWithRetry(sheets, userId, reviewMessageId);

    if (rowIndex === -1) {
      console.warn(`[SheetService] updateSheetApplicationStatus: no row found for userId ${userId}`);
      return;
    }

    const sheetRow    = rowIndex + 1; // Sheets API is 1-indexed
    const statusCol   = String.fromCharCode(65 + COL_STATUS); // 'F'

    await sheets.spreadsheets.values.update({
      spreadsheetId:   process.env.GOOGLE_SHEET_ID,
      range:           `Sheet1!${statusCol}${sheetRow}`,
      valueInputOption: 'RAW',
      requestBody:     { values: [[status]] },
    });

    console.log(`[SheetService] Status → '${status}' for userId ${userId}`);
  } catch (err) {
    console.error('[SheetService] updateSheetApplicationStatus failed:', err.message);
  }
}

/**
 * Updates both the Status cell (column F) and the InterviewChannelId cell (column H)
 * for the row matching userId (column A), in a single batchUpdate call.
 *
 * @param {string} userId
 * @param {string} channelId
 * @param {string|null} reviewMessageId
 */
async function setSheetInterviewData(userId, channelId, reviewMessageId = null) {
  if (!process.env.GOOGLE_SHEET_ID) return;

  try {
    const sheets = await getSheetsClient();
    const rowIndex = await findTargetApplicationRowWithRetry(sheets, userId, reviewMessageId);

    if (rowIndex === -1) {
      console.warn(`[SheetService] setSheetInterviewData: no row found for userId ${userId}`);
      return;
    }

    const sheetRow = rowIndex + 1; // Sheets API is 1-indexed
    const statusCol      = String.fromCharCode(65 + COL_STATUS);       // 'F'
    const interviewCol   = String.fromCharCode(65 + COL_INTERVIEW_CH); // 'H'

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `Sheet1!${statusCol}${sheetRow}`,    values: [['Interviewing']] },
          { range: `Sheet1!${interviewCol}${sheetRow}`, values: [[channelId]]   },
        ],
      },
    });

    console.log(`[SheetService] Interview data set for userId ${userId} → channel ${channelId}`);
  } catch (err) {
    console.error('[SheetService] setSheetInterviewData failed:', err.message);
  }
}

module.exports = {
  appendApplicationRow,
  findSheetDuplicateSubmission,
  updateSheetApplicationStatus,
  setSheetInterviewData,
};

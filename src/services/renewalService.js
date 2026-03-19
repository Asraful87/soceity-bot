const cron = require('node-cron');
const { getAllVerifiedMembers, upsertMember } = require('../database/db');
const { removeMemberRole, assignMemberRole } = require('./roleService');
const { getContactById } = require('./ghlService');

const WARNING_DAYS = 3;

// ── Feature Flag ──────────────────────────────────────────────────────────────
const MAINTENANCE_ENABLED = process.env.MEMBERSHIP_MAINTENANCE_ENABLED === 'true';

// ── Scheduler ─────────────────────────────────────────────────────────────────
/**
 * Starts the daily membership renewal checker.
 * Only active if MEMBERSHIP_MAINTENANCE_ENABLED=true in .env
 */
function startRenewalChecker(client) {
  if (!MAINTENANCE_ENABLED) {
    console.log('[RenewalChecker] ⚠️  Membership maintenance is DISABLED. Set MEMBERSHIP_MAINTENANCE_ENABLED=true to activate.');
    return;
  }

  // Runs daily at 08:00 UTC
  cron.schedule('0 8 * * *', async () => {
    console.log('[RenewalChecker] Daily check started.');
    await checkAllMemberships(client);
  });

  console.log('[RenewalChecker] ✅ Activated — runs daily at 08:00 UTC.');
}

// ── Main check ────────────────────────────────────────────────────────────────
async function checkAllMemberships(client) {
  let members;
  try {
    members = await getAllVerifiedMembers();
  } catch (err) {
    console.error('[RenewalChecker] DB error:', err);
    return;
  }

  const guild = client.guilds.cache.get(process.env.GUILD_ID);
  if (!guild) {
    console.error('[RenewalChecker] Guild not found.');
    return;
  }

  await guild.members.fetch();

  for (const dbMember of members) {
    try {
      await processMember(guild, dbMember);
    } catch (err) {
      console.error(`[RenewalChecker] Error for ${dbMember.discordId}:`, err.message);
    }
  }

  console.log(`[RenewalChecker] Checked ${members.length} member(s).`);
}

// ── Per-member logic ──────────────────────────────────────────────────────────
async function processMember(guild, dbMember) {
  if (!dbMember.renewalDate) return; // no expiry set — skip

  const guildMember = guild.members.cache.get(dbMember.discordId);
  if (!guildMember) {
    // User left — silently unverify
    await upsertMember({ ...dbMember, verified: 0 });
    return;
  }

  const now = new Date();
  const renewal = new Date(dbMember.renewalDate);
  const daysUntil = Math.ceil((renewal - now) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) {
    // Expired — remove role and check GHL for reactivation
    await handleExpiredMember(guild, guildMember, dbMember);
  } else if (daysUntil <= WARNING_DAYS) {
    // Expiring soon — send warning DM
    await sendWarningDM(guildMember, guild.name, daysUntil, renewal);
  }
}

// ── Handle expired member (check GHL for renewal) ────────────────────────────
/**
 * When a membership expires:
 * 1. Check GHL for payment status
 * 2. If renewed/paid → restore role
 * 3. If still unpaid → remove role
 */
async function handleExpiredMember(guild, guildMember, dbMember) {
  console.log(`[RenewalChecker] Checking ${dbMember.discordId} for renewal status...`);

  // Try to fetch fresh contact from GHL
  let ghlContact = null;
  if (dbMember.ghlContactId) {
    try {
      ghlContact = await getContactById(dbMember.ghlContactId);
    } catch (err) {
      console.error(`[RenewalChecker] Failed to fetch GHL contact ${dbMember.ghlContactId}:`, err.message);
    }
  }

  // Check if membership is now active again
  if (ghlContact) {
    const isActive = ghlContact.tags?.includes(process.env.GHL_ACTIVE_TAG) ||
                     ghlContact.customField?.membershipStatus === 'active';

    if (isActive && ghlContact.membershipExpiry) {
      // Renewed! Restore the role
      console.log(`[RenewalChecker] ✅ ${dbMember.discordId} has renewed — restoring role.`);
      try {
        await assignMemberRole(guildMember, ghlContact);
        await upsertMember({
          ...dbMember,
          verified: 1,
          renewalDate: ghlContact.membershipExpiry,
        });
        await guildMember.send(
          `✅ **Payment Received!**\n\n` +
          `Your membership payment has been processed and your member role has been restored.\n` +
          `Thank you for your continued support!`
        ).catch(() => {});
        return;
      } catch (err) {
        console.error(`[RenewalChecker] Failed to restore role for ${dbMember.discordId}:`, err.message);
      }
    }
  }

  // Not renewed — remove role
  await removeExpiredMember(guild, guildMember, dbMember);
}

// ── Remove expired member ─────────────────────────────────────────────────────
async function removeExpiredMember(guild, guildMember, dbMember) {
  console.log(`[RenewalChecker] Removing role — ${dbMember.discordId} (expired ${dbMember.renewalDate})`);

  await removeMemberRole(guildMember, 'Membership renewal date passed');
  await upsertMember({ ...dbMember, verified: 0 });

  try {
    await guildMember.send(
      `Your membership in **${guild.name}** has expired and your member role has been removed.\n` +
      `Please contact support or renew your membership to regain access.`
    );
  } catch {
    // DMs closed — not fatal
  }
}

// ── Warning DM ────────────────────────────────────────────────────────────────
async function sendWarningDM(guildMember, guildName, daysUntil, renewalDate) {
  const dateStr = renewalDate.toDateString();
  const dayWord = daysUntil === 1 ? 'day' : 'days';

  try {
    await guildMember.send(
      `⏰ **Membership Renewal Notice**\n\n` +
      `Your membership in **${guildName}** expires in **${daysUntil} ${dayWord}** (${dateStr}).\n` +
      `Please renew your membership to maintain your access.`
    );
    console.log(`[RenewalChecker] Warning DM sent to ${guildMember.user.tag} (${daysUntil}d left).`);
  } catch {
    // DMs closed — not fatal
  }
}

module.exports = { startRenewalChecker, checkAllMemberships };

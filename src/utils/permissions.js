const { PermissionFlagsBits } = require('discord.js');

/**
 * Returns true if the member has the Admin or Mod role configured in .env.
 * @param {GuildMember} member
 * @returns {boolean}
 */
function isStaff(member) {
  const { ADMIN_ROLE_ID, MOD_ROLE_ID } = process.env;
  return (
    (ADMIN_ROLE_ID && member.roles.cache.has(ADMIN_ROLE_ID)) ||
    (MOD_ROLE_ID && member.roles.cache.has(MOD_ROLE_ID))
  );
}

/**
 * Builds permission overwrites for a private application channel.
 *
 * - @everyone: deny ViewChannel
 * - applicant: allow ViewChannel + SendMessages + ReadMessageHistory
 * - Admin role (if configured): allow all
 */
function buildApplicantOverwrites(guild, applicantId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: applicantId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
  ];

  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (adminRoleId) {
    overwrites.push({
      id: adminRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const modRoleId = process.env.MOD_ROLE_ID;
  if (modRoleId) {
    overwrites.push({
      id: modRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return overwrites;
}

/**
 * Builds permission overwrites for a private interview channel.
 * Same as applicant overwrites but uses 'interview-' naming convention.
 * Bot client ID is also granted access.
 *
 * @param {Guild} guild
 * @param {string} applicantId
 * @param {string} botId  - client.user.id
 * @returns {Array}
 */
function buildInterviewOverwrites(guild, applicantId, botId) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: applicantId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    },
    {
      id: botId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
      ],
    },
  ];

  const adminRoleId = process.env.ADMIN_ROLE_ID;
  if (adminRoleId) {
    overwrites.push({
      id: adminRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  const modRoleId = process.env.MOD_ROLE_ID;
  if (modRoleId) {
    overwrites.push({
      id: modRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  return overwrites;
}

/**
 * Converts a Discord username or display name into a safe channel name.
 * - Lowercase
 * - Spaces replaced with hyphens
 * - Special characters removed
 * - Max 20 characters
 *
 * @param {string} name
 * @returns {string}
 */
function toChannelName(name) {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')       // collapse consecutive hyphens
    .replace(/^-+|-+$/g, '')   // trim leading/trailing hyphens
    .slice(0, 20);
}

module.exports = { isStaff, buildApplicantOverwrites, buildInterviewOverwrites, toChannelName };

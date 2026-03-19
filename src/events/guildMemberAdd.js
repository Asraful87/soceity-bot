module.exports = {
  name: 'guildMemberAdd',
  once: false,

  async execute(member) {
    const unverifiedRoleId = process.env.UNVERIFIED_ROLE_ID;
    if (!unverifiedRoleId) return;

    try {
      await member.roles.add(unverifiedRoleId, 'Auto-assigned on join');
      console.log(`[guildMemberAdd] Assigned Unverified role to ${member.user.tag}`);
    } catch (err) {
      console.error(`[guildMemberAdd] Failed to assign role to ${member.user.tag}:`, err.message);
    }
  },
};

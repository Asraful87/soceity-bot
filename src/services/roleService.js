/**
 * Assigns a role to a guild member by role ID.
 */
async function assignRole(member, roleId, reason) {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) throw new Error(`Role ${roleId} not found in guild.`);
  await member.roles.add(role, reason);
}

/**
 * Removes a role from a guild member by role ID.
 * Silently no-ops if the role doesn't exist or the member doesn't have it.
 */
async function removeRole(member, roleId, reason) {
  const role = member.guild.roles.cache.get(roleId);
  if (!role) return;
  if (!member.roles.cache.has(roleId)) return;
  await member.roles.remove(role, reason);
}

/**
 * Assigns the Verified role to a guild member based on GHL contact.
 * Removes Applicant role if assigned.
 * @param {GuildMember} member - Discord guild member
 * @param {Object} contact - GHL contact object
 */
async function assignMemberRole(member, contact) {
  const verifiedRoleId = process.env.VERIFIED_ROLE_ID;
  const applicantRoleId = process.env.APPLICANT_ROLE_ID;

  if (!verifiedRoleId) {
    throw new Error('VERIFIED_ROLE_ID is not configured in .env');
  }

  try {
    // Assign verified role
    await assignRole(member, verifiedRoleId, `Membership verified via GHL (${contact.email})`);

    // Remove applicant role if present
    if (applicantRoleId) {
      await removeRole(member, applicantRoleId, 'Application approved - member verified');
    }

    console.log(`[RoleService] Assigned verified role to ${member.user.tag}`);
  } catch (err) {
    console.error(`[RoleService] Failed to assign member role to ${member.user.tag}:`, err.message);
    throw err;
  }
}

/**
 * Removes the Verified role from a guild member.
 * Called when membership expires or is cancelled.
 * @param {GuildMember} member - Discord guild member
 * @param {string} reason - Reason for removal
 */
async function removeMemberRole(member, reason) {
  const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

  if (!verifiedRoleId) {
    console.warn('[RoleService] VERIFIED_ROLE_ID is not configured');
    return;
  }

  try {
    await removeRole(member, verifiedRoleId, reason);
    console.log(`[RoleService] Removed verified role from ${member.user.tag} (${reason})`);
  } catch (err) {
    console.error(`[RoleService] Failed to remove member role from ${member.user.tag}:`, err.message);
    throw err;
  }
}

module.exports = { assignRole, removeRole, assignMemberRole, removeMemberRole };

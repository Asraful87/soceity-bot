const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { lookupContactByEmail } = require('../services/ghlService');
const { assignMemberRole, removeMemberRole } = require('../services/roleService');
const { upsertMember, getMemberByDiscordId } = require('../database/db');
const { appendVerificationRow } = require('../services/sheetService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verify your membership using your registered email.')
    .addStringOption(opt =>
      opt.setName('email')
        .setDescription('The email address associated with your membership')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const rawEmail = interaction.options.getString('email');
    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(rawEmail)) {
      return interaction.editReply({ content: 'Please provide a valid email address.' });
    }

    // Sanitize: lowercase and trim only
    const email = rawEmail.toLowerCase().trim();
    const discordId = interaction.user.id;
    const member = interaction.member;

    try {
      // Check if already verified
      const existing = await getMemberByDiscordId(discordId);
      if (existing && existing.verified) {
        return interaction.editReply({ content: 'Your membership has already been verified.' });
      }

      // Look up contact in GoHighLevel
      const contact = await lookupContactByEmail(email);

      if (!contact) {
        return interaction.editReply({
          content: 'No active membership found for that email. Please check your email or contact support.',
        });
      }

      const isActive = contact.tags?.includes(process.env.GHL_ACTIVE_TAG) ||
                       contact.customField?.membershipStatus === 'active';

      if (!isActive) {
        return interaction.editReply({
          content: 'Your membership does not appear to be active. Please contact support.',
        });
      }

      // Assign role
      await assignMemberRole(member, contact);

      // Save to database
      await upsertMember({
        discordId,
        discordTag: interaction.user.tag,
        email,
        ghlContactId: contact.id,
        verified: 1,
        membershipExpiry: contact.membershipExpiry || null,
      });

      // Log to Google Sheet
      await appendVerificationRow({
        discordId,
        discordTag: interaction.user.tag,
        email,
        ghlContactId: contact.id,
        verifiedAt: new Date().toISOString(),
      });

      const embed = new EmbedBuilder()
        .setColor(0x00cc66)
        .setTitle('Verification Successful')
        .setDescription(`Welcome, ${interaction.user}! Your membership has been verified and your role has been assigned.`)
        .addFields({ name: 'Email', value: email })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Verify command error:', err);
      return interaction.editReply({ content: 'An error occurred during verification. Please try again later.' });
    }
  },
};

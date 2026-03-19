const { EmbedBuilder } = require('discord.js');
const { assignRole, removeRole } = require('../../services/roleService');
const { updateApplicationStatus, getApplicationByUserId } = require('../../database/db');
const { updateSheetApplicationStatus } = require('../../services/sheetService');

module.exports = {
  // customId format: approve_reason_<userId>_<channelId>_<messageId>
  customId: 'approve_reason',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Parse encoded values from customId: approve_reason_<userId>_<channelId>_<messageId>
    const parts     = interaction.customId.split('_');
    // ['approve', 'reason', userId, channelId, messageId]
    const userId    = parts[2];
    const channelId = parts[3];
    const messageId = parts[4];
    const rawReason = interaction.fields.getTextInputValue('reason');
    const reason    = rawReason?.trim() || 'No reason provided.';
    const guild     = interaction.guild;

    if (!process.env.VERIFIED_ROLE_ID) {
      return interaction.editReply({ content: '`VERIFIED_ROLE_ID` is not configured in .env.' });
    }

    // Guard: check current DB status
    const application = await getApplicationByUserId(userId).catch(() => null);
    if (!application) {
      return interaction.editReply({ content: 'No application record found for this user.' });
    }
    if (application.status === 'approved' || application.status === 'denied') {
      const errorEmbed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Blocked Action')
        .setDescription(
          `You cannot approve this user because they already have the <@&${process.env.VERIFIED_ROLE_ID}> role.`
        );
      return interaction.editReply({ embeds: [errorEmbed] });
    }

    let applicant;
    try {
      applicant = await guild.members.fetch(userId);
    } catch {
      return interaction.editReply({ content: 'This member could not be found. They may have left the server.' });
    }

    try {
      const approvedAt  = new Date();
      const approvedISO = approvedAt.toISOString();
      const unixTs      = Math.floor(approvedAt.getTime() / 1000);

      // Assign Verified role, remove Applicant role
      await assignRole(applicant, process.env.VERIFIED_ROLE_ID, `Approved by ${interaction.user.tag}`);
      if (process.env.APPLICANT_ROLE_ID) {
        await removeRole(applicant, process.env.APPLICANT_ROLE_ID, 'Application approved');
      }

      // Update DB
      await updateApplicationStatus(userId, 'approved', approvedISO);

      // Replace review message with Tickety-style result embed
      try {
        const channel  = await guild.channels.fetch(channelId);
        const message  = await channel.messages.fetch(messageId);
        const original = message.embeds[0];
        const thumb    = original?.thumbnail?.url
          || applicant.user.displayAvatarURL({ dynamic: true });

        const resultEmbed = new EmbedBuilder()
          .setColor(0x57F287)
          .setDescription(
            `The application of <@${userId}> has been **accepted** by <@${interaction.user.id}>.`
          )
          .setThumbnail(thumb)
          .addFields(
            { name: 'Panel',       value: 'Email Address',             inline: true  },
            { name: 'Reason',      value: reason                                      },
            { name: 'Accepted On', value: `<t:${unixTs}:F>`,          inline: true  }
          )
          .setFooter({ text: guild.name })
          .setTimestamp();

        await message.edit({ embeds: [resultEmbed], components: [] });
      } catch {
        // Non-fatal — message may have been deleted or channel inaccessible
      }

      // Update Google Sheet status on the matching review message row (non-fatal)
      updateSheetApplicationStatus(userId, 'Approved', messageId).catch(() => {});

      // DM the applicant (non-fatal)
      try {
        await applicant.send(
          `✅ Your application to **${guild.name}** has been **approved**! Welcome aboard.\n` +
          `You now have access to member channels.`
        );
      } catch {
        // DMs disabled — not fatal
      }

      const confirmationEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Application Reviewed')
        .setDescription(
          `You have successfully accepted the application of <@${userId}>.`
        );

      await interaction.editReply({ embeds: [confirmationEmbed] });
      console.log(`[Approve] ${interaction.user.tag} approved <@${userId}> at ${approvedISO}`);
    } catch (err) {
      console.error('[Approve] Error:', err);
      await interaction.editReply({ content: 'An error occurred while processing the approval. Please try again.' });
    }
  },
};

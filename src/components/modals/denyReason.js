const { EmbedBuilder } = require('discord.js');
const { removeRole } = require('../../services/roleService');
const { updateApplicationStatus, getApplicationByUserId } = require('../../database/db');
const { updateSheetApplicationStatus } = require('../../services/sheetService');

module.exports = {
  // customId format: deny_reason_<userId>_<channelId>_<messageId>
  customId: 'deny_reason',

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // Parse encoded values from customId: deny_reason_<userId>_<channelId>_<messageId>
    const parts     = interaction.customId.split('_');
    // ['deny', 'reason', userId, channelId, messageId]
    const userId    = parts[2];
    const channelId = parts[3];
    const messageId = parts[4];
    const rawReason = interaction.fields.getTextInputValue('reason');
    const reason    = rawReason?.trim() || 'No reason provided.';
    const guild     = interaction.guild;

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
          `You cannot deny this user because their application has already been **${application.status}**.`
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
      const deniedAt  = new Date();
      const deniedISO = deniedAt.toISOString();
      const unixTs    = Math.floor(deniedAt.getTime() / 1000);

      // Remove Applicant role if present
      if (process.env.APPLICANT_ROLE_ID) {
        await removeRole(applicant, process.env.APPLICANT_ROLE_ID, `Application denied by ${interaction.user.tag}`);
      }

      // Update DB
      await updateApplicationStatus(userId, 'denied', deniedISO);

      // Replace review message with Tickety-style result embed
      try {
        const channel  = await guild.channels.fetch(channelId);
        const message  = await channel.messages.fetch(messageId);
        const original = message.embeds[0];
        const thumb    = original?.thumbnail?.url
          || applicant.user.displayAvatarURL({ dynamic: true });

        const resultEmbed = new EmbedBuilder()
          .setColor(0xED4245)
          .setDescription(
            `The application of <@${userId}> has been **denied** by <@${interaction.user.id}>.`
          )
          .setThumbnail(thumb)
          .addFields(
            { name: 'Panel',    value: 'Email Address',         inline: true },
            { name: 'Reason',   value: reason                               },
            { name: 'Denied On', value: `<t:${unixTs}:F>`,    inline: true }
          )
          .setFooter({ text: guild.name })
          .setTimestamp();

        await message.edit({ embeds: [resultEmbed], components: [] });
      } catch {
        // Non-fatal — message may have been deleted or channel inaccessible
      }

      // Update Google Sheet status on the matching review message row (non-fatal)
      updateSheetApplicationStatus(userId, 'Denied', messageId).catch(() => {});

      // DM the applicant (non-fatal)
      try {
        await applicant.send(
          `❌ Your application to **${guild.name}** has been **denied**.\n` +
          `If you believe this is a mistake, please contact staff.`
        );
      } catch {
        // DMs disabled — not fatal
      }

      const confirmationEmbed = new EmbedBuilder()
        .setColor(0x3498DB)
        .setTitle('Application Reviewed')
        .setDescription(
          `You have successfully denied the application of <@${userId}>.`
        );

      await interaction.editReply({ embeds: [confirmationEmbed] });
      console.log(`[Deny] ${interaction.user.tag} denied <@${userId}> at ${deniedISO}`);
    } catch (err) {
      console.error('[Deny] Error:', err);
      await interaction.editReply({ content: 'An error occurred while processing the denial. Please try again.' });
    }
  },
};

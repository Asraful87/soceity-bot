const { ChannelType, ActionRowBuilder, ButtonBuilder, EmbedBuilder } = require('discord.js');
const { isStaff, buildInterviewOverwrites, toChannelName } = require('../../utils/permissions');
const { setInterviewChannel, getApplicationByUserId } = require('../../database/db');
const { setSheetInterviewData } = require('../../services/sheetService');

module.exports = {
  // customId format: interview_application_<userId>
  customId: 'interview_application',

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this action.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const userId = interaction.customId.replace('interview_application_', '');
    const guild = interaction.guild;
    const client = interaction.client;

    let applicant;
    try {
      applicant = await guild.members.fetch(userId);
    } catch {
      return interaction.editReply({ content: 'This member could not be found. They may have left the server.' });
    }
    // Guard: verify an application record exists for this user
    const application = await getApplicationByUserId(userId).catch(() => null);
    if (!application) {
      return interaction.editReply({ content: 'No application record found for this user.' });
    }
    if (application.status === 'approved' || application.status === 'denied') {
      return interaction.editReply({ content: `This application is already **${application.status}** and cannot be moved to interview.` });
    }
    // Guard: check DB for a stored interview channel first (most reliable)
    if (application.interview_channel_id) {
      const storedCh = guild.channels.cache.get(application.interview_channel_id);
      if (storedCh) {
        return interaction.editReply({ content: `An interview channel already exists for this applicant: ${storedCh}` });
      }
    }
    try {
      // ── Guard: check if interview channel already exists by name ─────────────
      const expectedName = `interview-${toChannelName(applicant.user.username)}`;
      const existing = guild.channels.cache.find(
        (ch) => ch.name === expectedName && ch.type === ChannelType.GuildText
      );
      if (existing) {
        return interaction.editReply({ content: `An interview channel already exists for this applicant: ${existing}` });
      }

      // ── Create the interview channel ─────────────────────────────────────────
      const channelOptions = {
        name: expectedName,
        type: ChannelType.GuildText,
        topic: `Interview channel for ${applicant.user.tag}`,
        permissionOverwrites: buildInterviewOverwrites(guild, userId, client.user.id),
      };
      if (process.env.APPLICATION_CATEGORY_ID) {
        channelOptions.parent = process.env.APPLICATION_CATEGORY_ID;
      }

      const interviewChannel = await guild.channels.create(channelOptions);

      // ── Welcome message inside the interview channel ──────────────────────────
      await interviewChannel.send({
        content: `Welcome ${applicant}! We're looking forward to speaking with you.`,
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle('📋 Interview')
            .setDescription(
              `Hi ${applicant}! 👋\n\n` +
              `A staff member will be with you shortly to conduct your interview.\n` +
              `Please feel free to introduce yourself in the meantime.`
            )
            .setFooter({ text: `Initiated by ${interaction.user.tag}` })
            .setTimestamp(),
        ],
      });

      // ── Disable only the Interview button on the review message ───────────────
      try {
        await interaction.message.edit({
          components: disableInterviewButton(interaction),
        });
      } catch {
        // Non-fatal — message may have been deleted
      }

      // Update DB: set status → 'interview' and save the channel id
      await setInterviewChannel(userId, interviewChannel.id);

      // Update Google Sheet on this review message row: status → 'Interview' + interviewChannelId (non-fatal)
      setSheetInterviewData(userId, interviewChannel.id, interaction.message.id).catch(() => {});

      await interaction.editReply({
        content: `\ud83d\udccb Interview channel created: ${interviewChannel}`,
      });
      console.log(`[Interview] ${interaction.user.tag} created ${interviewChannel.name} for ${applicant.user.tag}`);
    } catch (err) {
      console.error('[Interview] Error:', err);
      await interaction.editReply({ content: 'An error occurred while creating the interview channel. Please try again.' });
    }
  },
};

function disableInterviewButton(interaction) {
  return interaction.message.components.map((row) => {
    const newRow = new ActionRowBuilder();
    newRow.addComponents(
      row.components.map((btn) =>
        btn.customId?.startsWith('interview_application_')
          ? ButtonBuilder.from(btn).setDisabled(true)
          : ButtonBuilder.from(btn)
      )
    );
    return newRow;
  });
}


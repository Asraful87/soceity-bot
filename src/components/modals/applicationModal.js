const { postToReviewChannel, postReviewLog } = require('../../services/channelService');
const { appendApplicationRow, findSheetDuplicateSubmission } = require('../../services/sheetService');
const {
  findOpenApplicationConflict,
  createApplication,
  setApplicationReviewMessage,
  deleteOpenApplication,
} = require('../../database/db');
const { isStaff } = require('../../utils/permissions');

const DUPLICATE_CHECK_BYPASS_USER_IDS = new Set(['1097428165963558914']);

module.exports = {
  customId: 'application_modal',

  async execute(interaction) {
    try {
      const bypassDuplicateChecks = DUPLICATE_CHECK_BYPASS_USER_IDS.has(interaction.user.id);

      const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

      if (isStaff(interaction.member)) {
        return interaction.reply({
          content: 'Admin or Mod cannot use this.',
          ephemeral: true,
        });
      }

      if (verifiedRoleId && interaction.member.roles.cache.has(verifiedRoleId)) {
        return interaction.reply({
          content: 'You have already submitted an application or been verified.',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const rawEmail = interaction.fields.getTextInputValue('application_email');

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(rawEmail)) {
        return interaction.editReply({ content: 'Please enter a valid email address and try again.' });
      }

      const email = rawEmail.toLowerCase().trim();
      const { user, member, guild } = interaction;
      const submitDate = new Date();

      if (!bypassDuplicateChecks) {
        // Block duplicates if user ID/email already exists in Google Sheets.
        const sheetDuplicate = await findSheetDuplicateSubmission(user.id, email);
        if (sheetDuplicate?.userIdExists || sheetDuplicate?.emailExists) {
          const reasons = [];
          if (sheetDuplicate.userIdExists) reasons.push('user ID already exists in sheet');
          if (sheetDuplicate.emailExists) reasons.push('email already exists in sheet');

          const reasonText = reasons.join(' and ');
          postReviewLog({
            guild,
            text: `Duplicate/cheating attempt blocked: ${user.tag} (${user.id}) tried to submit with ${email} (${reasonText}).`,
          }).catch(() => {});

          return interaction.editReply({
            content: `Duplicate Submission Detected: ${reasonText}. Your application was not submitted.`,
          });
        }

        // Block duplicate open applications by user ID, email, or username.
        const conflict = await findOpenApplicationConflict({
          userId: user.id,
          username: user.username,
          email,
        });
        if (conflict) {
          if (conflict.type === 'user') {
            postReviewLog({
              guild,
              text: `Duplicate blocked (User ID): ${user.tag} (${user.id}) tried to resubmit while status is ${conflict.row.status}.`,
            }).catch(() => {});
            return interaction.editReply({ content: 'Duplicate Application: You already have a pending or interview application.' });
          }

          if (conflict.type === 'email') {
            postReviewLog({
              guild,
              text: `Duplicate blocked (Email): ${user.tag} (${user.id}) tried email ${email} which is already open on <@${conflict.row.user_id}>.`,
            }).catch(() => {});
            return interaction.editReply({ content: 'Email Conflict: This email is already associated with a pending or interview application.' });
          }

          postReviewLog({
            guild,
            text: `Duplicate blocked (Username): ${user.tag} (${user.id}) has username ${user.username} matching another open application.`,
          }).catch(() => {});
          return interaction.editReply({ content: 'Username Conflict: This username is already associated with a pending or interview application.' });
        }
      }

      // Reserve an open application slot first so users cannot submit duplicates.
      await createApplication({
        userId: user.id,
        username: user.username,
        displayName: member.displayName,
        email,
        submittedAt: submitDate.toISOString(),
        reviewMessageId: null,
        reviewChannelId: null,
      });

      let reviewMessage;
      try {
        reviewMessage = await postToReviewChannel({ guild, member, user, email, submitDate });
      } catch (postErr) {
        // Roll back reserved slot so the applicant can retry if review posting fails.
        await deleteOpenApplication(user.id).catch(() => {});
        throw postErr;
      }

      await setApplicationReviewMessage(user.id, reviewMessage.id, reviewMessage.channelId);

      // Log to Google Sheets in the background so interaction replies immediately.
      appendApplicationRow({
        userId:          user.id,
        username:        user.username,
        displayName:     member.displayName,
        email,
        submittedAt:     submitDate.toISOString(),
        status:          'Pending',
        reviewMessageId: reviewMessage.id,
        interviewChannelId: '',
      }).catch((sheetErr) => {
        console.error('[ApplicationModal] Sheet log failed (non-fatal):', sheetErr.message);
      });

      await interaction.editReply({
        content: '✅ Your application has been submitted for review.',
      });

      console.log(`[ApplicationModal] ${user.tag} (${user.id}) submitted — review message: ${reviewMessage.id}`);
    } catch (err) {
      if (err?.code === 'OPEN_APPLICATION_EXISTS') {
        return interaction.editReply({ content: 'Duplicate Application: You already have a pending or interview application.' });
      }

      console.error('[ApplicationModal] Error:', err);
      await interaction.editReply({
        content: 'An error occurred while submitting your application. Please try again later.',
      });
    }
  },
};

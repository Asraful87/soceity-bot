const { buildApplicationEmbed, buildReviewRow } = require('../utils/embeds');
const { assignRole } = require('./roleService');

async function getReviewChannel(guild) {
  const reviewChannelId = process.env.REVIEW_CHANNEL_ID;
  if (!reviewChannelId) throw new Error('REVIEW_CHANNEL_ID is not configured in .env');

  const channel = guild.channels.cache.get(reviewChannelId)
    ?? await guild.channels.fetch(reviewChannelId);
  if (!channel) throw new Error(`Review channel ${reviewChannelId} not found.`);
  return channel;
}

/**
 * Posts the application embed + action buttons to the configured review channel
 * and optionally assigns the Applicant role.
 *
 * @returns {Promise<Message>} The sent review message.
 */
async function postToReviewChannel({ guild, member, user, email, submitDate }) {
  const channel = await getReviewChannel(guild);

  if (process.env.APPLICANT_ROLE_ID) {
    await assignRole(member, process.env.APPLICANT_ROLE_ID, 'Application submitted');
  }

  const message = await channel.send({
    embeds: [buildApplicationEmbed({ user, member, email, submitDate })],
    components: [buildReviewRow(user.id)],
  });

  return message;
}

async function postReviewLog({ guild, text }) {
  try {
    const channel = await getReviewChannel(guild);
    await channel.send({ content: `⚠️ ${text}` });
  } catch (err) {
    console.error('[ChannelService] postReviewLog failed:', err.message);
  }
}

module.exports = { postToReviewChannel, postReviewLog };

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// ── Panel embed ───────────────────────────────────────────────────────────────
function buildPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('📋 Membership Application')
    .setDescription(
      'Click the button below to submit your application.\n' +
      'You will be asked to provide your email address.'
    )
    .setFooter({ text: 'Applications are reviewed by our admin team.' })
    .setTimestamp();
}

function buildPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('submit_application')
      .setLabel('Submit Application')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝')
  );
}

// ── Application review embed ───────────────────────────────────────────────────
function buildApplicationEmbed({ user, member, email, submitDate }) {
  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setAuthor({ name: member.displayName, iconURL: user.displayAvatarURL({ dynamic: true }) })
    .setDescription(`<@${user.id}> has submitted an application for **Email Address**.`)
    .addFields(
      { name: '1. What is your email address?', value: email }
    )
    .setFooter({ text: member.guild.name })
    .setTimestamp(new Date(submitDate));
}

// ── Approve / Deny / Interview button row ────────────────────────────────────
function buildReviewRow(applicantId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`approve_application_${applicantId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success)
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`deny_application_${applicantId}`)
      .setLabel('Deny')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('❌'),
    new ButtonBuilder()
      .setCustomId(`interview_application_${applicantId}`)
      .setLabel('Open Interview')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📋')
  );
}

// ── Update status field on an existing review embed ──────────────────────────
/**
 * Rebuilds a review embed with an updated Status field and new colour.
 * @param {import('discord.js').Embed} originalEmbed  raw embed from interaction.message.embeds[0]
 * @param {string} statusText  e.g. '✅ Approved'
 * @param {number} color       hex colour integer
 * @returns {EmbedBuilder}
 */
function updateReviewEmbedStatus(originalEmbed, statusText, color) {
  const updatedFields = originalEmbed.fields.map((f) =>
    f.name === 'Status' ? { name: f.name, value: statusText, inline: f.inline } : f
  );
  return EmbedBuilder.from(originalEmbed).setColor(color).setFields(updatedFields);
}

module.exports = { buildPanelEmbed, buildPanelRow, buildApplicationEmbed, buildReviewRow, updateReviewEmbedStatus };


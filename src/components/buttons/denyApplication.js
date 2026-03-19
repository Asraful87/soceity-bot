const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { isStaff } = require('../../utils/permissions');

module.exports = {
  // customId format: deny_application_<userId>
  customId: 'deny_application',

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', ephemeral: true });
    }

    const userId    = interaction.customId.replace('deny_application_', '');
    const channelId = interaction.channelId;
    const messageId = interaction.message.id;

    const modal = new ModalBuilder()
      .setCustomId(`deny_reason_${userId}_${channelId}_${messageId}`)
      .setTitle('Deny Application');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for denial')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Your application does not meet our requirements.')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

    await interaction.showModal(modal);
  },
};

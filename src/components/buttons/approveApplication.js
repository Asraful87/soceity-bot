const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { isStaff } = require('../../utils/permissions');

module.exports = {
  // customId format: approve_application_<userId>
  customId: 'approve_application',

  async execute(interaction) {
    if (!isStaff(interaction.member)) {
      return interaction.reply({ content: 'You do not have permission to use this feature.', ephemeral: true });
    }

    const userId    = interaction.customId.replace('approve_application_', '');
    const channelId = interaction.channelId;
    const messageId = interaction.message.id;

    const modal = new ModalBuilder()
      .setCustomId(`approve_reason_${userId}_${channelId}_${messageId}`)
      .setTitle('Approve Application');

    const reasonInput = new TextInputBuilder()
      .setCustomId('reason')
      .setLabel('Reason for approval')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('Your application meets our needs.')
      .setRequired(false)
      .setMaxLength(500);

    modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));

    await interaction.showModal(modal);
  },
};

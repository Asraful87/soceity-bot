const { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { isStaff } = require('../../utils/permissions');

module.exports = {
  customId: 'submit_application',

  async execute(interaction) {
    const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

    if (isStaff(interaction.member)) {
      return interaction.reply({
        content: 'Administrators and Moderators cannot use this feature.',
        ephemeral: true,
      });
    }

    if (verifiedRoleId && interaction.member.roles.cache.has(verifiedRoleId)) {
      return interaction.reply({
        content: 'You have already submitted an application or been verified.',
        ephemeral: true,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('application_modal')
      .setTitle('Membership Verification');

    const emailInput = new TextInputBuilder()
      .setCustomId('application_email')
      .setLabel('What is your email address?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('you@example.com')
      .setRequired(true)
      .setMinLength(5)
      .setMaxLength(254);

    modal.addComponents(new ActionRowBuilder().addComponents(emailInput));
    await interaction.showModal(modal);
  },
};

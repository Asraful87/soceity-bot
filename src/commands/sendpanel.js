const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { buildPanelEmbed, buildPanelRow } = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('sendpanel')
    .setDescription('Send the membership application panel to this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.reply({ content: '✅ Membership application panel sent successfully.', ephemeral: true });
    await interaction.channel.send({ embeds: [buildPanelEmbed()], components: [buildPanelRow()] });
  },
};

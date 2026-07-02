'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (error) {
      console.error(`Error ejecutando /${interaction.commandName}:`, error);

      const embed = new EmbedBuilder()
        .setTitle('❌ Ocurrió un error')
        .setColor(config.colors.danger)
        .setDescription('Algo falló al ejecutar el comando. Intentá de nuevo en unos segundos.');

      const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(payload).catch(() => null);
      } else {
        await interaction.reply(payload).catch(() => null);
      }
    }
  },
};

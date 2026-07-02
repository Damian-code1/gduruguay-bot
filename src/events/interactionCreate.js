'use strict';

const { EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../config');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
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
      return;
    }

    if (interaction.isButton()) {
      const [namespace, ownerId, pageStr] = interaction.customId.split(':');
      if (namespace !== 'cmds') return;

      const command = interaction.client.commands.get('cmds');
      if (!command?.handleButton) return;

      try {
        await command.handleButton(interaction, ownerId, parseInt(pageStr, 10));
      } catch (error) {
        console.error('Error manejando botón de /cmds:', error);
        await interaction
          .reply({ content: 'Ocurrió un error al cambiar de página.', flags: MessageFlags.Ephemeral })
          .catch(() => null);
      }
    }
  },
};
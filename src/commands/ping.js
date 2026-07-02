'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { replyEmbed } = require('../utils/respond');

module.exports = {
  visibility: 'public',
  data: new SlashCommandBuilder().setName('ping').setDescription('Muestra la latencia del bot.'),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong')
      .setColor(config.colors.info)
      .setDescription(`Latencia del WebSocket: **${interaction.client.ws.ping}ms**`);

    return replyEmbed(interaction, { embed });
  },
};

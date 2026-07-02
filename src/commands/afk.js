'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { replyEmbed } = require('../utils/respond');
const { setAfk } = require('../utils/afkStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('Te marca como AFK. Se quita automáticamente cuando volvés a escribir.')
    .addStringOption((opt) => opt.setName('razon').setDescription('Motivo (opcional)').setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    const razon = interaction.options.getString('razon') || 'AFK';
    await setAfk(interaction.guildId, interaction.user.id, razon);

    const embed = new EmbedBuilder()
      .setTitle('💤 Ahora estás AFK')
      .setColor(config.colors.info)
      .setDescription(`Motivo: ${razon}`)
      .setTimestamp();

    return replyEmbed(interaction, { embed });
  },
};

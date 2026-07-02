'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError } = require('../utils/respond');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('slowmode')
    .setDescription('Configura el modo lento del canal actual.')
    .addIntegerOption((opt) =>
      opt.setName('segundos').setDescription('Segundos entre mensajes (0 para desactivar, máx 21600)').setMinValue(0).setMaxValue(21600).setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const segundos = interaction.options.getInteger('segundos', true);

    if (!interaction.channel.setRateLimitPerUser) {
      return replyError(interaction, 'Este tipo de canal no soporta modo lento.');
    }

    await interaction.channel.setRateLimitPerUser(segundos, `Modificado por ${interaction.user.tag}`);

    const embed = new EmbedBuilder()
      .setTitle('🐌 Modo lento actualizado')
      .setColor(config.colors.success)
      .setDescription(segundos === 0 ? 'Modo lento desactivado.' : `Modo lento configurado a **${segundos}s** en <#${interaction.channelId}>.`)
      .setTimestamp();

    return replyEmbed(interaction, { embed });
  },
};

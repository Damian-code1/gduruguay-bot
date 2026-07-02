'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError } = require('../utils/respond');
const { buildDmLogPayload } = require('../utils/dmLogUi');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dmreplies')
    .setDescription('Muestra el historial de DMs que envió el bot (paginado).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyError(interaction, 'Solo administradores pueden usar este comando.');
    }

    const payload = await buildDmLogPayload(0);
    return interaction.reply(payload);
  },
};

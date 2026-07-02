'use strict';

const { SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');
const config = require('../config');
const { replyError } = require('../utils/respond');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Hace que el bot envíe un mensaje en un canal.')
    .addStringOption((opt) => opt.setName('mensaje').setDescription('Texto a enviar').setRequired(true))
    .addChannelOption((opt) =>
      opt
        .setName('canal')
        .setDescription('Canal donde enviar (por defecto, el canal actual)')
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addAttachmentOption((opt) => opt.setName('adjunto').setDescription('Imagen o archivo adjunto (opcional)').setRequired(false))
    .setDMPermission(false),

  async execute(interaction) {
    if (interaction.user.id !== config.ownerId) {
      return replyError(interaction, 'Este comando es exclusivo del dueño del bot.');
    }

    const mensaje = interaction.options.getString('mensaje', true);
    const canal = interaction.options.getChannel('canal') || interaction.channel;
    const adjunto = interaction.options.getAttachment('adjunto');

    if (!canal?.isTextBased?.()) {
      return replyError(interaction, 'Ese canal no admite mensajes de texto.');
    }

    const permissions = canal.permissionsFor(interaction.guild.members.me);
    if (!permissions?.has('SendMessages') || !permissions?.has('ViewChannel')) {
      return replyError(interaction, `No tengo permisos para enviar mensajes en <#${canal.id}>.`);
    }

    try {
      await canal.send({
        content: mensaje,
        files: adjunto ? [adjunto.url] : [],
      });
    } catch (err) {
      console.error('[say] Error enviando mensaje:', err);
      return replyError(interaction, 'No se pudo enviar el mensaje. Revisá el canal y mis permisos.');
    }

    return interaction.reply({
      content: `✅ Mensaje enviado en <#${canal.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};

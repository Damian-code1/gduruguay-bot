'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');
const { logDm } = require('../utils/dmLogStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Envía un mensaje directo a un usuario desde el bot.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a quien enviar el DM').setRequired(true))
    .addStringOption((opt) => opt.setName('mensaje').setDescription('Texto del mensaje').setRequired(true))
    .addAttachmentOption((opt) => opt.setName('adjunto').setDescription('Imagen o archivo adjunto (opcional)').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyError(interaction, 'Solo administradores pueden usar este comando.');
    }

    const targetUser = interaction.options.getUser('usuario', true);
    const mensaje = interaction.options.getString('mensaje', true);
    const adjunto = interaction.options.getAttachment('adjunto');

    if (targetUser.bot) {
      return replyError(interaction, 'No podés enviarle un DM a un bot.');
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let delivered = true;
    let errorReason = null;

    try {
      await targetUser.send({
        content: mensaje,
        files: adjunto ? [adjunto.url] : [],
      });
    } catch (err) {
      delivered = false;
      errorReason = err?.code === 50007 ? 'El usuario tiene los DMs cerrados o no comparte servidor con el bot.' : 'Error desconocido al enviar el DM.';
      console.error('[dm] Error enviando DM:', err);
    }

    await logDm({
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      senderId: interaction.user.id,
      senderTag: interaction.user.tag,
      content: mensaje,
      attachmentUrl: adjunto?.url || null,
      delivered,
    });

    const embed = new EmbedBuilder()
      .setTitle(delivered ? '✅ DM enviado' : '⚠️ No se pudo entregar el DM')
      .setColor(delivered ? config.colors.success : config.colors.warning)
      .addFields(
        { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Enviado por', value: interaction.user.tag, inline: true },
        { name: 'Mensaje', value: mensaje.length > 1000 ? `${mensaje.slice(0, 1000)}…` : mensaje },
      )
      .setTimestamp();

    if (adjunto) embed.addFields({ name: 'Adjunto', value: adjunto.url });
    if (!delivered) embed.addFields({ name: 'Motivo', value: errorReason });

    return replyEmbed(interaction, { embed });
  },
};

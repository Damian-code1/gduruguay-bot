'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { sendModerationDm } = require('../utils/moderationDm');
const { addModerationLog } = require('../utils/moderationLogStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Banea permanentemente a un usuario del servidor.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a banear').setRequired(true))
    .addStringOption((opt) => opt.setName('razon').setDescription('Razón del baneo').setRequired(false))
    .addIntegerOption((opt) =>
      opt
        .setName('borrar_mensajes')
        .setDescription('Días de mensajes a borrar (0-7)')
        .setMinValue(0)
        .setMaxValue(7)
        .setRequired(false),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const razon = interaction.options.getString('razon') || 'Sin razón especificada';
    const deleteDays = interaction.options.getInteger('borrar_mensajes') || 0;

    if (targetUser.id === interaction.user.id) {
      return replyError(interaction, 'No te podés banear a vos mismo.');
    }
    if (targetUser.id === interaction.client.user.id) {
      return replyError(interaction, 'No me puedo banear a mí mismo.');
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (targetMember && !targetMember.bannable) {
      return replyError(interaction, 'No puedo banear a ese usuario (jerarquía de roles o permisos).');
    }

    await sendModerationDm(targetUser, {
      title: '🔨 Has sido baneado del servidor',
      color: config.colors.danger,
      description: 'Has sido baneado del servidor por moderación.',
      fields: [{ name: 'Razón', value: razon }],
      moderatorTag: interaction.user.tag,
      guildName: interaction.guild.name,
    });

    await interaction.guild.members.ban(targetUser.id, {
      reason: `${razon} | Mod: ${interaction.user.tag}`,
      deleteMessageSeconds: deleteDays * 86400,
    });

    await addModerationLog({
      tipo: 'ban',
      guildId: interaction.guildId,
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon,
    });

    const publicEmbed = new EmbedBuilder()
      .setTitle('🔨 Usuario baneado')
      .setColor(config.colors.danger)
      .addFields(
        { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
        { name: 'Razón', value: razon },
      )
      .setTimestamp();

    // Pinguea al usuario -> respuesta pública (no ephemeral)
    await replyEmbed(interaction, {
      embed: publicEmbed,
      pings: true,
      content: `<@${targetUser.id}>`,
    });

    await postToModLog(interaction.client, config.modLogChannelId, publicEmbed);
  },
};

'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { addModerationLog } = require('../utils/moderationLogStore');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Revierte el baneo de un usuario por su ID.')
    .addStringOption((opt) => opt.setName('user_id').setDescription('ID del usuario a desbanear').setRequired(true))
    .addStringOption((opt) => opt.setName('razon').setDescription('Razón del desbaneo').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const userId = interaction.options.getString('user_id', true).trim();
    const razon = interaction.options.getString('razon') || 'Sin razón especificada';

    if (!/^\d{17,20}$/.test(userId)) {
      return replyError(interaction, 'Ese no es un ID de usuario válido.');
    }

    const bans = await interaction.guild.bans.fetch();
    if (!bans.has(userId)) {
      return replyError(interaction, 'Ese usuario no está baneado en este servidor.');
    }

    await interaction.guild.members.unban(userId, `${razon} | Mod: ${interaction.user.tag}`);

    await addModerationLog({
      tipo: 'unban',
      guildId: interaction.guildId,
      targetId: userId,
      targetTag: bans.get(userId)?.user?.tag || userId,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon,
    });

    const embed = new EmbedBuilder()
      .setTitle('✅ Usuario desbaneado')
      .setColor(config.colors.success)
      .addFields(
        { name: 'Usuario', value: `<@${userId}> (${userId})`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
        { name: 'Razón', value: razon },
      )
      .setTimestamp();

    // Pinguea al usuario -> respuesta pública
    await replyEmbed(interaction, { embed, pings: true, content: `<@${userId}>` });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

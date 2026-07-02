'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { sendModerationDm } = require('../utils/moderationDm');
const { addModerationLog } = require('../utils/moderationLogStore');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Expulsa a un usuario del servidor.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a expulsar').setRequired(true))
    .addStringOption((opt) => opt.setName('razon').setDescription('Razón de la expulsión').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const razon = interaction.options.getString('razon') || 'Sin razón especificada';

    if (targetUser.id === interaction.user.id) {
      return replyError(interaction, 'No te podés expulsar a vos mismo.');
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return replyError(interaction, 'Ese usuario no está en el servidor.');
    }
    if (!targetMember.kickable) {
      return replyError(interaction, 'No puedo expulsar a ese usuario (jerarquía de roles o permisos).');
    }

    await sendModerationDm(targetUser, {
      title: '👢 Has sido expulsado del servidor',
      color: config.colors.warning,
      description: 'Has sido expulsado del servidor por moderación.',
      fields: [{ name: 'Razón', value: razon }],
      moderatorTag: interaction.user.tag,
      guildName: interaction.guild.name,
    });

    await targetMember.kick(`${razon} | Mod: ${interaction.user.tag}`);

    await addModerationLog({
      tipo: 'kick',
      guildId: interaction.guildId,
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon,
    });

    const embed = new EmbedBuilder()
      .setTitle('👢 Usuario expulsado')
      .setColor(config.colors.warning)
      .addFields(
        { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
        { name: 'Razón', value: razon },
      )
      .setTimestamp();

    await replyEmbed(interaction, { embed, pings: true, content: `<@${targetUser.id}>` });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

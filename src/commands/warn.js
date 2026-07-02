'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { sendModerationDm } = require('../utils/moderationDm');
const { addModerationLog } = require('../utils/moderationLogStore');
const { addWarn, getWarns } = require('../utils/warnStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Aplica una advertencia a un usuario.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a advertir').setRequired(true))
    .addStringOption((opt) => opt.setName('razon').setDescription('Razón de la advertencia').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const razon = interaction.options.getString('razon', true);

    if (targetUser.id === interaction.user.id) {
      return replyError(interaction, 'No te podés advertir a vos mismo.');
    }
    if (targetUser.bot) {
      return replyError(interaction, 'No podés advertir a un bot.');
    }

    const warnId = await addWarn(interaction.guildId, targetUser.id, targetUser.tag, interaction.user.id, interaction.user.tag, razon);
    const totalWarns = (await getWarns(interaction.guildId, targetUser.id)).length;

    await sendModerationDm(targetUser, {
      title: '⚠️ Has recibido una advertencia',
      color: config.colors.warning,
      description: `Se te aplicó una advertencia. Total de advertencias: **${totalWarns}**`,
      fields: [{ name: 'Razón', value: razon }],
      moderatorTag: interaction.user.tag,
      guildName: interaction.guild.name,
    });

    await addModerationLog({
      tipo: 'warn',
      guildId: interaction.guildId,
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon,
    });

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Advertencia aplicada')
      .setColor(config.colors.warning)
      .addFields(
        { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
        { name: 'Warn #', value: `${warnId}`, inline: true },
        { name: 'Total advertencias', value: `${totalWarns}`, inline: true },
        { name: 'Razón', value: razon },
      )
      .setTimestamp();

    await replyEmbed(interaction, { embed, pings: true, content: `<@${targetUser.id}>` });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

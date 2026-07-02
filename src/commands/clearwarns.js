'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, postToModLog } = require('../utils/respond');
const { addModerationLog } = require('../utils/moderationLogStore');
const { clearWarns } = require('../utils/warnStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearwarns')
    .setDescription('Elimina todas las advertencias de un usuario.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a limpiar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const removed = await clearWarns(interaction.guildId, targetUser.id);

    await addModerationLog({
      tipo: 'clearwarns',
      guildId: interaction.guildId,
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon: `Se limpiaron ${removed} advertencia(s)`,
    });

    const embed = new EmbedBuilder()
      .setTitle('🧹 Advertencias eliminadas')
      .setColor(config.colors.success)
      .setDescription(`Se eliminaron **${removed}** advertencia(s) de <@${targetUser.id}>.`)
      .setTimestamp();

    await replyEmbed(interaction, { embed });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

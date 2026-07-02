'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { sendModerationDm } = require('../utils/moderationDm');
const { addModerationLog } = require('../utils/moderationLogStore');
const { ensureMuteRole } = require('../utils/muteRoleStore');
const { clearMuteTimer } = require('../utils/muteRuntime');
const { query } = require('../utils/database');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Quita el mute activo de un usuario.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a desmutear').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);

    const muteRoleResult = await ensureMuteRole(interaction.guild, { createIfMissing: false });
    if (!muteRoleResult.role) {
      return replyError(interaction, 'Primero creá el rol de mute con `/mute role-create`.');
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember?.roles.cache.has(muteRoleResult.role.id)) {
      return replyError(interaction, `<@${targetUser.id}> no está muteado.`);
    }

    await targetMember.roles.remove(muteRoleResult.role.id, `Unmute por ${interaction.user.tag}`);
    clearMuteTimer(interaction.guildId, targetUser.id);
    await query('DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ?', [interaction.guildId, targetUser.id]);

    await sendModerationDm(targetUser, {
      title: '✅ Has sido desmuteado',
      color: config.colors.success,
      description: 'Se removió el mute de tu cuenta.',
      fields: [{ name: 'Razón', value: 'Desmuteado manualmente' }],
      moderatorTag: interaction.user.tag,
      guildName: interaction.guild.name,
    });

    await addModerationLog({
      tipo: 'unmute',
      guildId: interaction.guildId,
      targetId: targetUser.id,
      targetTag: targetUser.tag,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon: 'Desmuteado manualmente',
    });

    const embed = new EmbedBuilder()
      .setTitle('🔊 Mute removido')
      .setColor(config.colors.success)
      .addFields(
        { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
      )
      .setTimestamp();

    await replyEmbed(interaction, { embed, pings: true, content: `<@${targetUser.id}>` });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

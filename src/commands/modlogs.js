'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed } = require('../utils/respond');
const { getModerationLogs } = require('../utils/moderationLogStore');

const TIPO_EMOJI = {
  ban: '🔨',
  unban: '✅',
  kick: '👢',
  mute: '🔇',
  unmute: '🔊',
  warn: '⚠️',
  clearwarns: '🧹',
  clear: '🧹',
};

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('modlogs')
    .setDescription('Muestra el historial de moderación de un usuario.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const logs = await getModerationLogs(interaction.guildId, targetUser.id, { limit: 15 });

    const embed = new EmbedBuilder()
      .setTitle(`📋 Historial de moderación — ${targetUser.tag}`)
      .setColor(config.colors.primary)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    if (!logs.length) {
      embed.setDescription('Este usuario no tiene historial de moderación.');
    } else {
      const lines = logs.map((log) => {
        const emoji = TIPO_EMOJI[log.tipo] || '📌';
        const ts = `<t:${Math.floor(new Date(log.fecha).getTime() / 1000)}:R>`;
        return `${emoji} **${log.tipo.toUpperCase()}** ${ts} — por ${log.moderator_tag}\n${log.razon || 'Sin razón'}`;
      });
      embed.setDescription(lines.join('\n\n'));
      embed.setFooter({ text: `Mostrando ${logs.length} registro(s) más reciente(s)` });
    }

    return replyEmbed(interaction, { embed });
  },
};

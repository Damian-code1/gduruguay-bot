const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getGiveaway,
  findGiveawayByMessageId,
  unbanUserFromGiveaway,
  getGiveawayBanLogs,
} = require('../utils/giveawayStore');
const { isStaff } = require('../utils/staffRolesStore');

function isAllowed(member, guildId) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(member, guildId);
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -gwunban')
    .setDescription('Quita el ban de una giveaway específica sin afectar otras giveaways futuras.')
    .addFields(
      { name: 'Uso', value: '`-gwunban <giveawayId|messageId> @usuario` o `-gwunban <giveawayId|messageId> <userId>`' },
      { name: 'Logs', value: '`-gwunban logs <giveawayId|messageId>`' },
      { name: 'Ejemplo', value: '`-gwunban 123456789012345678 @pepito`\n`-gwunban logs 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores o staff' },
    )
    .setColor(0x57F287)
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' });
}

function parseTargetId(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned.id;

  const raw = String(args[1] || '').trim();
  if (/^\d{17,20}$/.test(raw)) return raw;

  return null;
}

module.exports = {
  name: 'gwunban',
  aliases: ['giveawayunban'],
  help: {
    purpose: 'Quita el ban de una giveaway específica y muestra sus logs.',
    category: '🎁 Sorteos',
    aliases: ['giveawayunban'],
    adminOnly: true,
    usage: '-gwunban <giveawayId> @usuario | -gwunban logs <giveawayId>',
  },
  async execute(message, args) {
    if (!message.guild) return;
    if (!isAllowed(message.member, message.guild.id)) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = String(args[0] || '').toLowerCase();
    if (!sub || sub === 'help' || sub === 'ayuda' || sub === '?') {
      return message.reply({ embeds: [usageEmbed()] });
    }

    if (sub === 'logs') {
      const giveawayId = String(args[1] || '').trim();
      if (!giveawayId) return message.reply({ embeds: [usageEmbed()] });

      const giveaway = await getGiveaway(giveawayId) || await findGiveawayByMessageId(giveawayId, { activeOnly: false });
      if (!giveaway) return message.reply('❌ No encontré ese giveaway.');
      const resolvedGiveawayId = giveaway.id;

      const logs = await getGiveawayBanLogs(resolvedGiveawayId);
      const lines = logs.slice(-10).map((entry, index) => {
        const when = entry.createdAt ? `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>` : 'hace un momento';
        const user = entry.userId ? `<@${entry.userId}>` : 'Desconocido';
        const moderator = entry.moderatorId ? `<@${entry.moderatorId}>` : entry.moderatorName || 'Sistema';
        return `**#${index + 1}** • ${user}\nMotivo: ${entry.reason}\nModerador: ${moderator} • ${when}\nFuente: ${entry.source || 'manual'}`;
      }).join('\n\n');

      const embed = new EmbedBuilder()
        .setTitle('📋 Logs de gwunban')
        .setDescription(lines.length ? lines : 'No hay logs para esta giveaway.')
        .addFields(
          { name: 'Giveaway', value: `\`${resolvedGiveawayId}\``, inline: true },
          { name: 'Baneados', value: `\`${giveaway.bannedUsers?.length || 0}\``, inline: true },
          { name: 'Total logs', value: `\`${logs.length}\``, inline: true },
        )
        .setColor(0x57F287)
        .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const giveawayId = sub;
    const giveaway = await getGiveaway(giveawayId) || await findGiveawayByMessageId(giveawayId, { activeOnly: false });
    if (!giveaway) return message.reply('❌ No encontré ese giveaway.');
    const resolvedGiveawayId = giveaway.id;

    const targetId = parseTargetId(message, args);
    if (!targetId) return message.reply({ embeds: [usageEmbed()] });

    const reason = args.slice(2).join(' ') || 'Unban manual';
    const updated = await unbanUserFromGiveaway(resolvedGiveawayId, targetId, {
      reason,
      moderatorId: message.author.id,
      moderatorName: message.author.tag,
      source: 'command',
      createdAt: new Date().toISOString(),
    });

    if (!updated) {
      return message.reply('❌ No pude aplicar el gwunban.');
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Usuario desbaneado de la giveaway')
      .addFields(
        { name: 'Usuario', value: `<@${targetId}>`, inline: true },
        { name: 'Giveaway', value: `\`${resolvedGiveawayId}\``, inline: true },
        { name: 'Motivo', value: reason },
        { name: 'Baneados restantes', value: `\`${updated.bannedUsers?.length || 0}\``, inline: true },
      )
      .setColor(0x57F287)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

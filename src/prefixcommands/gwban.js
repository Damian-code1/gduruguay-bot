const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getGiveaway,
  banUserFromGiveaway,
  getGiveawayBanLogs,
} = require('../utils/giveawayStore');
const { isStaff } = require('../utils/staffRolesStore');

function isAllowed(member, guildId) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(member, guildId);
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -gwban')
    .setDescription('Banea a un usuario de una giveaway específica o muestra sus logs.')
    .addFields(
      { name: 'Ban', value: '`-gwban <giveawayId> @usuario [motivo]` o `-gwban <giveawayId> <userId> [motivo]`' },
      { name: 'Logs', value: '`-gwban logs <giveawayId>`' },
      { name: 'Ejemplo', value: '`-gwban 123456789012345678 @pepito spam`\n`-gwban logs 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores o staff' },
    )
    .setColor(0xED4245)
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' });
}

function parseTargetId(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned.id;

  const raw = String(args[1] || '').trim();
  if (/^\d{17,20}$/.test(raw)) return raw;

  return null;
}

function buildLogsEmbed(giveaway, logs) {
  const lines = logs.slice(-10).map((entry, index) => {
    const when = entry.createdAt ? `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>` : 'hace un momento';
    const user = entry.userId ? `<@${entry.userId}>` : 'Desconocido';
    const moderator = entry.moderatorId ? `<@${entry.moderatorId}>` : entry.moderatorName || 'Sistema';
    return `**#${index + 1}** • ${user}\nMotivo: ${entry.reason}\nModerador: ${moderator} • ${when}\nFuente: ${entry.source || 'manual'}`;
  }).join('\n\n');

  return new EmbedBuilder()
    .setTitle('📋 Logs de gwban')
    .setDescription(lines.length ? lines : 'No hay logs para esta giveaway.')
    .addFields(
      { name: 'Giveaway', value: `\`${giveaway.id}\``, inline: true },
      { name: 'Baneados', value: `\`${giveaway.bannedUsers?.length || 0}\``, inline: true },
      { name: 'Total logs', value: `\`${logs.length}\``, inline: true },
    )
    .setColor(0xED4245)
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' })
    .setTimestamp();
}

module.exports = {
  name: 'gwban',
  aliases: ['giveawayban'],
  help: {
    purpose: 'Banea usuarios de una giveaway concreta y muestra sus logs.',
    category: '🎁 Sorteos',
    aliases: ['giveawayban'],
    adminOnly: true,
    usage: '-gwban <giveawayId> @usuario [motivo] | -gwban logs <giveawayId>',
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

      const giveaway = await getGiveaway(giveawayId);
      if (!giveaway) return message.reply('❌ No encontré ese giveaway.');

      const logs = await getGiveawayBanLogs(giveawayId);
      return message.reply({ embeds: [buildLogsEmbed(giveaway, logs)] });
    }

    const giveawayId = sub;
    const giveaway = await getGiveaway(giveawayId);
    if (!giveaway) return message.reply('❌ No encontré ese giveaway.');
    if (giveaway.status !== 'active') {
      return message.reply('❌ Ese giveaway no está activo.');
    }

    const targetId = parseTargetId(message, args);
    if (!targetId) return message.reply({ embeds: [usageEmbed()] });

    const reason = args.slice(2).join(' ') || 'Sin razón especificada';
    const updated = await banUserFromGiveaway(giveawayId, targetId, {
      reason,
      moderatorId: message.author.id,
      moderatorName: message.author.tag,
      source: 'command',
      createdAt: new Date().toISOString(),
    });

    if (!updated) {
      return message.reply('❌ No pude aplicar el gwban.');
    }

    const embed = new EmbedBuilder()
      .setTitle('⛔ Usuario baneado de la giveaway')
      .addFields(
        { name: 'Usuario', value: `<@${targetId}>`, inline: true },
        { name: 'Giveaway', value: `\`${giveawayId}\``, inline: true },
        { name: 'Motivo', value: reason },
        { name: 'Total baneados', value: `\`${updated.bannedUsers?.length || 0}\``, inline: true },
      )
      .setColor(0xED4245)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

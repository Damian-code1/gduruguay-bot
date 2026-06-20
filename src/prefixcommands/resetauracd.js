const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/staffRolesStore');
const { setCooldown } = require('../utils/economyStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const logsPath = path.join(__dirname, '../logs.json');

function readLogs() {
  if (!fs.existsSync(logsPath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

function appendLog(entry) {
  const logs = readLogs();
  logs.push(entry);
  writeLogs(logs);
}

function buildLogsEmbed(guild, logs, target = null) {
  const recent = logs.slice(-10).reverse();
  const embed = new EmbedBuilder()
    .setTitle('📋 Logs de resetauracd')
    .setColor(0x5865F2)
    .setDescription(recent.length
      ? recent.map((entry, index) => {
          const ts = entry.createdAt ? `<t:${Math.floor(new Date(entry.createdAt).getTime() / 1000)}:R>` : 'N/A';
          return `${index + 1}. <@${entry.actorId}> → <@${entry.targetId}> • **${entry.mode || 'reset'}** • ${ts}`;
        }).join('\n')
      : 'No hay logs de resetauracd.')
    .setFooter({ text: `Total: ${logs.length}` });

  const fields = [];
  if (guild?.name) fields.push({ name: 'Servidor', value: guild.name, inline: true });
  if (target) fields.push({ name: 'Filtro', value: `<@${target.id}>`, inline: true });
  if (fields.length) embed.addFields(fields);
  return embed;
}

module.exports = {
  name: 'resetauracd',
  aliases: ['resetauracd'],
  help: {
    purpose: 'Resetea el cooldown de aura para un usuario.',
    category: '🎮 Diversión',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'logs') {
      const canSee = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
      if (!canSee) {
        return message.reply('❌ No tenés permisos para ver los logs de resetauracd.');
      }

      const target = args?.[1] ? await resolveUserTarget(message, args[1]) : null;
      const logs = readLogs().filter(entry => entry?.tipo === 'auraCooldownReset' && entry?.servidorId === guildId);
      const filtered = target ? logs.filter(entry => entry.targetId === target.id || entry.actorId === target.id) : logs;

      return message.reply({ embeds: [buildLogsEmbed(message.guild, filtered, target)] });
    }

    const target = args?.[0] ? await resolveUserTarget(message, args[0]) : message.author;

    if (!target) {
      return message.reply('❌ Uso: -resetauracd [@user|userId] | -resetauracd logs [@user|userId]');
    }

    const isSelf = target.id === message.author.id;
    const canResetOthers = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!isSelf && !canResetOthers) {
      return message.reply('❌ Solo podés resetear tu propio cooldown de aura.');
    }

    setCooldown(guildId, target.id, 'aura_daily', 0);

    appendLog({
      tipo: 'auraCooldownReset',
      servidorId: guildId,
      actorId: message.author.id,
      targetId: target.id,
      mode: 'reset',
      createdAt: new Date().toISOString(),
    });

    return message.reply(`✅ Cooldown de aura reseteado para <@${target.id}>.`);
  },
};
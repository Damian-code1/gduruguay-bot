const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const { sendModerationDm } = require('../utils/moderationDm');
const { resolveMassTargetsAndRest } = require('../utils/massActionResolver');
const { saveTempBanRecord, scheduleTempBan } = require('../utils/tempBanScheduler');

const logsPath = path.join(__dirname, '../logs.json');
const MAX_TARGETS = 20;

function appendLog(data) {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

function parseMassBanInput(message) {
  const raw = message.content.slice(1).trim();
  const rest = raw.slice('massban'.length).trim();
  return { rest };
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -massban')
    .setDescription('Banea varias personas al mismo tiempo. Si no se pone duración, el baneo es permanente.')
    .addFields(
      { name: 'Uso', value: '`-massban usuario1 usuario2 [plazo] [motivo]`' },
      { name: 'Ejemplo', value: '`-massban @pepito 123456789012345678 7d raid`\n`-massban @pepito otroUsuario spam`' },
      { name: 'Notas', value: 'Personas primero. Luego el plazo si querés (ej: `7d`). Después el motivo. Si no ponés plazo, lo que sigue es el motivo.' },
    )
    .setColor(0xC0392B);
}

module.exports = {
  name: 'massban',
  help: {
    purpose: 'Banea varias personas al mismo tiempo.',
    category: '🛡️ Moderación',
    adminOnly: true,
    requiredPermissions: [PermissionFlagsBits.Administrator],
    usage: '-massban usuario1 usuario2 [plazo] [motivo]'
  },
  async execute(message) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!canUse) return message.reply('❌ No tenés permisos para usar este comando.');

    const { rest } = parseMassBanInput(message);
    if (!rest) return message.reply({ embeds: [usageEmbed()] });

    const { targets, remainder } = await resolveMassTargetsAndRest(message, rest);
    const resolved = targets.slice(0, MAX_TARGETS);

    if (!resolved.length) return message.reply({ embeds: [usageEmbed()] });

    const remainderTokens = String(remainder || '').split(/\s+/).filter(Boolean);
    const maybeDuration = remainderTokens[0] || '';
    const hasDuration = Boolean(parseDuration(maybeDuration));
    const durationText = hasDuration ? maybeDuration : null;
    const reason = hasDuration
      ? (remainderTokens.slice(1).join(' ').trim() || 'Sin razón especificada')
      : (remainderTokens.join(' ').trim() || 'Sin razón especificada');

    const durationMs = hasDuration ? parseDuration(durationText) : 0;
    if (hasDuration && !durationMs) {
      return message.reply('❌ La duración no es válida. Ej: `10m`, `2h`, `7d`, `1mo`, `1a`.');
    }

    const results = [];
    let success = 0;
    let failed = 0;

    for (const target of resolved) {
      if (target.id === message.author.id) {
        failed += 1;
        results.push(`❌ <@${target.id}>: no te podés banear a vos mismo.`);
        continue;
      }

      if (target.member?.bannable === false) {
        failed += 1;
        results.push(`❌ <@${target.id}>: no puedo banearlo.`);
        continue;
      }

      const expiresAt = hasDuration ? Date.now() + durationMs : null;
      const banReason = hasDuration
        ? `${reason} | Tempban ${formatDuration(durationMs)}`
        : reason;

      await sendModerationDm(target.user, {
        title: hasDuration ? '🔨 Has sido baneado temporalmente' : '🔨 Has sido baneado del servidor',
        color: 0xC0392B,
        description: hasDuration ? 'Has sido baneado temporalmente del servidor.' : 'Has sido baneado del servidor por moderación.',
        fields: [
          { name: 'Razón', value: reason, inline: false },
          hasDuration ? { name: 'Duración', value: formatDuration(durationMs), inline: true } : null,
          hasDuration && expiresAt ? { name: 'Desbanea', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true } : null,
        ].filter(Boolean),
        moderator: `${message.author.tag}`,
        guild: `${message.guild.name}`,
      }).catch(() => null);

      try {
        if (target.member) {
          await target.member.ban({ reason: banReason });
        } else {
          await message.guild.bans.create(target.id, { reason: banReason });
        }

        if (hasDuration && expiresAt) {
          const record = saveTempBanRecord({
            guildId: message.guild.id,
            userId: target.id,
            userTag: target.user?.tag || target.user?.username || '',
            moderatorId: message.author.id,
            moderatorTag: message.author.tag,
            reason,
            expiresAt,
            createdAt: Date.now(),
          });
          scheduleTempBan(message.client, record);
        }

        appendLog({
          tipo: 'ban',
          origen: 'bot',
          usuarioId: target.id,
          usuarioNombre: target.user?.username || target.id,
          moderadorId: message.author.id,
          moderadorNombre: message.author.username,
          razon: banReason,
          fecha: new Date().toISOString(),
          servidorId: message.guild.id,
          temp: hasDuration,
          expiresAt: expiresAt || null,
        });

        success += 1;
        results.push(`✅ <@${target.id}> baneado${hasDuration ? ` por ${formatDuration(durationMs)}` : ' permanentemente'}.`);
      } catch (error) {
        console.error('[massban]', error);
        failed += 1;
        results.push(`❌ <@${target.id}>: no se pudo banear.`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('🔨 Massban ejecutado')
      .setColor(0xC0392B)
      .addFields(
        { name: 'Éxitos', value: `${success}`, inline: true },
        { name: 'Fallos', value: `${failed}`, inline: true },
        { name: 'Modo', value: hasDuration ? `Temporal (${formatDuration(durationMs)})` : 'Permanente', inline: true },
        { name: 'Motivo', value: reason },
        { name: 'Resultado', value: results.slice(0, 20).join('\n').slice(0, 3500) || 'Sin detalles' },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

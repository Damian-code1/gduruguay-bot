const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { resolveUserTarget } = require('../utils/resolveUserTarget');
const { isStaff } = require('../utils/staffRolesStore');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const {
  setEconomyBan,
  getEconomyBanStatus,
  clearEconomyBan,
  removeEconomyBanLogs,
  getActiveEconomyBans,
  appendEconomyBanLog,
  getEconomyBanLogs,
} = require('../utils/economyBanStore');

const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000;
const LOGS_PER_PAGE = 4;

function formatTimestamp(ms) {
  if (!ms) return 'N/D';
  return `<t:${Math.floor(ms / 1000)}:F>`;
}

function formatBanDurationLabel(durationMs, permanent = false) {
  if (permanent || durationMs === 0) return 'Permanente';
  return formatDuration(durationMs);
}

async function parseTarget(message, rawTarget) {
  return resolveUserTarget(message, rawTarget);
}

function buildLogsEmbed(logs, page, targetLabel = null) {
  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const start = page * LOGS_PER_PAGE;
  const pageLogs = logs.slice(start, start + LOGS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle('🚫 EconomyBan • Logs')
    .setColor(0xC0392B)
    .setDescription([
      targetLabel ? `Filtro: **${targetLabel}**` : 'Historial de baneos de economía del servidor.',
      `Página **${page + 1}** de **${totalPages}**`,
      `Total: **${logs.length}**`,
    ].join('\n'))
    .setTimestamp();

  if (!pageLogs.length) {
    embed.addFields({ name: 'Sin logs', value: 'No hay registros para mostrar.' });
    return { embed, totalPages };
  }

  for (const entry of pageLogs) {
    const remaining = entry.durationMs ? Math.max(0, entry.expiresAt - Date.now()) : null;
    const isActive = entry.durationMs === 0 || remaining > 0;
    const actionIcon = entry.action === 'update' ? '🔁' : entry.action === 'unban' ? '✅' : '⛔';
    embed.addFields({
      name: `${actionIcon} ${entry.userTag || entry.username || entry.userId}`,
      value: [
        `👤 **Usuario:** <@${entry.userId}>`,
        `🛡️ **Moderador:** <@${entry.moderatorId}> (${entry.moderatorName})`,
        `📝 **Motivo:** ${entry.reason}`,
        `⏳ **Duración:** ${formatBanDurationLabel(entry.durationMs, entry.durationMs === 0)}`,
        `📅 **Inicio:** ${formatTimestamp(entry.createdAt)}`,
        entry.durationMs === 0 ? '📅 **Expira:** Nunca' : `📅 **Expira:** ${formatTimestamp(entry.expiresAt)}`,
        entry.durationMs === 0 ? '🟢 **Estado:** Activo • permanente' : (isActive ? `🟢 **Estado:** Activo • faltan ${formatDuration(remaining)}` : '⚪ **Estado:** Expirado'),
      ].join('\n'),
      inline: false,
    });
  }

  return { embed, totalPages };
}

function buildRow(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('econban_prev').setLabel('◀').setStyle(ButtonStyle.Primary).setDisabled(disabled || page === 0),
    new ButtonBuilder().setCustomId('econban_next').setLabel('▶').setStyle(ButtonStyle.Primary).setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder().setCustomId('econban_close').setLabel('Cerrar').setStyle(ButtonStyle.Danger).setDisabled(disabled)
  );
}

module.exports = {
  name: 'economyban',
  aliases: ['econban'],
  help: {
    purpose: 'Banea a un usuario solo de comandos de economía por un tiempo determinado.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

     try {
       const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'help' || sub === 'ayuda' || sub === '?') {
      const activeBans = getActiveEconomyBans(message.guild.id);
      const embed = new EmbedBuilder()
        .setTitle('🚫 EconomyBan')
        .setColor(0xC0392B)
        .setDescription('Banea a un usuario solo de los comandos de economía durante un tiempo definido.')
        .addFields(
          {
            name: 'Uso',
            value: [
              '`-economyban @usuario 7d motivo`',
              '`-economyban @usuario motivo` → permanente',
              '`-economyban 123456789012345678 12h motivo`',
              '`-economyban unban @usuario`',
              '`-economyban logs`',
            ].join('\n'),
          },
          {
            name: 'Duraciones válidas',
            value: ['`30m`', '`2h`', '`1d`', '`1d12h`'].join(' • '),
          },
          {
            name: 'Notas',
            value: 'Si no ponés duración, el ban es permanente. Mientras dure, no podrá usar comandos de economía. Si expira, se limpia automáticamente.',
          },
          {
            name: 'Activos ahora',
            value: activeBans.length
              ? activeBans.slice(0, 5).map(ban => `<@${ban.userId}> • ${ban.durationMs === 0 ? 'Permanente' : formatDuration(ban.remainingMs)} • ${ban.reason}`).join('\n')
              : 'No hay economybans activos.',
          },
        )
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'logs') {
      const filterTarget = args[1] ? await parseTarget(message, args[1]) : null;
      const logs = getEconomyBanLogs(message.guild.id, filterTarget?.id || null);

      if (!logs.length) {
        return message.reply(filterTarget
          ? `📭 No hay logs de economyban para <@${filterTarget.id}>.`
          : '📭 No hay logs de economyban en este servidor.');
      }

      let page = 0;
      const { embed, totalPages } = buildLogsEmbed(logs, page, filterTarget ? `${filterTarget.username} (${filterTarget.id})` : null);
      const msg = await message.reply({
        embeds: [embed],
        components: [buildRow(page, totalPages)],
      });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 120_000,
      });

      collector.on('collect', async i => {
        if (i.customId === 'econban_close') return collector.stop('cerrado');
        if (i.customId === 'econban_prev') page = Math.max(0, page - 1);
        if (i.customId === 'econban_next') page = Math.min(totalPages - 1, page + 1);

        const next = buildLogsEmbed(logs, page, filterTarget ? `${filterTarget.username} (${filterTarget.id})` : null);
        await i.update({ embeds: [next.embed], components: [buildRow(page, totalPages)] });
      });

      collector.on('end', async (_, reason) => {
        const next = buildLogsEmbed(logs, page, filterTarget ? `${filterTarget.username} (${filterTarget.id})` : null);
        await msg.edit({
          embeds: [next.embed.setFooter({ text: reason === 'cerrado' ? 'Sesión cerrada' : 'Sesión expirada' })],
          components: [buildRow(page, totalPages, true)],
        }).catch(() => null);
      });

      return;
    }

    if (sub === 'unban') {
      const target = await parseTarget(message, args[1]);
      if (!target?.id) {
        return message.reply('❌ Uso: `-economyban unban @usuario|userId`.');
      }

      if (target.id === message.author.id) {
        return message.reply('❌ No te podés desbanear a vos mismo.');
      }

      const banStatus = getEconomyBanStatus(message.guild.id, target.id);
      if (!banStatus.banned) {
        return message.reply(`❌ <@${target.id}> no está baneado de comandos de economía.`);
      }

      const result = clearEconomyBan(message.guild.id, target.id);
      if (!result.ok) {
        return message.reply(`❌ Error al desbanear: ${result.reason}`);
      }

      // Remove previous ban logs for this user in this guild
      try {
        removeEconomyBanLogs(message.guild.id, target.id);
      } catch (err) {
        console.error('Error removing economyban logs:', err);
      }

      appendEconomyBanLog({
        action: 'unban',
        guildId: message.guild.id,
        userId: target.id,
        userTag: target.tag,
        username: target.username,
        moderatorId: message.author.id,
        moderatorName: message.author.username,
        reason: 'Desbaneado',
        durationMs: 0,
        startedAt: 0,
        expiresAt: 0,
        createdAt: Date.now(),
        active: false,
        permanent: false,
      });

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔓 EconomyBan removido')
            .setColor(0x27AE60)
            .setDescription([
              `Usuario: <@${target.id}>`,
              `Moderador: <@${message.author.id}>`,
              'Ahora puede usar comandos de economía nuevamente.',
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    }

    } catch (error) {
      console.error('Error en economyban:', error);
      return message.reply(`❌ Error interno: ${error.message}`).catch(() => null);
    }

    const target = await parseTarget(message, args[0]);
    if (!target?.id) {
      return message.reply('❌ Uso: `-economyban @usuario|userId <duración> <motivo>` o `-economyban logs`.');
    }

    if (target.id === message.author.id) {
      return message.reply('❌ No te podés aplicar economyban a vos mismo.');
    }

    const durationRaw = args[1];
    const durationToken = String(durationRaw || '').toLowerCase();
    const explicitDuration = /^\d+[smhd]/i.test(durationToken) || ['perma', 'permanente', 'perm', 'permanent'].includes(durationToken);
    const permanentBan = !explicitDuration;
    const durationMs = explicitDuration && !['perma', 'permanente', 'perm', 'permanent'].includes(durationToken)
      ? parseDuration(durationRaw || '')
      : 0;
    if (explicitDuration && (!durationMs || durationMs < 60_000 || durationMs > MAX_DURATION_MS)) {
      return message.reply('❌ Duración inválida. Usá algo como `30m`, `2h`, `1d` o `1d12h` (máximo 365d), o no pongas duración para que sea permanente.');
    }

    const reason = (permanentBan ? args.slice(1).join(' ').trim() : args.slice(2).join(' ').trim()) || 'Sin motivo especificado';
    const now = Date.now();
    const previous = getEconomyBanStatus(message.guild.id, target.id, now);
    const activeBan = setEconomyBan(message.guild.id, target.id, {
      moderatorId: message.author.id,
      moderatorName: message.author.username,
      reason,
      startedAt: now,
      durationMs,
      expiresAt: durationMs > 0 ? now + durationMs : 0,
    });

    appendEconomyBanLog({
      action: previous.banned ? 'update' : 'ban',
      guildId: message.guild.id,
      userId: target.id,
      userTag: target.tag,
      username: target.username,
      moderatorId: message.author.id,
      moderatorName: message.author.username,
      reason,
      durationMs,
      startedAt: now,
      expiresAt: activeBan.expiresAt,
      createdAt: now,
      active: true,
      permanent: durationMs === 0,
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(previous.banned ? '🔁 EconomyBan actualizado' : '⛔ EconomyBan aplicado')
          .setColor(0xC0392B)
          .setDescription([
            `Usuario: <@${target.id}>`,
            `Duración: **${formatBanDurationLabel(durationMs, durationMs === 0)}**`,
            durationMs === 0 ? 'Expira: Nunca' : `Expira: ${formatTimestamp(activeBan.expiresAt)}`,
            `Motivo: ${reason}`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};

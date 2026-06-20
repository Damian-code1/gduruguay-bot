const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { resolveUserTarget } = require('../utils/resolveUserTarget');
const { isStaff } = require('../utils/staffRolesStore');

const logsPath = path.join(__dirname, '../logs.json');
const LOGS_POR_PAGINA = 3;
const DIAS_MAXIMOS = 30;

function isUnmuteLog(log) {
  return ['unmute', 'untimeout', 'timeout'].includes(log?.tipo);
}

function purgeLegacyTimeoutLogs() {
  const todos = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  const filtrados = todos.filter(l => !['timeout', 'untimeout'].includes(l?.tipo));
  if (filtrados.length !== todos.length) {
    fs.writeFileSync(logsPath, JSON.stringify(filtrados, null, 2));
  }
  return filtrados;
}

async function clearMuteLogsForGuild(message) {
  const todos = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  const kept = [];
  let removedUnmutes = 0;
  let removedMutes = 0;

  for (const log of todos) {
    if (log?.servidorId !== message.guild.id) {
      kept.push(log);
      continue;
    }

    if (!['mute', 'unmute', 'timeout', 'untimeout'].includes(log?.tipo)) {
      kept.push(log);
      continue;
    }

    if (isUnmuteLog(log)) removedUnmutes += 1;
    else removedMutes += 1;
  }

  fs.writeFileSync(logsPath, JSON.stringify(kept, null, 2));

  return {
    removedUnmutes,
    removedMutes,
    keptMutes: kept.filter(log => log?.servidorId === message.guild.id && log?.tipo === 'mute').length,
  };
}

function limpiarLogs() {
  const todos = purgeLegacyTimeoutLogs();
  const limite = Date.now() - DIAS_MAXIMOS * 24 * 60 * 60 * 1000;
  const filtrados = todos.filter(l => new Date(l.fecha).getTime() > limite);
  fs.writeFileSync(logsPath, JSON.stringify(filtrados, null, 2));
  return filtrados;
}

function buildEmbed(logs, pagina, total, objetivo) {
  const inicio = pagina * LOGS_POR_PAGINA;
  const pagLogs = logs.slice(inicio, inicio + LOGS_POR_PAGINA);
  const totalPaginas = Math.ceil(logs.length / LOGS_POR_PAGINA);

  const embed = new EmbedBuilder()
    .setTitle('📋 Logs de Mute')
    .setDescription(
      objetivo
        ? `Mutes de **${objetivo.username}** — ${logs.length} en total`
        : `Todos los mutes del servidor — ${logs.length} en total`
    )
    .setColor(0x5865F2)
    .setFooter({ text: `Página ${pagina + 1} de ${totalPaginas} • Solo últimos ${DIAS_MAXIMOS} días` })
    .setTimestamp();

  pagLogs.forEach((log, i) => {
    const fecha = new Date(log.fecha);
    const icono = log.tipo === 'mute' ? '🔇' : '✅';
    embed.addFields({
      name: `#${total - inicio - i} — ${log.usuarioNombre}`,
      value: [
        `${icono} **Acción:** ${log.tipo}`,
        `👤 **Usuario:** <@${log.usuarioId}>`,
        `🛡️ **Moderador:** <@${log.moderadorId}> (${log.moderadorNombre})`,
        log.duracionTexto ? `⏱️ **Duración:** ${log.duracionTexto}` : null,
        `📝 **Razón:** ${log.razon}`,
        `📅 **Fecha:** <t:${Math.floor(fecha.getTime() / 1000)}:F>`,
      ].filter(Boolean).join('\n'),
    });
  });

  return embed;
}

function buildRow(pagina, totalPaginas, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mute_first').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || pagina === 0),
    new ButtonBuilder().setCustomId('mute_prev').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(disabled || pagina === 0),
    new ButtonBuilder().setCustomId('mute_close').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('mute_next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || pagina >= totalPaginas - 1),
    new ButtonBuilder().setCustomId('mute_last').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || pagina >= totalPaginas - 1),
  );
}

module.exports = {
  name: 'mutelogs',
  aliases: ['tologs'],
  help: {
    purpose: 'Muestra logs de mute/unmute del servidor con paginación.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para ver los logs.');
    }

    if ((args[0] || '').toLowerCase() === 'clear') {
      const result = await clearMuteLogsForGuild(message);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🧹 Logs de mute limpiados')
            .setColor(0x2ECC71)
            .setDescription([
              `Unmutes eliminados: **${result.removedUnmutes}**`,
              `Mutes eliminados: **${result.removedMutes}**`,
              `Mutes activos conservados: **${result.keptMutes}**`,
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    }

    const todos = limpiarLogs();
    const logs = todos
      .filter(l => ['mute', 'unmute'].includes(l.tipo) && l.servidorId === message.guild.id)
      .reverse();

    if (!logs.length) {
      return message.reply('📭 No hay logs de mute en los últimos 30 días.');
    }

    const objetivo = args[0] ? await resolveUserTarget(message, args[0]) : null;
    const filtrados = objetivo ? logs.filter(l => l.usuarioId === objetivo.id) : logs;

    if (!filtrados.length) {
      return message.reply(`📭 No hay logs de mute para **${objetivo.username}** en los últimos 30 días.`);
    }

    const totalPaginas = Math.ceil(filtrados.length / LOGS_POR_PAGINA);
    let pagina = 0;

    const msg = await message.reply({
      embeds: [buildEmbed(filtrados, pagina, filtrados.length, objetivo)],
      components: [buildRow(pagina, totalPaginas)],
    });

    const collector = msg.createMessageComponentCollector({
      filter: i => i.user.id === message.author.id,
      time: 120_000,
    });

    collector.on('collect', async i => {
      if (i.customId === 'mute_close') {
        collector.stop('cerrado');
        return;
      }

      if (i.customId === 'mute_first') pagina = 0;
      else if (i.customId === 'mute_prev') pagina = Math.max(0, pagina - 1);
      else if (i.customId === 'mute_next') pagina = Math.min(totalPaginas - 1, pagina + 1);
      else if (i.customId === 'mute_last') pagina = totalPaginas - 1;

      await i.update({
        embeds: [buildEmbed(filtrados, pagina, filtrados.length, objetivo)],
        components: [buildRow(pagina, totalPaginas)],
      });
    });

    collector.on('end', async (_, reason) => {
      const embedFinal = buildEmbed(filtrados, pagina, filtrados.length, objetivo)
        .setFooter({ text: `Página ${pagina + 1} de ${totalPaginas} • Sesión ${reason === 'cerrado' ? 'cerrada' : 'expirada'}` })
        .setColor(reason === 'cerrado' ? 0xE74C3C : 0x888780);

      await msg.edit({
        embeds: [embedFinal],
        components: [buildRow(pagina, totalPaginas, true)],
      }).catch(() => {});
    });
  },
};
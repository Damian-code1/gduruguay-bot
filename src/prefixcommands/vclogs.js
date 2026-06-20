const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, AuditLogEvent } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/staffRolesStore');
const { replyError } = require('../utils/embeds');

const logsPath = path.join(__dirname, '../logs.json');

function leerLogs() {
  return JSON.parse(fs.readFileSync(logsPath, 'utf8'));
}

function filtrarLogsDeVoz(message) {
  const todos = leerLogs();
  const logs = todos
    .filter(log => ['voicejoin', 'voiceleave', 'voicemove'].includes(log.tipo))
    .filter(log => log.servidorId === message.guild.id)
    .reverse();

  return {
    logs,
  };
}

async function enrichMoveLogs(guild, logs) {
  const moveLogs = logs.filter(log => log.tipo === 'voicemove' && !log.moverId);
  if (!moveLogs.length) return logs;

  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberMove,
      limit: 25,
    });

    const entries = [...auditLogs.entries.values()]
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

    for (const log of moveLogs) {
      const entry = entries.find(audit => {
        const targetId = audit.target?.id || audit.targetId;
        if (targetId !== log.usuarioId) return false;

        const logTime = new Date(log.fecha).getTime();
        const auditTime = audit.createdTimestamp;
        return Math.abs(auditTime - logTime) < 15000;
      });

      if (entry?.executor?.id) {
        log.moverId = entry.executor.id;
        log.moverNombre = entry.executor.username || entry.executor.tag || null;
      }
    }
  } catch (error) {
    // Sin permisos o sin audit logs disponibles
  }

  return logs;
}

function buildEmbed(logs, page, totalPages) {
  const pageSize = 5;
  const start = page * pageSize;
  const pageLogs = logs.slice(start, start + pageSize);

  const embed = new EmbedBuilder()
    .setTitle(`🔊 Logs de Voz`)
    .setDescription(`Actividad de voz del servidor — ${logs.length} registro(s)`)
    .setColor(0x5865F2)
    .setFooter({ text: `Página ${page + 1}/${totalPages} • Solo administradores` })
    .setTimestamp();

  if (!pageLogs.length) {
    embed.setDescription('📭 No hay logs para mostrar.');
    return embed;
  }

  for (const log of pageLogs) {
    const ts = Math.floor(new Date(log.fecha).getTime() / 1000);
    const accion = log.tipo === 'voicejoin'
      ? 'Entró'
      : log.tipo === 'voiceleave'
        ? 'Salió'
        : log.moverId
          ? 'Movido por staff'
          : 'Se movió';
    const canalPrevio = log.canalAnteriorId ? `<#${log.canalAnteriorId}>` : '—';
    const canalNuevo = log.canalNuevoId ? `<#${log.canalNuevoId}>` : '—';
    const movedBy = log.tipo === 'voicemove' && log.moverId
      ? `Movido por: <@${log.moverId}>${log.moverNombre ? ` (${log.moverNombre})` : ''}`
      : log.tipo === 'voicemove'
        ? 'Movido por: no detectado'
        : '';

    embed.addFields({
      name: `${accion} • ${log.usuarioNombre}`,
      value: [
        `Usuario: <@${log.usuarioId}>`,
        `Canal anterior: ${canalPrevio}`,
        `Canal nuevo: ${canalNuevo}`,
        `Fecha: <t:${ts}:F>`,
        movedBy,
      ].filter(Boolean).join('\n'),
      inline: false,
    });
  }

  return embed;
}

module.exports = {
  name: 'vclogs',
  help: {
    purpose: 'Muestra registros de personas que entran, salen o se mueven en canales de voz.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return replyError(message, '❌ No tenés permisos para usar este comando.');
    }

    let { logs } = filtrarLogsDeVoz(message);

    if (!logs.length) {
      return replyError(message, '📭 No hay logs de voz en este servidor.');
    }

    logs = await enrichMoveLogs(message.guild, logs);

    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(logs.length / pageSize));
    let page = Math.max(0, Math.min((parseInt(args[0], 10) || 1) - 1, totalPages - 1));

    const buildButtons = () => new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('vc_prev')
        .setLabel('⬅️ Anterior')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page <= 0),
      new ButtonBuilder()
        .setCustomId('vc_next')
        .setLabel('Siguiente ➡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages - 1)
    );

    const sent = await message.reply({ embeds: [buildEmbed(logs, page, totalPages)], components: [buildButtons()] });

    const collector = sent.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ description: '❌ Solo quien ejecutó el comando puede usar los botones.', ephemeral: true, color: 0xED4245 });
      }

      if (interaction.customId === 'vc_prev' && page > 0) page--;
      if (interaction.customId === 'vc_next' && page < totalPages - 1) page++;

      await interaction.update({
        embeds: [buildEmbed(logs, page, totalPages)],
        components: [buildButtons()],
      });
    });

    collector.on('end', () => {
      const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('vc_prev')
          .setLabel('⬅️ Anterior')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('vc_next')
          .setLabel('Siguiente ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );

      sent.edit({ components: [disabledButtons] }).catch(() => null);
    });
  },
};

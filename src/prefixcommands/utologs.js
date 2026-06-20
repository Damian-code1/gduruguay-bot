const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { resolveUserTarget } = require('../utils/resolveUserTarget');
const { isStaff } = require('../utils/staffRolesStore');

const logsPath = path.join(__dirname, '../logs.json');
const LOGS_POR_PAGINA = 3;
const DIAS_MAXIMOS = 30;

const limpiarLogs = () => {
  const todos = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  const limite = Date.now() - DIAS_MAXIMOS * 24 * 60 * 60 * 1000;
  const filtrados = todos.filter(l => new Date(l.fecha).getTime() > limite);
  fs.writeFileSync(logsPath, JSON.stringify(filtrados, null, 2));
  return filtrados;
};

const buildEmbed = (logs, pagina, total, objetivo) => {
  const inicio = pagina * LOGS_POR_PAGINA;
  const pagLogs = logs.slice(inicio, inicio + LOGS_POR_PAGINA);
  const totalPaginas = Math.ceil(logs.length / LOGS_POR_PAGINA);

  const embed = new EmbedBuilder()
    .setTitle('🔊 Logs de Untimeouts')
    .setDescription(
      objetivo
        ? `Untimeouts de **${objetivo.username}** — ${logs.length} en total`
        : `Todos los untimeouts del servidor — ${logs.length} en total`
    )
    .setColor(0x2ECC71)
    .setFooter({ text: `Página ${pagina + 1} de ${totalPaginas} • Solo últimos ${DIAS_MAXIMOS} días` })
    .setTimestamp();

  pagLogs.forEach((log, i) => {
    const fecha = new Date(log.fecha);
    const origenEmoji = log.origen === 'discord' ? '🖥️ Discord' : '🤖 Bot';
    embed.addFields({
      name: `#${total - inicio - i} — ${log.usuarioNombre}`,
      value: [
        `👤 **Usuario:** <@${log.usuarioId}>`,
        `🛡️ **Moderador:** <@${log.moderadorId}> (${log.moderadorNombre})`,
        `📝 **Razón:** ${log.razon}`,
        `📅 **Fecha:** <t:${Math.floor(fecha.getTime() / 1000)}:F>`,
        `🔧 **Origen:** ${origenEmoji}`,
      ].join('\n'),
    });
  });

  return embed;
};

const buildRow = (pagina, totalPaginas, disabled = false) => {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('primera').setEmoji('⏮️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || pagina === 0),
    new ButtonBuilder().setCustomId('anterior').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(disabled || pagina === 0),
    new ButtonBuilder().setCustomId('cerrar').setEmoji('❌').setStyle(ButtonStyle.Danger).setDisabled(disabled),
    new ButtonBuilder().setCustomId('siguiente').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(disabled || pagina >= totalPaginas - 1),
    new ButtonBuilder().setCustomId('ultima').setEmoji('⏭️').setStyle(ButtonStyle.Secondary).setDisabled(disabled || pagina >= totalPaginas - 1),
  );
};

module.exports = {
  name: 'utologs',
  help: {
    purpose: 'Muestra logs de untimeouts del servidor con paginación.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse)
      return message.reply('❌ No tenés permisos para ver los logs.');

    const todos = limpiarLogs();
    const logs = todos
      .filter(l => l.tipo === 'untimeout' && l.servidorId === message.guild.id)
      .reverse();

    if (!logs.length)
      return message.reply('📭 No hay logs de untimeouts en los últimos 30 días.');

    const objetivo = await resolveUserTarget(message, args[0]);

    const filtrados = objetivo
      ? logs.filter(l => l.usuarioId === objetivo.id)
      : logs;

    if (objetivo && !filtrados.length)
      return message.reply(`📭 No hay logs de untimeouts para ese usuario en los últimos 30 días.`);

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
      if (i.customId === 'cerrar') return collector.stop('cerrado');
      if (i.customId === 'primera') pagina = 0;
      else if (i.customId === 'anterior') pagina = Math.max(0, pagina - 1);
      else if (i.customId === 'siguiente') pagina = Math.min(totalPaginas - 1, pagina + 1);
      else if (i.customId === 'ultima') pagina = totalPaginas - 1;

      await i.update({
        embeds: [buildEmbed(filtrados, pagina, filtrados.length, objetivo)],
        components: [buildRow(pagina, totalPaginas)],
      });
    });

    collector.on('end', async (_, reason) => {
      await msg.edit({
        embeds: [buildEmbed(filtrados, pagina, filtrados.length, objetivo)
          .setFooter({ text: `Página ${pagina + 1} de ${totalPaginas} • Sesión cerrada` })
          .setColor(reason === 'cerrado' ? 0xE74C3C : 0x888780)],
        components: [buildRow(pagina, totalPaginas, true)],
      }).catch(() => {});
    });
  }
};
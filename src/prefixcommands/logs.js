const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/staffRolesStore');
const { replyError } = require('../utils/embeds');

const logsPath = path.join(__dirname, '../logs.json');

function leerLogs() {
  if (!fs.existsSync(logsPath)) return [];
  return JSON.parse(fs.readFileSync(logsPath, 'utf8'));
}

function filtrarLogsPorServidor(guildId) {
  const logs = leerLogs();
  return logs.filter(log => log.servidorId === guildId).reverse();
}

function buildLogEmbed(logs, page, totalPages, guildId) {
  const pageSize = 5;
  const startIdx = page * pageSize;
  const endIdx = startIdx + pageSize;
  const pageLogs = logs.slice(startIdx, endIdx);

  const embed = new EmbedBuilder()
    .setTitle(`📋 Logs del servidor (Página ${page + 1}/${totalPages})`)
    .setColor(0x5865F2)
    .setFooter({ text: 'Total de logs: ' + logs.length });

  if (pageLogs.length === 0) {
    embed.setDescription('📭 No hay logs disponibles.');
    return embed;
  }

  const fields = pageLogs.map(log => {
    const tipo = log.tipo
      ?.replace('voicejoin', '🔊 Unirse a voz')
      .replace('voiceleave', '🚪 Salir de voz')
      .replace('voicemove', '↔️ Cambiar canal')
      .replace('timeout', '🔇 Timeout')
      .replace('ban', '🔨 Ban')
      .replace('kick', '👞 Kick') || 'Desconocido';
    
    const timestamp = log.fecha ? `<t:${Math.floor(new Date(log.fecha).getTime() / 1000)}:R>` : 'N/A';
    const usuario = log.usuarioNombre || log.usuarioId || 'Desconocido';
    
    return {
      name: `${tipo} - ${usuario}`,
      value: `${log.razon || log.channelName || ''}${log.channelName ? ` en <#${log.channelId}>` : ''}\n${timestamp}`,
      inline: false,
    };
  });

  embed.addFields(...fields);
  return embed;
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -logs')
    .setDescription('Muestra los logs de moderación del servidor.')
    .addFields(
      { name: 'Uso', value: '`-logs` (primeros 5 logs)\n`-logs <página>` (para navegar)' },
      { name: 'Ejemplo', value: '`-logs`\n`-logs 2`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'logs',
  help: {
    purpose: 'Muestra los logs de acciones de moderación del servidor.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return replyError(message, '❌ No tenés permisos para usar este comando.');
    }

    const logs = filtrarLogsPorServidor(message.guild.id);
    if (!logs.length) {
      return replyError(message, '📭 No hay logs en este servidor.');
    }

    const totalPages = Math.ceil(logs.length / 5);
    let page = parseInt(args[0]) - 1 || 0;
    if (page < 0) page = 0;
    if (page >= totalPages) page = totalPages - 1;

    const embed = buildLogEmbed(logs, page, totalPages, message.guild.id);

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('logs_prev')
        .setLabel('⬅️ Anterior')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId('logs_next')
        .setLabel('Siguiente ➡️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === totalPages - 1)
    );

    const sent = await message.reply({ embeds: [embed], components: [buttons] });

    const collector = sent.createMessageComponentCollector({ time: 60000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        return interaction.reply({ description: '❌ Solo quien ejecutó el comando puede usar los botones.', ephemeral: true, color: 0xED4245 });
      }

      if (interaction.customId === 'logs_prev' && page > 0) {
        page--;
      } else if (interaction.customId === 'logs_next' && page < totalPages - 1) {
        page++;
      }

      const newEmbed = buildLogEmbed(logs, page, totalPages, message.guild.id);
      const newButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('logs_prev')
          .setLabel('⬅️ Anterior')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId('logs_next')
          .setLabel('Siguiente ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(page === totalPages - 1)
      );

      await interaction.update({ embeds: [newEmbed], components: [newButtons] });
    });

    collector.on('end', () => {
      const disabledButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('logs_prev')
          .setLabel('⬅️ Anterior')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true),
        new ButtonBuilder()
          .setCustomId('logs_next')
          .setLabel('Siguiente ➡️')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(true)
      );
      sent.edit({ components: [disabledButtons] }).catch(() => null);
    });
  },
};

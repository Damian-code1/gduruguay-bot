const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildConfig } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const ROBBERY_LOGS_PATH = path.join(__dirname, '../economy-robbery-logs.json');
const LOGS_PER_PAGE = 5;
const MAX_DAYS = 30;

function ensureFile() {
  if (!fs.existsSync(ROBBERY_LOGS_PATH)) {
    fs.writeFileSync(ROBBERY_LOGS_PATH, JSON.stringify([], null, 2));
  }
}

function readLogs() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(ROBBERY_LOGS_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  fs.writeFileSync(ROBBERY_LOGS_PATH, JSON.stringify(Array.isArray(logs) ? logs : [], null, 2));
}

function getFilteredLogs(guildId) {
  const cutoff = Date.now() - MAX_DAYS * 24 * 60 * 60 * 1000;
  return readLogs()
    .filter(log => log?.guildId === guildId)
    .filter(log => ['rob', 'forcerob'].includes(String(log?.command || '').toLowerCase()))
    .filter(log => Number(log?.at) >= cutoff)
    .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
}

function buildEmbed(logs, page, config, target = null) {
  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const currentPage = Math.max(0, Math.min(page, totalPages - 1));
  const start = currentPage * LOGS_PER_PAGE;
  const chunk = logs.slice(start, start + LOGS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle('🕵️ Logs Globales de Robos')
    .setColor(0x5865F2)
    .setDescription([
      `Registros de **rob** y **forcerob** de los últimos **${MAX_DAYS} días**.`,
      target ? `Filtro usuario: <@${target.id}>` : 'Filtro usuario: ninguno',
    ].join('\n'))
    .setFooter({ text: `Página ${currentPage + 1}/${totalPages}` })
    .setTimestamp();

  chunk.forEach((log, index) => {
    const ts = Math.floor(Number(log?.at || Date.now()) / 1000);
    const commandLabel = String(log?.command || 'rob').toLowerCase() === 'forcerob' ? '🦹 forcerob' : '🥷 rob';
    const amount = Number(log?.amount) || 0;
    const amountWallet = Number(log?.amountWallet) || 0;
    const amountBank = Number(log?.amountBank) || 0;

    embed.addFields({
      name: `#${logs.length - (start + index)} • ${commandLabel} • ${formatCurrency(amount, config)}`,
      value: [
        `Ladrón: <@${log.thiefId}>`,
        `Víctima: <@${log.victimId}>`,
        `Desglose: mano ${formatCurrency(amountWallet, config)} • banco ${formatCurrency(amountBank, config)}`,
        `Fecha: <t:${ts}:F>`,
      ].join('\n'),
      inline: false,
    });
  });

  if (!chunk.length) {
    embed.setDescription(`No hay logs de robos para mostrar en los últimos ${MAX_DAYS} días.`);
  }

  return { embed, totalPages, currentPage };
}

function buildButtons(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('roblogs_first')
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page <= 0),
    new ButtonBuilder()
      .setCustomId('roblogs_prev')
      .setEmoji('◀️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page <= 0),
    new ButtonBuilder()
      .setCustomId('roblogs_close')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('roblogs_next')
      .setEmoji('▶️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId('roblogs_last')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1),
  );
}

module.exports = {
  name: 'roblogs',
  help: {
    purpose: 'Logs globales de rob y forcerob (últimos 30 días) con paginación.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para ver estos logs.');
    }

    const guildId = message.guild.id;
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'clear') {
      const all = readLogs();
      const kept = all.filter(log => log?.guildId !== guildId);
      const removed = all.length - kept.length;
      writeLogs(kept);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🧹 RobLogs limpiados')
            .setColor(0x2ECC71)
            .setDescription(`Se eliminaron **${removed}** log(s) de rob/forcerob de este servidor.`)
            .setTimestamp(),
        ],
      });
    }

    const config = getGuildConfig(guildId);
    let logs = getFilteredLogs(guildId);

    let target = null;
    if (args?.[0]) {
      target = await resolveUserTarget(message, args[0]);
      if (!target) {
        return message.reply('❌ Usuario inválido. Usa mención o userId.');
      }

      logs = logs.filter(log => log.thiefId === target.id || log.victimId === target.id);
    }

    if (!logs.length) {
      return message.reply(target
        ? `📭 No hay logs de rob/forcerob para <@${target.id}> en los últimos 30 días.`
        : '📭 No hay logs de rob/forcerob en los últimos 30 días.');
    }

    let page = 0;
    const initial = buildEmbed(logs, page, config, target);

    const sent = await message.reply({
      embeds: [initial.embed],
      components: [buildButtons(initial.currentPage, initial.totalPages)],
    });

    const collector = sent.createMessageComponentCollector({
      filter: interaction => interaction.user.id === message.author.id,
      time: 120_000,
    });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'roblogs_close') {
        collector.stop('closed');
        return;
      }

      const current = buildEmbed(logs, page, config, target);
      const totalPages = current.totalPages;

      if (interaction.customId === 'roblogs_first') page = 0;
      else if (interaction.customId === 'roblogs_prev') page = Math.max(0, page - 1);
      else if (interaction.customId === 'roblogs_next') page = Math.min(totalPages - 1, page + 1);
      else if (interaction.customId === 'roblogs_last') page = totalPages - 1;

      const next = buildEmbed(logs, page, config, target);
      await interaction.update({
        embeds: [next.embed],
        components: [buildButtons(next.currentPage, next.totalPages)],
      });
    });

    collector.on('end', async (_, reason) => {
      const final = buildEmbed(logs, page, config, target);
      const closedEmbed = EmbedBuilder.from(final.embed)
        .setColor(reason === 'closed' ? 0xE74C3C : 0x888780)
        .setFooter({ text: `Página ${final.currentPage + 1}/${final.totalPages} • Sesión cerrada` });

      await sent.edit({
        embeds: [closedEmbed],
        components: [buildButtons(final.currentPage, final.totalPages, true)],
      }).catch(() => {});
    });
  },
};

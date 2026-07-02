'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { getDmLogsPage } = require('./dmLogStore');

const PAGE_SIZE = 5;

function truncate(text, max = 150) {
  const value = String(text || '').trim();
  if (!value) return '*(sin contenido)*';
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}…`;
}

function formatEntry(row) {
  const ts = `<t:${Math.floor(new Date(row.fecha).getTime() / 1000)}:R>`;
  const status = row.delivered ? '✅ Entregado' : '⚠️ No entregado';
  const lines = [
    `**Para:** <@${row.target_id}> (${row.target_tag || row.target_id})`,
    `**Por:** ${row.sender_tag || row.sender_id}`,
    `**Estado:** ${status} · ${ts}`,
    `**Mensaje:** ${truncate(row.content)}`,
  ];
  if (row.attachment_url) lines.push(`**Adjunto:** [ver](${row.attachment_url})`);
  return lines.join('\n');
}

async function buildDmLogPayload(page = 0, title = '📨 Historial de DMs enviados') {
  const data = await getDmLogsPage({ page, pageSize: PAGE_SIZE });

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(config.colors.primary)
    .setFooter({ text: `Página ${data.page + 1} de ${data.totalPages} · ${data.total} DM(s) en total` })
    .setTimestamp();

  if (!data.rows.length) {
    embed.setDescription('No hay DMs registrados todavía.');
  } else {
    embed.setDescription(data.rows.map(formatEntry).join('\n\n'));
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`dmlog:${data.page - 1}`)
      .setLabel('Anterior')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.page <= 0),
    new ButtonBuilder()
      .setCustomId(`dmlog:${data.page + 1}`)
      .setLabel('Siguiente')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(data.page >= data.totalPages - 1),
  );

  return {
    embeds: [embed],
    components: data.totalPages > 1 ? [row] : [],
    flags: MessageFlags.Ephemeral,
  };
}

module.exports = { buildDmLogPayload, PAGE_SIZE };

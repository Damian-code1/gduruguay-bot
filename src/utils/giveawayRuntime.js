'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const { query } = require('./database');
const { getMessageCount } = require('./messageCountStore');
const { getInviteCount } = require('./inviteStore');

async function createGiveaway({ guildId, channelId, prize, winnersCount, minMessages, minInvites, hostId, endsAt }) {
  const [result] = await query(
    `INSERT INTO giveaways (guild_id, channel_id, prize, winners_count, min_messages, min_invites, host_id, ends_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, channelId, prize, winnersCount, minMessages, minInvites, hostId, endsAt],
  );
  return result.insertId;
}

async function setGiveawayMessageId(giveawayId, messageId) {
  await query('UPDATE giveaways SET message_id = ? WHERE id = ?', [messageId, giveawayId]);
}

async function getGiveaway(giveawayId) {
  const [rows] = await query('SELECT * FROM giveaways WHERE id = ?', [giveawayId]);
  return rows[0] || null;
}

async function addEntry(giveawayId, userId) {
  await query(
    'INSERT IGNORE INTO giveaway_entries (giveaway_id, user_id) VALUES (?, ?)',
    [giveawayId, userId],
  );
}

async function hasEntry(giveawayId, userId) {
  const [rows] = await query(
    'SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?',
    [giveawayId, userId],
  );
  return rows.length > 0;
}

async function getEntryCount(giveawayId) {
  const [rows] = await query('SELECT COUNT(*) AS c FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId]);
  return rows[0]?.c || 0;
}

async function checkGiveawayRequirements(guild, userId, giveaway) {
  const failed = [];
  if (giveaway.min_messages > 0) {
    const msgs = await getMessageCount(guild.id, userId);
    if (msgs < giveaway.min_messages) {
      failed.push(`Necesitás **${giveaway.min_messages}** mensajes y tenés **${msgs}**.`);
    }
  }
  if (giveaway.min_invites > 0) {
    const invites = await getInviteCount(guild.id, userId);
    if (invites < giveaway.min_invites) {
      failed.push(`Necesitás **${giveaway.min_invites}** invites y tenés **${invites}**.`);
    }
  }
  return failed;
}

function buildGiveawayEmbed(giveaway, entryCount, ended = false) {
  const endsAtMs = new Date(giveaway.ends_at).getTime();
  const lines = [
    `🎁 **Premio:** ${giveaway.prize}`,
    `🏆 **Ganadores:** ${giveaway.winners_count}`,
    ended ? `⏰ **Finalizó**` : `⏰ **Termina:** <t:${Math.floor(endsAtMs / 1000)}:R>`,
    `👥 **Participantes:** ${entryCount}`,
  ];
  if (giveaway.min_messages > 0) lines.push(`💬 **Requisito:** ${giveaway.min_messages} mensajes`);
  if (giveaway.min_invites > 0) lines.push(`📨 **Requisito:** ${giveaway.min_invites} invites`);
  lines.push(`👤 **Organiza:** <@${giveaway.host_id}>`);

  return new EmbedBuilder()
    .setTitle(ended ? '🎉 Giveaway finalizado' : '🎉 ¡Giveaway activo!')
    .setDescription(lines.join('\n'))
    .setColor(ended ? config.colors.warning : config.colors.primary)
    .setFooter({ text: ended ? 'Este giveaway ya terminó' : 'Apretá el botón para participar' });
}

function buildGiveawayButton(giveawayId, disabled = false) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`giveaway:enter:${giveawayId}`)
      .setLabel('🎉 Participar')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
  );
  return row;
}

async function endGiveaway(client, giveawayId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway || giveaway.ended) return;

  await query('UPDATE giveaways SET ended = 1 WHERE id = ?', [giveawayId]);

  const [entries] = await query('SELECT user_id FROM giveaway_entries WHERE giveaway_id = ?', [giveawayId]);
  const userIds = entries.map((e) => e.user_id);

  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel?.isTextBased()) return;

  const winners = [];
  const pool = [...userIds];
  const winnersCount = Math.min(giveaway.winners_count, pool.length);
  for (let i = 0; i < winnersCount; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    winners.push(pool.splice(idx, 1)[0]);
  }

  const embed = buildGiveawayEmbed(giveaway, userIds.length, true);
  const row = buildGiveawayButton(giveawayId, true);

  if (giveaway.message_id) {
    const message = await channel.messages.fetch(giveaway.message_id).catch(() => null);
    if (message) await message.edit({ embeds: [embed], components: [row] }).catch(() => null);
  }

  if (!winners.length) {
    await channel.send({ content: '😢 Nadie participó en el giveaway, no hubo ganadores.' }).catch(() => null);
    return;
  }

  const mentionList = winners.map((id) => `<@${id}>`).join(', ');
  await channel
    .send({ content: `🎉 ¡Felicitaciones ${mentionList}! Ganaste/ganaron **${giveaway.prize}**.` })
    .catch(() => null);
}

async function checkExpiredGiveaways(client) {
  const [rows] = await query('SELECT id FROM giveaways WHERE ended = 0 AND ends_at <= NOW()');
  for (const row of rows) {
    await endGiveaway(client, row.id).catch((err) => console.error('Error finalizando giveaway:', err));
  }
}

module.exports = {
  createGiveaway,
  setGiveawayMessageId,
  getGiveaway,
  addEntry,
  hasEntry,
  getEntryCount,
  checkGiveawayRequirements,
  buildGiveawayEmbed,
  buildGiveawayButton,
  endGiveaway,
  checkExpiredGiveaways,
};
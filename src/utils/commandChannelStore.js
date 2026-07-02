'use strict';

const { query } = require('./database');

/** @returns {Promise<string[]>} */
async function getAllowedChannels(guildId) {
  const [rows] = await query('SELECT channel_id FROM command_channels WHERE guild_id = ?', [guildId]);
  return rows.map((r) => r.channel_id);
}

async function setAllowedChannels(guildId, channelIds) {
  await query('DELETE FROM command_channels WHERE guild_id = ?', [guildId]);
  for (const channelId of channelIds) {
    await query('INSERT IGNORE INTO command_channels (guild_id, channel_id) VALUES (?, ?)', [guildId, channelId]);
  }
  return getAllowedChannels(guildId);
}

async function addAllowedChannels(guildId, channelIds) {
  for (const channelId of channelIds) {
    await query('INSERT IGNORE INTO command_channels (guild_id, channel_id) VALUES (?, ?)', [guildId, channelId]);
  }
  return getAllowedChannels(guildId);
}

async function removeAllowedChannels(guildId, channelIds) {
  if (!channelIds.length) return getAllowedChannels(guildId);
  const placeholders = channelIds.map(() => '?').join(',');
  await query(`DELETE FROM command_channels WHERE guild_id = ? AND channel_id IN (${placeholders})`, [guildId, ...channelIds]);
  return getAllowedChannels(guildId);
}

async function clearAllowedChannels(guildId) {
  await query('DELETE FROM command_channels WHERE guild_id = ?', [guildId]);
  return [];
}

function formatAllowedChannels(channelIds) {
  return channelIds.map((id) => `<#${id}>`).join(', ');
}

module.exports = {
  getAllowedChannels,
  setAllowedChannels,
  addAllowedChannels,
  removeAllowedChannels,
  clearAllowedChannels,
  formatAllowedChannels,
};

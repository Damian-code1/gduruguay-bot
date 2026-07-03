'use strict';

const { query } = require('./database');

async function incrementMessageCount(guildId, userId) {
  await query(
    `INSERT INTO message_counts (guild_id, user_id, count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1`,
    [guildId, userId],
  );
}

async function getMessageCount(guildId, userId) {
  const [rows] = await query(
    'SELECT count FROM message_counts WHERE guild_id = ? AND user_id = ?',
    [guildId, userId],
  );
  return rows[0]?.count || 0;
}

module.exports = { incrementMessageCount, getMessageCount };
'use strict';

const { query } = require('./database');

async function setAfk(guildId, userId, reason) {
  await query(
    `INSERT INTO afk_status (guild_id, user_id, reason, since)
     VALUES (?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE reason = VALUES(reason), since = VALUES(since)`,
    [guildId, userId, reason || 'AFK'],
  );
}

async function getAfk(guildId, userId) {
  const [rows] = await query('SELECT * FROM afk_status WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return rows[0] || null;
}

async function clearAfk(guildId, userId) {
  const [result] = await query('DELETE FROM afk_status WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return result.affectedRows > 0;
}

module.exports = { setAfk, getAfk, clearAfk };

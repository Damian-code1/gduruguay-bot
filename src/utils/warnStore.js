'use strict';

const { query } = require('./database');

async function addWarn(guildId, targetId, targetTag, moderatorId, moderatorTag, reason) {
  const [result] = await query(
    `INSERT INTO warnings (guild_id, target_id, target_tag, moderator_id, moderator_tag, razon, fecha)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [guildId, targetId, targetTag, moderatorId, moderatorTag, reason],
  );
  return result.insertId;
}

async function getWarns(guildId, targetId) {
  const [rows] = await query(
    'SELECT * FROM warnings WHERE guild_id = ? AND target_id = ? ORDER BY fecha DESC',
    [guildId, targetId],
  );
  return rows;
}

async function clearWarns(guildId, targetId) {
  const [result] = await query('DELETE FROM warnings WHERE guild_id = ? AND target_id = ?', [guildId, targetId]);
  return result.affectedRows;
}

async function removeWarn(guildId, warnId) {
  const [result] = await query('DELETE FROM warnings WHERE guild_id = ? AND id = ?', [guildId, warnId]);
  return result.affectedRows > 0;
}

module.exports = { addWarn, getWarns, clearWarns, removeWarn };

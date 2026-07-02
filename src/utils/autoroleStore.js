'use strict';

const { query } = require('./database');

async function setAutorole(guildId, roleId) {
  await query(
    `INSERT INTO autorole (guild_id, role_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
    [guildId, roleId],
  );
}

async function getAutorole(guildId) {
  const [rows] = await query('SELECT role_id FROM autorole WHERE guild_id = ?', [guildId]);
  return rows[0]?.role_id || null;
}

async function clearAutorole(guildId) {
  await query('DELETE FROM autorole WHERE guild_id = ?', [guildId]);
}

module.exports = { setAutorole, getAutorole, clearAutorole };

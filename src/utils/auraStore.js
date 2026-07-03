'use strict';

const { query } = require('./database');

async function ensureRow(guildId, userId) {
  await query(
    `INSERT INTO aura_users (guild_id, user_id, aura, banned, last_claim, updated_at)
     VALUES (?, ?, 0, 0, 0, ?)
     ON DUPLICATE KEY UPDATE guild_id = guild_id`,
    [guildId, userId, Date.now()],
  );
}

async function getAura(guildId, userId) {
  const [rows] = await query(
    'SELECT aura, banned, last_claim FROM aura_users WHERE guild_id = ? AND user_id = ?',
    [guildId, userId],
  );
  if (!rows.length) return { aura: 0, banned: false, lastClaim: 0 };
  return { aura: Number(rows[0].aura), banned: !!rows[0].banned, lastClaim: Number(rows[0].last_claim) };
}

async function addAura(guildId, userId, delta) {
  await ensureRow(guildId, userId);
  await query(
    'UPDATE aura_users SET aura = aura + ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
    [delta, Date.now(), guildId, userId],
  );
  return getAura(guildId, userId);
}

async function setAura(guildId, userId, value) {
  await ensureRow(guildId, userId);
  await query(
    'UPDATE aura_users SET aura = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
    [value, Date.now(), guildId, userId],
  );
  return getAura(guildId, userId);
}

async function setBanned(guildId, userId, banned) {
  await ensureRow(guildId, userId);
  await query(
    'UPDATE aura_users SET banned = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
    [banned ? 1 : 0, Date.now(), guildId, userId],
  );
}

async function setLastClaim(guildId, userId, timestamp) {
  await ensureRow(guildId, userId);
  await query(
    'UPDATE aura_users SET last_claim = ?, updated_at = ? WHERE guild_id = ? AND user_id = ?',
    [timestamp, Date.now(), guildId, userId],
  );
}

async function resetUser(guildId, userId) {
  await ensureRow(guildId, userId);
  await query(
    'UPDATE aura_users SET aura = 0, last_claim = 0, updated_at = ? WHERE guild_id = ? AND user_id = ?',
    [Date.now(), guildId, userId],
  );
}

async function getAuraLeaderboard(guildId, limit, direction = 'desc') {
  const dir = direction === 'asc' ? 'ASC' : 'DESC';
  const [rows] = await query(
    `SELECT user_id, aura FROM aura_users WHERE guild_id = ? AND banned = 0 ORDER BY aura ${dir} LIMIT ?`,
    [guildId, limit],
  );
  return rows.map((r) => ({ userId: r.user_id, aura: Number(r.aura) }));
}

async function removeAuraData(guildId, userId) {
  const [result] = await query('DELETE FROM aura_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return result.affectedRows > 0;
}

module.exports = {
  getAura,
  addAura,
  setAura,
  setBanned,
  setLastClaim,
  resetUser,
  getAuraLeaderboard,
  removeAuraData,
};
const { query } = require('./db');

function toSafeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.floor(fallback);
  return Math.floor(parsed);
}

function rowToBan(row) {
  if (!row) return null;
  return {
    moderatorId: String(row.moderator_id || ''),
    moderatorName: String(row.moderator_name || 'Desconocido'),
    reason: String(row.reason || 'Sin motivo especificado'),
    startedAt: Number(row.started_at) || 0,
    durationMs: Number(row.duration_ms) || 0,
    expiresAt: Number(row.expires_at) || 0,
    permanent: Boolean(row.permanent),
    active: Boolean(row.active),
  };
}

async function getEconomyBanStatus(guildId, userId, now = Date.now()) {
  const [rows] = await query('SELECT * FROM economyban WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!rows.length) return { banned: false, ban: null };

  const activeBan = rowToBan(rows[0]);
  if (!activeBan.active) return { banned: false, ban: null };

  if (activeBan.expiresAt && now >= activeBan.expiresAt && activeBan.durationMs > 0) {
    await query('UPDATE economyban SET active = 0 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
    return { banned: false, ban: null, expired: true };
  }

  return {
    banned: true,
    ban: {
      ...activeBan,
      remainingMs: activeBan.permanent ? null : Math.max(0, activeBan.expiresAt - now),
    },
  };
}

async function setEconomyBan(guildId, userId, banData = {}) {
  const startedAt = Math.max(0, toSafeInt(banData.startedAt, Date.now()));
  const durationMs = Math.max(0, toSafeInt(banData.durationMs, 0));
  const expiresAt = durationMs <= 0
    ? 0
    : Math.max(startedAt + 60_000, toSafeInt(banData.expiresAt, startedAt + durationMs));
  const permanent = durationMs <= 0 || expiresAt === 0;

  const activeBan = {
    moderatorId: String(banData.moderatorId || ''),
    moderatorName: String(banData.moderatorName || 'Desconocido'),
    reason: String(banData.reason || 'Sin motivo especificado'),
    startedAt,
    durationMs,
    expiresAt,
    permanent,
    active: true,
  };

  await query(
    `INSERT INTO economyban (guild_id, user_id, moderator_id, moderator_name, reason, started_at, duration_ms, expires_at, permanent, active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON DUPLICATE KEY UPDATE moderator_id = VALUES(moderator_id), moderator_name = VALUES(moderator_name), reason = VALUES(reason),
       started_at = VALUES(started_at), duration_ms = VALUES(duration_ms), expires_at = VALUES(expires_at), permanent = VALUES(permanent), active = 1`,
    [guildId, userId, activeBan.moderatorId, activeBan.moderatorName, activeBan.reason, startedAt, durationMs, expiresAt, permanent ? 1 : 0]
  );

  return activeBan;
}

async function clearEconomyBan(guildId, userId) {
  const [rows] = await query('SELECT * FROM economyban WHERE guild_id = ? AND user_id = ? AND active = 1', [guildId, userId]);
  if (!rows.length) {
    return { ok: false, reason: 'no_active_ban' };
  }

  const currentBan = rowToBan(rows[0]);
  await query('UPDATE economyban SET active = 0 WHERE guild_id = ? AND user_id = ?', [guildId, userId]);

  return { ok: true, ban: currentBan };
}

async function getActiveEconomyBans(guildId, now = Date.now()) {
  const [rows] = await query('SELECT * FROM economyban WHERE guild_id = ? AND active = 1', [guildId]);
  const activeBans = [];

  for (const row of rows) {
    const ban = rowToBan(row);
    if (!ban.permanent && ban.expiresAt && now >= ban.expiresAt) continue;
    activeBans.push({
      userId: row.user_id,
      ...ban,
      remainingMs: ban.permanent ? null : Math.max(0, ban.expiresAt - now),
    });
  }

  return activeBans.sort((a, b) => (a.permanent === b.permanent ? a.expiresAt - b.expiresAt : (a.permanent ? 1 : -1)));
}

async function appendEconomyBanLog(entry) {
  await query(
    `INSERT INTO economyban_logs (action, guild_id, user_id, user_tag, username, moderator_id, moderator_name, reason, duration_ms, started_at, expires_at, created_at, active, permanent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entry.action || null,
      entry.guildId || null,
      entry.userId || null,
      entry.userTag || null,
      entry.username || null,
      entry.moderatorId || null,
      entry.moderatorName || null,
      entry.reason || null,
      toSafeInt(entry.durationMs, 0),
      toSafeInt(entry.startedAt, 0),
      toSafeInt(entry.expiresAt, 0),
      toSafeInt(entry.createdAt, Date.now()),
      entry.active ? 1 : 0,
      entry.permanent ? 1 : 0,
    ]
  );
  return entry;
}

async function removeEconomyBanLogs(guildId, userId) {
  const [result] = await query('DELETE FROM economyban_logs WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return { removed: result.affectedRows, ok: true };
}

async function getEconomyBanLogs(guildId, userId = null) {
  const params = [guildId];
  let sql = 'SELECT * FROM economyban_logs WHERE guild_id = ?';
  if (userId) {
    sql += ' AND user_id = ?';
    params.push(userId);
  }
  sql += ' ORDER BY created_at DESC';

  const [rows] = await query(sql, params);
  return rows.map(row => ({
    action: row.action,
    guildId: row.guild_id,
    userId: row.user_id,
    userTag: row.user_tag,
    username: row.username,
    moderatorId: row.moderator_id,
    moderatorName: row.moderator_name,
    reason: row.reason,
    durationMs: Number(row.duration_ms) || 0,
    startedAt: Number(row.started_at) || 0,
    expiresAt: Number(row.expires_at) || 0,
    createdAt: Number(row.created_at) || 0,
    active: Boolean(row.active),
    permanent: Boolean(row.permanent),
  }));
}

function isEconomyCommand(command, canonicalName) {
  if (!command) return false;
  const name = String(canonicalName || command.name || '').toLowerCase();
  if (name === 'economyban') return false;
  return String(command.help?.category || '') === '💰 Economía';
}

module.exports = {
  getEconomyBanStatus,
  setEconomyBan,
  clearEconomyBan,
  getActiveEconomyBans,
  appendEconomyBanLog,
  removeEconomyBanLogs,
  getEconomyBanLogs,
  isEconomyCommand,
};

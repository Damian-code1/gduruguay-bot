const { query } = require('./db');

const DEFAULT_STATE = {
  locked: false,
  seasonNumber: 1,
  lastResetAt: 0,
  lastOpenedAt: 0,
  lockedBy: null,
  openedBy: null,
  lockedReason: null,
};

function rowToState(row) {
  if (!row) return { ...DEFAULT_STATE };
  return {
    locked: Boolean(row.locked),
    seasonNumber: Math.max(1, Number(row.season_number) || 1),
    lastResetAt: Number(row.last_reset_at) || 0,
    lastOpenedAt: Number(row.last_opened_at) || 0,
    lockedBy: row.locked_by || null,
    openedBy: row.opened_by || null,
    lockedReason: row.locked_reason || null,
  };
}

async function getSeasonState(guildId) {
  const [rows] = await query('SELECT * FROM economy_season WHERE guild_id = ?', [guildId]);
  if (rows.length) return rowToState(rows[0]);

  await query(
    `INSERT INTO economy_season (guild_id, locked, season_number, last_reset_at, last_opened_at, locked_by, opened_by, locked_reason)
     VALUES (?, 0, 1, 0, 0, NULL, NULL, NULL)
     ON DUPLICATE KEY UPDATE guild_id = guild_id`,
    [guildId]
  );
  return { ...DEFAULT_STATE };
}

async function isEconomySeasonLocked(guildId) {
  const state = await getSeasonState(guildId);
  return Boolean(state.locked);
}

async function lockEconomySeason(guildId, metadata = {}) {
  await getSeasonState(guildId);
  const lastResetAt = Math.max(0, Math.floor(Number(metadata.at) || Date.now()));

  await query(
    `UPDATE economy_season SET locked = 1, last_reset_at = ?, locked_by = ?, locked_reason = ? WHERE guild_id = ?`,
    [lastResetAt, metadata.by || null, metadata.reason || null, guildId]
  );

  return getSeasonState(guildId);
}

async function openEconomySeason(guildId, metadata = {}) {
  const current = await getSeasonState(guildId);
  const lastOpenedAt = Math.max(0, Math.floor(Number(metadata.at) || Date.now()));
  const nextSeasonNumber = Math.max(1, current.seasonNumber + 1);

  await query(
    `UPDATE economy_season SET locked = 0, season_number = ?, last_opened_at = ?, opened_by = ?, locked_reason = NULL WHERE guild_id = ?`,
    [nextSeasonNumber, lastOpenedAt, metadata.by || null, guildId]
  );

  return getSeasonState(guildId);
}

module.exports = {
  getSeasonState,
  isEconomySeasonLocked,
  lockEconomySeason,
  openEconomySeason,
};
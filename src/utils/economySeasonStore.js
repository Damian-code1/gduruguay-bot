const fs = require('fs');
const path = require('path');

const seasonPath = path.join(__dirname, '../economy-season.json');

const DEFAULT_STATE = {
  locked: false,
  seasonNumber: 1,
  lastResetAt: 0,
  lastOpenedAt: 0,
  lockedBy: null,
  openedBy: null,
  lockedReason: null,
};

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback = {}) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeState(rawState = {}) {
  return {
    locked: Boolean(rawState.locked),
    seasonNumber: Math.max(1, Math.floor(Number(rawState.seasonNumber) || 1)),
    lastResetAt: Math.max(0, Math.floor(Number(rawState.lastResetAt) || 0)),
    lastOpenedAt: Math.max(0, Math.floor(Number(rawState.lastOpenedAt) || 0)),
    lockedBy: rawState.lockedBy || null,
    openedBy: rawState.openedBy || null,
    lockedReason: rawState.lockedReason || null,
  };
}

function getSeasonState(guildId) {
  const all = readJson(seasonPath, {});
  if (!all[guildId]) {
    all[guildId] = { ...DEFAULT_STATE };
    writeJson(seasonPath, all);
  }

  const normalized = normalizeState(all[guildId]);
  if (JSON.stringify(normalized) !== JSON.stringify(all[guildId])) {
    all[guildId] = normalized;
    writeJson(seasonPath, all);
  }

  return normalized;
}

function isEconomySeasonLocked(guildId) {
  return Boolean(getSeasonState(guildId).locked);
}

function lockEconomySeason(guildId, metadata = {}) {
  const all = readJson(seasonPath, {});
  const current = getSeasonState(guildId);
  all[guildId] = {
    ...current,
    locked: true,
    lastResetAt: Math.max(0, Math.floor(Number(metadata.at) || Date.now())),
    lockedBy: metadata.by || null,
    lockedReason: metadata.reason || null,
  };
  writeJson(seasonPath, all);
  return normalizeState(all[guildId]);
}

function openEconomySeason(guildId, metadata = {}) {
  const all = readJson(seasonPath, {});
  const current = getSeasonState(guildId);
  all[guildId] = {
    ...current,
    locked: false,
    seasonNumber: Math.max(1, current.seasonNumber + 1),
    lastOpenedAt: Math.max(0, Math.floor(Number(metadata.at) || Date.now())),
    openedBy: metadata.by || null,
    lockedReason: null,
  };
  writeJson(seasonPath, all);
  return normalizeState(all[guildId]);
}

module.exports = {
  getSeasonState,
  isEconomySeasonLocked,
  lockEconomySeason,
  openEconomySeason,
};
const fs = require('fs');
const path = require('path');

const auraPath = path.join(__dirname, '../aura-users.json');

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

function ensureAuraRecord(guildId, userId) {
  const all = readJson(auraPath, {});
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId][userId]) {
    all[guildId][userId] = {
      aura: 0,
      updatedAt: 0,
    };
    writeJson(auraPath, all);
  }
  return all[guildId][userId];
}

function getAura(guildId, userId) {
  const record = ensureAuraRecord(guildId, userId);
  return {
    aura: Number(record.aura) || 0,
    updatedAt: Number(record.updatedAt) || 0,
  };
}

function addAura(guildId, userId, amount) {
  const all = readJson(auraPath, {});
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId][userId]) {
    all[guildId][userId] = { aura: 0, updatedAt: 0 };
  }

  const current = Number(all[guildId][userId].aura) || 0;
  const delta = Number(amount) || 0;
  const next = current + delta;

  all[guildId][userId] = {
    aura: next,
    updatedAt: Date.now(),
  };

  writeJson(auraPath, all);

  return {
    aura: next,
    updatedAt: all[guildId][userId].updatedAt,
  };
}

function getAuraLeaderboard(guildId, limit = 10, direction = 'desc') {
  const all = readJson(auraPath, {});
  const guildData = all[guildId] || {};

  const sortFactor = String(direction).toLowerCase() === 'asc' ? 1 : -1;

  return Object.entries(guildData)
    .map(([userId, record]) => ({
      userId,
      aura: Number(record?.aura) || 0,
      updatedAt: Number(record?.updatedAt) || 0,
    }))
    .sort((a, b) => sortFactor * (auraCompare(a.aura, b.aura)))
    .slice(0, Math.max(1, Math.min(250, Math.floor(limit || 10))));
}

function auraCompare(a, b) {
  return Number(a) - Number(b);
}

function removeAuraData(guildId, userId) {
  const all = readJson(auraPath, {});
  if (!all[guildId]?.[userId]) return false;

  delete all[guildId][userId];

  if (Object.keys(all[guildId]).length === 0) {
    delete all[guildId];
  }

  writeJson(auraPath, all);
  return true;
}

module.exports = {
  getAura,
  addAura,
  getAuraLeaderboard,
  removeAuraData,
};

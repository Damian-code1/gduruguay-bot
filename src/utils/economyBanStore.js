const fs = require('fs');
const path = require('path');

const bansPath = path.join(__dirname, '../economyban.json');
const logsPath = path.join(__dirname, '../economyban-logs.json');

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function toSafeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.floor(fallback);
  return Math.floor(parsed);
}

function normalizeBan(rawBan) {
  if (!rawBan || typeof rawBan !== 'object') return null;

  const startedAt = Math.max(0, toSafeInt(rawBan.startedAt, 0));
  const durationMs = Math.max(0, toSafeInt(rawBan.durationMs, 0));
  const expiresAt = Math.max(0, toSafeInt(rawBan.expiresAt, startedAt + durationMs));
  const permanent = durationMs === 0 || expiresAt === 0;

  return {
    moderatorId: String(rawBan.moderatorId || ''),
    moderatorName: String(rawBan.moderatorName || 'Desconocido'),
    reason: String(rawBan.reason || 'Sin motivo especificado'),
    startedAt,
    durationMs,
    expiresAt,
    permanent,
    active: permanent || expiresAt > Date.now(),
  };
}

function sameBanRecord(a, b) {
  if (!a || !b) return false;
  return [
    'moderatorId',
    'moderatorName',
    'reason',
    'startedAt',
    'durationMs',
    'expiresAt',
  ].every(key => String(a[key] ?? '') === String(b[key] ?? ''));
}

function ensureGuildData(guildId) {
  const all = readJson(bansPath, {});
  if (!all[guildId] || typeof all[guildId] !== 'object') {
    all[guildId] = { users: {} };
    writeJson(bansPath, all);
  }

  const guildData = all[guildId];
  if (!guildData.users || typeof guildData.users !== 'object') {
    guildData.users = {};
  }

  let changed = false;
  for (const [userId, userData] of Object.entries(guildData.users)) {
    if (!userData || typeof userData !== 'object') {
      delete guildData.users[userId];
      changed = true;
      continue;
    }

    const normalized = normalizeBan(userData.activeBan);
    if (!normalized) {
      if (userData.activeBan !== undefined) {
        userData.activeBan = null;
        changed = true;
      }
      continue;
    }

    if (!sameBanRecord(userData.activeBan, normalized)) {
      userData.activeBan = normalized;
      changed = true;
    }
  }

  if (changed) {
    all[guildId] = guildData;
    writeJson(bansPath, all);
  }

  return guildData;
}

function getEconomyBanStatus(guildId, userId, now = Date.now()) {
  ensureGuildData(guildId);
  const all = readJson(bansPath, {});
  const guildData = all[guildId] || { users: {} };
  const userData = guildData.users?.[userId];
  const activeBan = normalizeBan(userData?.activeBan);

  if (!activeBan) {
    return { banned: false, ban: null };
  }

  if (activeBan.expiresAt && now >= activeBan.expiresAt && activeBan.durationMs > 0) {
    if (guildData.users?.[userId]) {
      guildData.users[userId].activeBan = null;
      all[guildId] = guildData;
      writeJson(bansPath, all);
    }

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

function setEconomyBan(guildId, userId, banData = {}) {
  ensureGuildData(guildId);
  const all = readJson(bansPath, {});
  const guildData = all[guildId] || { users: {} };

  if (!guildData.users[userId]) {
    guildData.users[userId] = { activeBan: null };
  }

  const startedAt = Math.max(0, toSafeInt(banData.startedAt, Date.now()));
  const durationMs = Math.max(0, toSafeInt(banData.durationMs, 0));
  const expiresAt = durationMs <= 0
    ? 0
    : Math.max(startedAt + 60_000, toSafeInt(banData.expiresAt, startedAt + durationMs));

  const activeBan = {
    moderatorId: String(banData.moderatorId || ''),
    moderatorName: String(banData.moderatorName || 'Desconocido'),
    reason: String(banData.reason || 'Sin motivo especificado'),
    startedAt,
    durationMs,
    expiresAt,
    permanent: durationMs <= 0 || expiresAt === 0,
    active: true,
  };

  guildData.users[userId].activeBan = activeBan;
  all[guildId] = guildData;
  writeJson(bansPath, all);

  return activeBan;
}

function clearEconomyBan(guildId, userId) {
  ensureGuildData(guildId);
  const all = readJson(bansPath, {});
  const guildData = all[guildId] || { users: {} };
  const userData = guildData.users?.[userId];
  const currentBan = normalizeBan(userData?.activeBan);

  if (!currentBan) {
    return { ok: false, reason: 'no_active_ban' };
  }

  guildData.users[userId].activeBan = null;
  all[guildId] = guildData;
  writeJson(bansPath, all);

  return { ok: true, ban: currentBan };
}

function getActiveEconomyBans(guildId, now = Date.now()) {
  const guildData = ensureGuildData(guildId);
  const activeBans = [];

  for (const [userId, userData] of Object.entries(guildData.users || {})) {
    const ban = normalizeBan(userData?.activeBan);
    if (!ban) continue;
    if (!ban.permanent && ban.expiresAt && now >= ban.expiresAt) continue;
    activeBans.push({
      userId,
      ...ban,
      remainingMs: ban.permanent ? null : Math.max(0, ban.expiresAt - now),
    });
  }

  return activeBans.sort((a, b) => (a.permanent === b.permanent ? a.expiresAt - b.expiresAt : (a.permanent ? 1 : -1)));
}

function appendEconomyBanLog(entry) {
  const logs = readJson(logsPath, []);
  logs.push(entry);
  writeJson(logsPath, logs);
  return entry;
}

function removeEconomyBanLogs(guildId, userId) {
  const logs = readJson(logsPath, []);
  const before = logs.length;
  const filtered = logs.filter(entry => !(entry && entry.guildId === guildId && entry.userId === userId));
  const removed = before - filtered.length;
  if (removed > 0) writeJson(logsPath, filtered);
  return { removed, ok: true };
}

function getEconomyBanLogs(guildId, userId = null) {
  const logs = readJson(logsPath, []);
  return logs
    .filter(entry => entry && entry.guildId === guildId && (!userId || entry.userId === userId))
    .sort((a, b) => toSafeInt(b.createdAt, 0) - toSafeInt(a.createdAt, 0));
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

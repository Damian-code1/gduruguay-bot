const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../temp-bans.json');
const activeTimers = new Map();
const MAX_TIMEOUT_MS = 2_147_483_647;

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function writeData(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearTempBanTimer(guildId, userId) {
  const k = key(guildId, userId);
  const existing = activeTimers.get(k);
  if (existing) {
    clearTimeout(existing);
    activeTimers.delete(k);
  }
}

function removeTempBanRecord(guildId, userId) {
  const data = readData();
  const k = key(guildId, userId);
  if (data[k]) {
    delete data[k];
    writeData(data);
  }
  clearTempBanTimer(guildId, userId);
}

function saveTempBanRecord(record) {
  const data = readData();
  const k = key(record.guildId, record.userId);
  data[k] = {
    guildId: String(record.guildId),
    userId: String(record.userId),
    userTag: String(record.userTag || ''),
    moderatorId: String(record.moderatorId || ''),
    moderatorTag: String(record.moderatorTag || ''),
    reason: String(record.reason || 'Sin razón especificada'),
    expiresAt: Number(record.expiresAt || 0),
    createdAt: Number(record.createdAt || Date.now()),
  };
  writeData(data);
  return data[k];
}

function scheduleTempBan(client, record) {
  if (!record?.guildId || !record?.userId || !record?.expiresAt) return null;

  const k = key(record.guildId, record.userId);
  clearTempBanTimer(record.guildId, record.userId);

  const run = async () => {
    const data = readData();
    const current = data[k];
    if (!current) return;

    if (Number(current.expiresAt) > Date.now()) {
      scheduleTempBan(client, current);
      return;
    }

    const guild = client.guilds.cache.get(current.guildId) || await client.guilds.fetch(current.guildId).catch(() => null);
    if (guild) {
      await guild.bans.remove(current.userId, 'Tempban expirado').catch(() => null);
    }

    removeTempBanRecord(current.guildId, current.userId);
  };

  const delay = Math.max(1000, Number(record.expiresAt) - Date.now());
  if (delay <= MAX_TIMEOUT_MS) {
    const timer = setTimeout(run, delay);
    timer.unref?.();
    activeTimers.set(k, timer);
  } else {
    const timer = setTimeout(() => {
      scheduleTempBan(client, record);
    }, MAX_TIMEOUT_MS);
    timer.unref?.();
    activeTimers.set(k, timer);
  }

  return activeTimers.get(k) || null;
}

function initializeTempBanScheduler(client) {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();

  const data = readData();
  for (const record of Object.values(data)) {
    if (!record?.guildId || !record?.userId || !record?.expiresAt) continue;
    if (Number(record.expiresAt) <= Date.now()) {
      scheduleTempBan(client, record);
    } else {
      scheduleTempBan(client, record);
    }
  }
}

module.exports = {
  saveTempBanRecord,
  removeTempBanRecord,
  scheduleTempBan,
  initializeTempBanScheduler,
};

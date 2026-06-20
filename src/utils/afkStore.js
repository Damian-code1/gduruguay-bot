const fs = require('fs');
const path = require('path');

const afkPath = path.join(__dirname, '../afk.json');
const HISTORY_TTL_MS = 20 * 60 * 1000;
const cleanupTimers = new Map();

function ensureFile() {
  if (!fs.existsSync(afkPath)) {
    fs.writeFileSync(afkPath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  const data = JSON.parse(fs.readFileSync(afkPath, 'utf8'));
  const now = Date.now();
  let changed = false;

  for (const [k, record] of Object.entries(data)) {
    if (!record || typeof record !== 'object') {
      delete data[k];
      changed = true;
      continue;
    }

    if (record.state === 'history' && record.expiresAt && Number(record.expiresAt) <= now) {
      delete data[k];
      changed = true;
    }
  }

  if (changed) writeData(data);
  return data;
}

function writeData(data) {
  fs.writeFileSync(afkPath, JSON.stringify(data, null, 2));
}

function key(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearCleanupTimer(k) {
  const timer = cleanupTimers.get(k);
  if (timer) clearTimeout(timer);
  cleanupTimers.delete(k);
}

function scheduleHistoryCleanup(k, expiresAt) {
  clearCleanupTimer(k);
  const delay = Math.max(1000, Number(expiresAt) - Date.now());
  const timer = setTimeout(() => {
    const data = readData();
    if (data[k]?.state === 'history' && Number(data[k].expiresAt) <= Date.now()) {
      delete data[k];
      writeData(data);
    }
    clearCleanupTimer(k);
  }, delay);
  timer.unref?.();
  cleanupTimers.set(k, timer);
}

function setAfk(guildId, userId, payload) {
  const data = readData();
  const k = key(guildId, userId);
  clearCleanupTimer(k);
  data[k] = {
    state: 'active',
    reason: String(payload?.reason || 'AFK'),
    since: Number(payload?.since || Date.now()),
    username: String(payload?.username || ''),
    previousNickname: payload?.previousNickname ?? null,
    mentions: [],
    mentionCount: 0,
  };
  writeData(data);
}

function getAfk(guildId, userId) {
  const data = readData();
  const record = data[key(guildId, userId)] || null;
  return record?.state === 'active' ? record : null;
}

function clearAfk(guildId, userId) {
  const data = readData();
  const k = key(guildId, userId);
  const record = data[k];
  const had = Boolean(record?.state === 'active');
  if (had) {
    data[k] = {
      ...record,
      state: 'history',
      returnedAt: Date.now(),
      expiresAt: Date.now() + HISTORY_TTL_MS,
    };
    writeData(data);
    scheduleHistoryCleanup(k, data[k].expiresAt);
  }
  return had;
}

function recordAfkMention(guildId, userId, mention) {
  const data = readData();
  const k = key(guildId, userId);
  const record = data[k];
  if (!record || record.state !== 'active') return null;

  const nextMention = {
    userId: String(mention?.userId || ''),
    username: String(mention?.username || 'Usuario'),
    content: String(mention?.content || '').slice(0, 500),
    channelId: String(mention?.channelId || ''),
    channelName: String(mention?.channelName || ''),
    timestamp: Number(mention?.timestamp || Date.now()),
  };

  record.mentions = Array.isArray(record.mentions) ? record.mentions : [];
  record.mentions.push(nextMention);
  record.mentionCount = Number(record.mentionCount || 0) + 1;
  data[k] = record;
  writeData(data);
  return record;
}

function getLastAfkMentions(guildId, userId) {
  const data = readData();
  const record = data[key(guildId, userId)] || null;
  if (!record || record.state !== 'history') return null;
  return record;
}

module.exports = {
  setAfk,
  getAfk,
  clearAfk,
  recordAfkMention,
  getLastAfkMentions,
};

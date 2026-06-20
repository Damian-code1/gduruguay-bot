const fs = require('fs');
const path = require('path');

const lockStorePath = path.join(__dirname, '../locks.json');

function ensureFile() {
  if (!fs.existsSync(lockStorePath)) {
    fs.writeFileSync(lockStorePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(lockStorePath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(lockStorePath, JSON.stringify(data, null, 2));
}

function setLock(channelId, guildId, durationMs, unlocksAt) {
  const data = readData();
  data[channelId] = {
    guildId,
    lockedAt: Date.now(),
    duration: durationMs,
    unlocksAt,
  };
  writeData(data);
  return data[channelId];
}

function getLock(channelId) {
  const data = readData();
  return data[channelId] || null;
}

function removeLock(channelId) {
  const data = readData();
  const had = Boolean(data[channelId]);
  if (had) {
    delete data[channelId];
    writeData(data);
  }
  return had;
}

function isLockedTemporary(channelId) {
  const lock = getLock(channelId);
  if (!lock) return false;
  return Date.now() < lock.unlocksAt;
}

function getActiveLocks(guildId) {
  const data = readData();
  const now = Date.now();
  const activeLocks = [];
  
  for (const [channelId, lock] of Object.entries(data)) {
    if (lock.guildId === guildId && now < lock.unlocksAt) {
      activeLocks.push({
        channelId,
        ...lock,
      });
    }
  }
  
  return activeLocks;
}

module.exports = {
  setLock,
  getLock,
  removeLock,
  isLockedTemporary,
  getActiveLocks,
};

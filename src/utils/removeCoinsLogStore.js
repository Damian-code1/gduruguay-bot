const fs = require('fs');
const path = require('path');

const STORE_PATH = path.join(__dirname, '..', 'removecoins-logs.json');

function ensureDirectory() {
  const dir = path.dirname(STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readLogs() {
  ensureDirectory();
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, '{}');
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeLogs(data) {
  ensureDirectory();
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

function addRemoveCoinsLog(guildId, entry) {
  const logs = readLogs();
  if (!logs[guildId]) logs[guildId] = [];

  logs[guildId].push({
    at: entry.at || Date.now(),
    staffId: entry.staffId,
    staffTag: entry.staffTag,
    targetId: entry.targetId,
    targetTag: entry.targetTag,
    amount: entry.amount,
    reason: entry.reason || '',
  });

  // Keep max 1000 logs per guild
  if (logs[guildId].length > 1000) {
    logs[guildId] = logs[guildId].slice(-1000);
  }

  writeLogs(logs);
}

function getRemoveCoinsLogs(guildId) {
  const logs = readLogs();
  const guildLogs = logs[guildId] || [];
  return guildLogs.sort((a, b) => Number(b.at) - Number(a.at));
}

module.exports = {
  addRemoveCoinsLog,
  getRemoveCoinsLogs,
};

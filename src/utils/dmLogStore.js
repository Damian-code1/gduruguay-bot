const fs = require('fs');
const path = require('path');

const LOG_PATH = path.join(__dirname, '../dm-logs.json');
const MAX_LOGS = 20;

function ensureFile() {
  if (!fs.existsSync(LOG_PATH)) {
    fs.writeFileSync(LOG_PATH, JSON.stringify([], null, 2));
  }
}

function readLogs() {
  ensureFile();
  try {
    const data = JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  fs.writeFileSync(LOG_PATH, JSON.stringify(logs.slice(-MAX_LOGS), null, 2));
}

function recordDmLog(entry) {
  const logs = readLogs();
  logs.push({
    id: String(entry?.id || Date.now()),
    authorId: String(entry?.authorId || ''),
    authorTag: String(entry?.authorTag || ''),
    targetId: String(entry?.targetId || ''),
    targetTag: String(entry?.targetTag || ''),
    content: String(entry?.content || '').slice(0, 2000),
    createdAt: Number(entry?.createdAt || Date.now()),
  });

  writeLogs(logs);
  return logs.at(-1) || null;
}

function getRecentDmLogs(limit = 20) {
  const logs = readLogs();
  return logs.slice(-Math.max(1, Math.min(20, Number(limit) || 20)));
}

module.exports = {
  recordDmLog,
  getRecentDmLogs,
};

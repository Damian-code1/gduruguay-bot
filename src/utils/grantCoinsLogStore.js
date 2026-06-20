const fs = require('fs');
const path = require('path');

const gcLogsPath = path.join(__dirname, '../grantcoins-logs.json');
const MAX_LOGS_PER_GUILD = 1000;

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

function addGrantCoinsLog(guildId, entry) {
  const all = readJson(gcLogsPath, {});
  if (!all[guildId]) all[guildId] = [];

  const normalized = {
    at: Number(entry?.at) || Date.now(),
    staffId: String(entry?.staffId || ''),
    staffTag: String(entry?.staffTag || ''),
    targetId: String(entry?.targetId || ''),
    targetTag: String(entry?.targetTag || ''),
    amount: Math.max(0, Math.floor(Number(entry?.amount) || 0)),
    reason: String(entry?.reason || ''),
  };

  all[guildId].push(normalized);
  if (all[guildId].length > MAX_LOGS_PER_GUILD) {
    all[guildId] = all[guildId].slice(all[guildId].length - MAX_LOGS_PER_GUILD);
  }

  writeJson(gcLogsPath, all);
  return normalized;
}

function getGrantCoinsLogs(guildId) {
  const all = readJson(gcLogsPath, {});
  const entries = Array.isArray(all[guildId]) ? all[guildId] : [];
  return [...entries].sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
}

module.exports = {
  addGrantCoinsLog,
  getGrantCoinsLogs,
};

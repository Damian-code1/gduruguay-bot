const fs = require('fs');
const path = require('path');

const warningsPath = path.join(__dirname, '../warnings.json');

function ensureFile() {
  if (!fs.existsSync(warningsPath)) {
    fs.writeFileSync(warningsPath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(warningsPath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(warningsPath, JSON.stringify(data, null, 2));
}

function addWarning(guildId, userId, warning) {
  const data = readData();
  if (!data[guildId]) data[guildId] = {};
  if (!data[guildId][userId]) data[guildId][userId] = [];
  data[guildId][userId].push(warning);
  writeData(data);
  return data[guildId][userId];
}

function getWarnings(guildId, userId) {
  const data = readData();
  return data[guildId]?.[userId] || [];
}

function clearWarnings(guildId, userId) {
  const data = readData();
  const list = data[guildId]?.[userId] || [];

  if (data[guildId]) {
    delete data[guildId][userId];
    if (!Object.keys(data[guildId]).length) delete data[guildId];
    writeData(data);
  }

  return list.length;
}

function clearSpecificWarning(guildId, userId, index) {
  const data = readData();
  if (!data[guildId]?.[userId]) return false;
  
  const warnings = data[guildId][userId];
  if (index < 0 || index >= warnings.length) return false;
  
  warnings.splice(index, 1);
  
  if (warnings.length === 0) {
    delete data[guildId][userId];
    if (!Object.keys(data[guildId]).length) delete data[guildId];
  }
  
  writeData(data);
  return true;
}

module.exports = {
  addWarning,
  getWarnings,
  clearWarnings,
  clearSpecificWarning,
};

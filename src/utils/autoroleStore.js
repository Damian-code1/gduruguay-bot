const fs = require('fs');
const path = require('path');

const autorolePath = path.join(__dirname, '../autorole.json');

function ensureFile() {
  if (!fs.existsSync(autorolePath)) {
    fs.writeFileSync(autorolePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(autorolePath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(autorolePath, JSON.stringify(data, null, 2));
}

function setAutorole(guildId, roleId) {
  const data = readData();
  data[guildId] = roleId;
  writeData(data);
}

function getAutorole(guildId) {
  const data = readData();
  return data[guildId] || null;
}

function clearAutorole(guildId) {
  const data = readData();
  const had = Boolean(data[guildId]);
  if (had) {
    delete data[guildId];
    writeData(data);
  }
  return had;
}

module.exports = {
  setAutorole,
  getAutorole,
  clearAutorole,
};

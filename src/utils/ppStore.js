const fs = require('fs');
const path = require('path');

const ppStorePath = path.join(__dirname, '../pp-store.json');

function ensureFile() {
  if (!fs.existsSync(ppStorePath)) {
    fs.writeFileSync(ppStorePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(ppStorePath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(ppStorePath, JSON.stringify(data, null, 2));
}

function getPpSize(userId) {
  const data = readData();
  return data[userId] || null;
}

function setPpSize(userId, size, timestamp = Date.now()) {
  const data = readData();
  data[userId] = {
    size,
    timestamp,
  };
  writeData(data);
  return data[userId];
}

function shouldReset(userId) {
  const ppData = getPpSize(userId);
  if (!ppData) return true;
  
  const now = Date.now();
  const fourteenDays = 14 * 24 * 60 * 60 * 1000; // 14 días en ms
  
  return (now - ppData.timestamp) >= fourteenDays;
}

function generateRandomSize() {
  return Math.floor(Math.random() * 21); // 0-20 cm
}

module.exports = {
  getPpSize,
  setPpSize,
  shouldReset,
  generateRandomSize,
};

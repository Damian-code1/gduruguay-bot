const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../target-replies.json');

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function setTargetReply(guildId, userId, channelId, replyText, updatedBy, updatedAt) {
  const data = readData();
  if (!data[guildId]) data[guildId] = {};
  data[guildId][userId] = {
    channelId,
    replyText,
    updatedBy,
    updatedAt,
  };
  writeData(data);
  return data[guildId][userId];
}

function getTargetReply(guildId, userId) {
  const data = readData();
  return data[guildId]?.[userId] || null;
}

function removeTargetReply(guildId, userId) {
  const data = readData();
  const had = Boolean(data[guildId]?.[userId]);
  if (had) {
    delete data[guildId][userId];
    if (Object.keys(data[guildId]).length === 0) {
      delete data[guildId];
    }
    writeData(data);
  }
  return had;
}

function getAllTargetReplies(guildId) {
  const data = readData();
  return data[guildId] || {};
}

function clearTargetReply(guildId) {
  const data = readData();
  const had = Boolean(data[guildId]);
  if (had) {
    delete data[guildId];
    writeData(data);
  }
  return had;
}

module.exports = {
  setTargetReply,
  getTargetReply,
  removeTargetReply,
  getAllTargetReplies,
  clearTargetReply,
};

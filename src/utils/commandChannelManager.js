const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../command-channels.json');

function ensureConfigFile() {
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify({}, null, 2));
  }
}

function readConfig() {
  ensureConfigFile();
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

function writeConfig(config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

function getAllowedChannels(guildId) {
  const config = readConfig();
  return config[guildId] || [];
}

function setAllowedChannels(guildId, channelIds) {
  const unique = [...new Set(channelIds)];
  const config = readConfig();
  config[guildId] = unique;
  writeConfig(config);
  return unique;
}

function addAllowedChannels(guildId, channelIds) {
  const current = getAllowedChannels(guildId);
  return setAllowedChannels(guildId, [...current, ...channelIds]);
}

function removeAllowedChannels(guildId, channelIds) {
  const removeSet = new Set(channelIds);
  const current = getAllowedChannels(guildId);
  return setAllowedChannels(guildId, current.filter(id => !removeSet.has(id)));
}

function clearAllowedChannels(guildId) {
  const config = readConfig();
  delete config[guildId];
  writeConfig(config);
}

function isCommandAllowed(guildId, channelId) {
  const allowed = getAllowedChannels(guildId);
  if (!allowed.length) return true;
  return allowed.includes(channelId);
}

function formatAllowedChannels(channelIds) {
  if (!channelIds.length) return 'No configurado';
  return channelIds.map(id => `<#${id}>`).join(', ');
}

module.exports = {
  getAllowedChannels,
  setAllowedChannels,
  addAllowedChannels,
  removeAllowedChannels,
  clearAllowedChannels,
  isCommandAllowed,
  formatAllowedChannels,
};

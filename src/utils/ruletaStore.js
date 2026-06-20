const fs = require('fs');
const path = require('path');

const ruletaPath = path.join(__dirname, '../ruleta-state.json');
const DEFAULT_CHANCE = 0.02;
const INCREMENT = 0.00075;
const MAX_CHANCE = 0.18;

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

function ensureGuildState(guildId) {
  const all = readJson(ruletaPath, {});
  if (!all[guildId]) {
    all[guildId] = {
      currentChance: DEFAULT_CHANCE,
      lastUpdated: Date.now(),
    };
    writeJson(ruletaPath, all);
  }
  return all[guildId];
}

function getRuletaState(guildId) {
  const state = ensureGuildState(guildId);
  return {
    currentChance: Number(state.currentChance) || DEFAULT_CHANCE,
    lastUpdated: Number(state.lastUpdated) || 0,
  };
}

function setRuletaChance(guildId, chance) {
  const all = readJson(ruletaPath, {});
  if (!all[guildId]) all[guildId] = {};
  all[guildId].currentChance = Math.max(0, Math.min(MAX_CHANCE, Number(chance) || DEFAULT_CHANCE));
  all[guildId].lastUpdated = Date.now();
  writeJson(ruletaPath, all);
  return getRuletaState(guildId);
}

function bumpRuletaChance(guildId) {
  const state = getRuletaState(guildId);
  return setRuletaChance(guildId, state.currentChance + INCREMENT);
}

function resetRuletaChance(guildId) {
  return setRuletaChance(guildId, DEFAULT_CHANCE);
}

module.exports = {
  DEFAULT_CHANCE,
  INCREMENT,
  MAX_CHANCE,
  getRuletaState,
  setRuletaChance,
  bumpRuletaChance,
  resetRuletaChance,
};
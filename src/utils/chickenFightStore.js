const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../chicken-fight.json');

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

function ensureGuild(data, guildId) {
  if (!data[guildId]) data[guildId] = {};
  return data[guildId];
}

function buildDefaultChicken(name = 'Pollito') {
  return {
    name: String(name || 'Pollito').slice(0, 24),
    level: 1,
    exp: 0,
    wins: 0,
    losses: 0,
    atk: 10,
    def: 10,
    spd: 10,
    hp: 100,
    lastTrainAt: 0,
    lastFightAt: 0,
    createdAt: Date.now(),
  };
}

function getChicken(guildId, userId) {
  const data = readData();
  return data[guildId]?.[userId] || null;
}

function createChicken(guildId, userId, name) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  if (guild[userId]) return null;
  guild[userId] = buildDefaultChicken(name);
  writeData(data);
  return guild[userId];
}

function updateChicken(guildId, userId, updater) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  if (!guild[userId]) return null;

  const next = updater({ ...guild[userId] }) || guild[userId];
  guild[userId] = {
    ...guild[userId],
    ...next,
    level: Math.max(1, Math.floor(next.level || guild[userId].level || 1)),
    exp: Math.max(0, Math.floor(next.exp || 0)),
    wins: Math.max(0, Math.floor(next.wins || 0)),
    losses: Math.max(0, Math.floor(next.losses || 0)),
    atk: Math.max(1, Math.floor(next.atk || guild[userId].atk || 10)),
    def: Math.max(1, Math.floor(next.def || guild[userId].def || 10)),
    spd: Math.max(1, Math.floor(next.spd || guild[userId].spd || 10)),
    hp: Math.max(30, Math.floor(next.hp || guild[userId].hp || 100)),
    lastTrainAt: Math.max(0, Math.floor(next.lastTrainAt || guild[userId].lastTrainAt || 0)),
    lastFightAt: Math.max(0, Math.floor(next.lastFightAt || guild[userId].lastFightAt || 0)),
  };

  writeData(data);
  return guild[userId];
}

function setChickenName(guildId, userId, name) {
  return updateChicken(guildId, userId, current => ({ ...current, name: String(name || current.name).slice(0, 24) }));
}

function gainExp(guildId, userId, expAmount) {
  return updateChicken(guildId, userId, current => {
    let exp = (current.exp || 0) + Math.max(0, Math.floor(expAmount || 0));
    let level = current.level || 1;

    while (exp >= level * 120) {
      exp -= level * 120;
      level += 1;
    }

    return { ...current, exp, level };
  });
}

function setTrainCooldown(guildId, userId, timestamp = Date.now()) {
  return updateChicken(guildId, userId, current => ({ ...current, lastTrainAt: timestamp }));
}

function setFightCooldown(guildId, userId, timestamp = Date.now()) {
  return updateChicken(guildId, userId, current => ({ ...current, lastFightAt: timestamp }));
}

function addWin(guildId, userId) {
  return updateChicken(guildId, userId, current => ({ ...current, wins: (current.wins || 0) + 1 }));
}

function addLoss(guildId, userId) {
  return updateChicken(guildId, userId, current => ({ ...current, losses: (current.losses || 0) + 1 }));
}

function addStat(guildId, userId, stat, amount) {
  return updateChicken(guildId, userId, current => ({
    ...current,
    [stat]: Math.max(1, Math.floor((current[stat] || 1) + Math.floor(amount || 0))),
  }));
}

function getChickenLeaderboard(guildId, limit = 10) {
  const data = readData();
  const guild = data[guildId] || {};

  return Object.entries(guild)
    .map(([userId, chicken]) => {
      const wins = Number(chicken.wins) || 0;
      const losses = Number(chicken.losses) || 0;
      const level = Number(chicken.level) || 1;
      const score = (wins * 5) + (level * 3) - (losses * 2);
      return {
        userId,
        name: chicken.name || 'Pollito',
        level,
        wins,
        losses,
        score,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

module.exports = {
  getChicken,
  createChicken,
  updateChicken,
  setChickenName,
  gainExp,
  setTrainCooldown,
  setFightCooldown,
  addWin,
  addLoss,
  addStat,
  getChickenLeaderboard,
};

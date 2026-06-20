const fs = require('fs');
const path = require('path');
const { addToWallet } = require('./economyStore');

const passivePath = path.join(__dirname, '../passive-income.json');
const DEFAULT_INTERVAL_MS = 3_600_000;

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

function ensureGuildData(guildId) {
  const all = readJson(passivePath, {});
  if (!all[guildId]) {
    all[guildId] = {
      intervalMs: DEFAULT_INTERVAL_MS,
      roleRewards: {},
      users: {},
    };
    writeJson(passivePath, all);
  }

  const guildData = all[guildId];
  if (!guildData.intervalMs || guildData.intervalMs < 60_000) guildData.intervalMs = DEFAULT_INTERVAL_MS;
  if (!guildData.roleRewards || typeof guildData.roleRewards !== 'object') guildData.roleRewards = {};
  if (!guildData.users || typeof guildData.users !== 'object') guildData.users = {};

  for (const [userId, userData] of Object.entries(guildData.users)) {
    if (!userData || typeof userData !== 'object') {
      guildData.users[userId] = { lastPaidAt: 0, totalEarned: 0 };
      continue;
    }

    if (typeof userData.lastPaidAt !== 'number') {
      userData.lastPaidAt = Number(userData.lastPaidAt) || 0;
    }

    if (typeof userData.totalEarned !== 'number') {
      userData.totalEarned = Number(userData.totalEarned) || 0;
    }
  }

  all[guildId] = guildData;
  writeJson(passivePath, all);
  return guildData;
}

function getGuildPassiveConfig(guildId) {
  const guildData = ensureGuildData(guildId);
  return {
    intervalMs: Number(guildData.intervalMs) || DEFAULT_INTERVAL_MS,
    roleRewards: { ...(guildData.roleRewards || {}) },
  };
}

function setPassiveInterval(guildId, intervalMs) {
  const all = readJson(passivePath, {});
  const current = ensureGuildData(guildId);
  current.intervalMs = Math.max(60_000, Math.floor(intervalMs || DEFAULT_INTERVAL_MS));
  all[guildId] = current;
  writeJson(passivePath, all);
  return current.intervalMs;
}

function setPassiveRoleReward(guildId, roleId, amount) {
  const all = readJson(passivePath, {});
  const current = ensureGuildData(guildId);
  if (!current.roleRewards) current.roleRewards = {};
  current.roleRewards[roleId] = Math.max(1, Math.floor(amount || 0));
  all[guildId] = current;
  writeJson(passivePath, all);
  return current.roleRewards[roleId];
}

function removePassiveRoleReward(guildId, roleId) {
  const all = readJson(passivePath, {});
  const current = ensureGuildData(guildId);
  if (!current.roleRewards?.[roleId]) return false;
  delete current.roleRewards[roleId];
  all[guildId] = current;
  writeJson(passivePath, all);
  return true;
}

function getPassiveRoleRewards(guildId) {
  const guildData = ensureGuildData(guildId);
  return Object.entries(guildData.roleRewards || {})
    .map(([roleId, amount]) => ({ roleId, amount: Number(amount) || 0 }))
    .filter(item => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function getTrackedPassiveUserIds(guildId) {
  const guildData = ensureGuildData(guildId);
  return Object.keys(guildData.users || {});
}

function computeMemberRewardPerInterval(member, roleRewards) {
  if (!member?.roles?.cache) return { perInterval: 0, matchedRoles: 0 };
  let total = 0;
  let matchedRoles = 0;

  for (const [roleId, amount] of Object.entries(roleRewards || {})) {
    if (!member.roles.cache.has(roleId)) continue;
    const cleanAmount = Math.max(0, Math.floor(Number(amount) || 0));
    if (cleanAmount <= 0) continue;
    total += cleanAmount;
    matchedRoles += 1;
  }

  return {
    perInterval: Math.max(0, Math.floor(total)),
    matchedRoles,
  };
}

function tryGrantPassiveIncome(guildId, member, now = Date.now()) {
  const all = readJson(passivePath, {});
  const guildData = ensureGuildData(guildId);
  const intervalMs = Math.max(60_000, Number(guildData.intervalMs) || DEFAULT_INTERVAL_MS);
  const rewardData = computeMemberRewardPerInterval(member, guildData.roleRewards || {});
  const perInterval = rewardData.perInterval;
  const matchedRoles = rewardData.matchedRoles;

  if (perInterval <= 0) {
    return { granted: false, reason: 'no_roles', perInterval: 0, intervalMs, matchedRoles: 0 };
  }

  const userId = member.id;
  if (!guildData.users[userId]) {
    guildData.users[userId] = { lastPaidAt: now, totalEarned: 0 };
    all[guildId] = guildData;
    writeJson(passivePath, all);
    return { granted: false, reason: 'initialized', perInterval, intervalMs, remainingMs: intervalMs, matchedRoles };
  }

  const lastPaidAt = Number(guildData.users[userId].lastPaidAt) || 0;
  const elapsed = Math.max(0, now - lastPaidAt);
  const intervals = Math.floor(elapsed / intervalMs);

  if (intervals <= 0) {
    return {
      granted: false,
      reason: 'cooldown',
      perInterval,
      intervalMs,
      matchedRoles,
      remainingMs: Math.max(0, intervalMs - elapsed),
    };
  }

  const amount = perInterval * intervals;
  addToWallet(guildId, userId, amount);

  guildData.users[userId].lastPaidAt = lastPaidAt + (intervals * intervalMs);
  guildData.users[userId].totalEarned = (Number(guildData.users[userId].totalEarned) || 0) + amount;
  all[guildId] = guildData;
  writeJson(passivePath, all);

  return {
    granted: true,
    amount,
    intervals,
    perInterval,
    intervalMs,
    nextInMs: intervalMs,
    matchedRoles,
    totalEarned: Number(guildData.users[userId].totalEarned) || 0,
  };
}

function getPassiveStatus(guildId, member, now = Date.now()) {
  const guildData = ensureGuildData(guildId);
  const intervalMs = Math.max(60_000, Number(guildData.intervalMs) || DEFAULT_INTERVAL_MS);
  const rewardData = computeMemberRewardPerInterval(member, guildData.roleRewards || {});
  const perInterval = rewardData.perInterval;
  const matchedRoles = rewardData.matchedRoles;

  const userId = member.id;
  const userData = guildData.users?.[userId] || null;
  const lastPaidAt = Number(userData?.lastPaidAt) || 0;
  const totalEarned = Number(userData?.totalEarned) || 0;

  if (perInterval <= 0) {
    return { perInterval: 0, intervalMs, remainingMs: intervalMs, claimableIntervals: 0, totalEarned, matchedRoles: 0 };
  }

  if (!lastPaidAt) {
    return { perInterval, intervalMs, remainingMs: intervalMs, claimableIntervals: 0, totalEarned, matchedRoles };
  }

  const elapsed = Math.max(0, now - lastPaidAt);
  const claimableIntervals = Math.floor(elapsed / intervalMs);
  const remainingMs = claimableIntervals > 0 ? 0 : Math.max(0, intervalMs - elapsed);

  return {
    perInterval,
    intervalMs,
    remainingMs,
    claimableIntervals,
    claimableAmount: claimableIntervals * perInterval,
    totalEarned,
    matchedRoles,
  };
}

module.exports = {
  getGuildPassiveConfig,
  setPassiveInterval,
  setPassiveRoleReward,
  removePassiveRoleReward,
  getPassiveRoleRewards,
  getTrackedPassiveUserIds,
  tryGrantPassiveIncome,
  getPassiveStatus,
};

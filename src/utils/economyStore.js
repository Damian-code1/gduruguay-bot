const fs = require('fs');
const path = require('path');

const usersPath = path.join(__dirname, '../economy-users.json');
const configPath = path.join(__dirname, '../economy-config.json');
const shopPath = path.join(__dirname, '../economy-shop.json');
const cooldownsPath = path.join(__dirname, '../economy-cooldowns.json');
const robberyPath = path.join(__dirname, '../economy-robbery.json');
const robberyLogsPath = path.join(__dirname, '../economy-robbery-logs.json');

const DEFAULT_ROBBERY_VICTIM_COOLDOWN_MS = 45 * 60 * 1000;

const DEFAULT_CONFIG = {
  currencyEmoji: '🪙',
  currencyName: 'Monedas',
  messageReward: {
    enabled: true,
    min: 10,
    max: 25,
    cooldownMs: 60_000,
  },
  dailyReward: 3500,
  workRewardMin: 250,
  workRewardMax: 950,
  dailyCooldownMs: 86_400_000,
  workCooldownMs: 3_600_000,
};

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

function ensureGuildConfig(guildId) {
  const all = readJson(configPath, {});
  if (!all[guildId]) {
    all[guildId] = { ...DEFAULT_CONFIG };
    writeJson(configPath, all);
  }
  return all[guildId];
}

function getGuildConfig(guildId) {
  const config = ensureGuildConfig(guildId);
  return {
    ...DEFAULT_CONFIG,
    ...config,
    messageReward: {
      ...DEFAULT_CONFIG.messageReward,
      ...(config.messageReward || {}),
    },
  };
}

function setCurrencyEmoji(guildId, emoji) {
  const all = readJson(configPath, {});
  const current = getGuildConfig(guildId);
  all[guildId] = {
    ...current,
    currencyEmoji: emoji,
  };
  writeJson(configPath, all);
  return all[guildId];
}

function ensureUserRecord(guildId, userId) {
  const all = readJson(usersPath, {});
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId][userId]) {
    all[guildId][userId] = {
      wallet: 0,
      bank: 0,
      totalEarned: 0,
      totalSpent: 0,
      dailyStreak: 0,
      lastDailyAt: 0,
    };
  }

  if (typeof all[guildId][userId].bank !== 'number') {
    all[guildId][userId].bank = Number(all[guildId][userId].bank) || 0;
    writeJson(usersPath, all);
  }

  return all[guildId][userId];
}

function getUserBalance(guildId, userId) {
  const record = ensureUserRecord(guildId, userId);
  const wallet = Number(record.wallet) || 0;
  const bank = Number(record.bank) || 0;
  return {
    wallet,
    bank,
    total: wallet + bank,
    totalEarned: Number(record.totalEarned) || 0,
    totalSpent: Number(record.totalSpent) || 0,
    dailyStreak: Number(record.dailyStreak) || 0,
    lastDailyAt: Number(record.lastDailyAt) || 0,
  };
}

function updateUser(guildId, userId, updater) {
  const all = readJson(usersPath, {});
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId][userId]) {
    all[guildId][userId] = { wallet: 0, bank: 0, totalEarned: 0, totalSpent: 0, dailyStreak: 0, lastDailyAt: 0 };
  }

  const next = updater({ ...all[guildId][userId] }) || all[guildId][userId];
  all[guildId][userId] = {
    wallet: Math.max(0, Math.floor(next.wallet || 0)),
    bank: Math.max(0, Math.floor(next.bank || 0)),
    totalEarned: Math.max(0, Math.floor(next.totalEarned || 0)),
    totalSpent: Math.max(0, Math.floor(next.totalSpent || 0)),
    dailyStreak: Math.max(0, Math.floor(next.dailyStreak || 0)),
    lastDailyAt: Math.max(0, Math.floor(next.lastDailyAt || 0)),
  };

  writeJson(usersPath, all);
  return all[guildId][userId];
}

function addToWallet(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: (current.wallet || 0) + cleanAmount,
    totalEarned: (current.totalEarned || 0) + cleanAmount,
  }));
}

function addToWalletNoStats(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: (current.wallet || 0) + cleanAmount,
  }));
}

function setWalletNoStats(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: cleanAmount,
  }));
}

function removeFromWallet(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: Math.max(0, (current.wallet || 0) - cleanAmount),
    totalSpent: (current.totalSpent || 0) + cleanAmount,
  }));
}

function canAfford(guildId, userId, amount) {
  const balance = getUserBalance(guildId, userId);
  return balance.wallet >= amount;
}

function transferWallet(guildId, fromUserId, toUserId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return false;
  if (!canAfford(guildId, fromUserId, cleanAmount)) return false;

  removeFromWallet(guildId, fromUserId, cleanAmount);
  addToWallet(guildId, toUserId, cleanAmount);
  return true;
}

function depositToBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  let deposited = 0;
  updateUser(guildId, userId, current => {
    const wallet = Number(current.wallet) || 0;
    const bank = Number(current.bank) || 0;
    deposited = Math.min(cleanAmount, wallet);
    return {
      ...current,
      wallet: wallet - deposited,
      bank: bank + deposited,
    };
  });

  return deposited;
}

function withdrawFromBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  let withdrawn = 0;
  updateUser(guildId, userId, current => {
    const wallet = Number(current.wallet) || 0;
    const bank = Number(current.bank) || 0;
    withdrawn = Math.min(cleanAmount, bank);
    return {
      ...current,
      wallet: wallet + withdrawn,
      bank: bank - withdrawn,
    };
  });

  return withdrawn;
}

function removeFromBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  return updateUser(guildId, userId, current => ({
    ...current,
    bank: Math.max(0, (current.bank || 0) - cleanAmount),
    totalSpent: (current.totalSpent || 0) + cleanAmount,
  }));
}

function setDailyProgress(guildId, userId, streak, lastDailyAt) {
  return updateUser(guildId, userId, current => ({
    ...current,
    dailyStreak: Math.max(0, Math.floor(streak || 0)),
    lastDailyAt: Math.max(0, Math.floor(lastDailyAt || Date.now())),
  }));
}

function getLeaderboard(guildId, limit = 10, offset = 0) {
  const all = readJson(usersPath, {});
  const guildUsers = all[guildId] || {};
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));

  return Object.entries(guildUsers)
    .map(([userId, data]) => ({
      userId,
      wallet: Number(data.wallet) || 0,
      bank: Number(data.bank) || 0,
      total: (Number(data.wallet) || 0) + (Number(data.bank) || 0),
      totalEarned: Number(data.totalEarned) || 0,
      totalSpent: Number(data.totalSpent) || 0,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(safeOffset, safeOffset + safeLimit);
}

function getCooldown(guildId, userId, key) {
  const all = readJson(cooldownsPath, {});
  return Number(all[guildId]?.[userId]?.[key]) || 0;
}

function setCooldown(guildId, userId, key, value) {
  const all = readJson(cooldownsPath, {});
  if (!all[guildId]) all[guildId] = {};
  if (!all[guildId][userId]) all[guildId][userId] = {};
  const numericValue = Number(value);
  all[guildId][userId][key] = Number.isFinite(numericValue) ? numericValue : Date.now();
  writeJson(cooldownsPath, all);
}

function getRemainingCooldown(guildId, userId, key, cooldownMs) {
  const last = getCooldown(guildId, userId, key);
  const remaining = Math.max(0, cooldownMs - (Date.now() - last));
  return remaining;
}

function randomInt(min, max) {
  const low = Math.floor(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function tryGrantMessageReward(guildId, userId) {
  const config = getGuildConfig(guildId);
  if (!config.messageReward?.enabled) {
    return { granted: false, reason: 'disabled' };
  }

  const remaining = getRemainingCooldown(guildId, userId, 'message', config.messageReward.cooldownMs);
  if (remaining > 0) {
    return { granted: false, reason: 'cooldown', remaining };
  }

  const amount = randomInt(config.messageReward.min, config.messageReward.max);
  addToWallet(guildId, userId, amount);
  setCooldown(guildId, userId, 'message', Date.now());

  return { granted: true, amount };
}

function ensureGuildShopData(rawGuildData = {}) {
  const guildData = { ...rawGuildData };
  let changed = false;

  if (!guildData.roles) {
    guildData.roles = {};
    changed = true;
  }

  if (guildData.rolePrices && Object.keys(guildData.rolePrices).length > 0) {
    for (const [roleId, priceValue] of Object.entries(guildData.rolePrices)) {
      const price = Number(priceValue) || 0;
      if (price <= 0) continue;

      if (!guildData.roles[roleId]) {
        guildData.roles[roleId] = {
          roleId,
          roleName: null,
          price,
          incomeBonusPercent: 0,
          configuredAt: Date.now(),
          updatedAt: Date.now(),
          configuredBy: null,
        };
        changed = true;
      }
    }

    delete guildData.rolePrices;
    changed = true;
  }

  for (const [roleId, entry] of Object.entries(guildData.roles || {})) {
    if (!entry || typeof entry !== 'object') {
      delete guildData.roles[roleId];
      changed = true;
      continue;
    }

    const normalizedBonus = Number(entry.incomeBonusPercent);
    if (!Number.isFinite(normalizedBonus) || normalizedBonus < 0) {
      entry.incomeBonusPercent = 0;
      changed = true;
    }

    if (typeof entry.incomeBonusPercent === 'number' && entry.incomeBonusPercent !== Math.floor(entry.incomeBonusPercent * 100) / 100) {
      entry.incomeBonusPercent = Math.floor(entry.incomeBonusPercent * 100) / 100;
      changed = true;
    }

    if (!entry.roleId) {
      entry.roleId = roleId;
      changed = true;
    }
  }

  if (changed) {
    guildData.updatedAt = Date.now();
  }

  return guildData;
}

function getAllShopData() {
  const all = readJson(shopPath, {});
  let changed = false;

  for (const guildId of Object.keys(all)) {
    const normalized = ensureGuildShopData(all[guildId]);
    if (JSON.stringify(normalized) !== JSON.stringify(all[guildId])) {
      all[guildId] = normalized;
      changed = true;
    }
  }

  if (changed) {
    writeJson(shopPath, all);
  }

  return all;
}

function getGuildShopData(guildId) {
  const all = getAllShopData();
  if (!all[guildId]) {
    all[guildId] = { roles: {} };
    writeJson(shopPath, all);
  }
  return all[guildId];
}

function getRolePrices(guildId) {
  const guildData = getGuildShopData(guildId);
  return Object.values(guildData.roles || {})
    .map(entry => ({
      roleId: entry.roleId,
      roleName: entry.roleName || null,
      price: Number(entry.price) || 0,
      incomeBonusPercent: Math.max(0, Number(entry.incomeBonusPercent) || 0),
      configuredAt: Number(entry.configuredAt) || 0,
      updatedAt: Number(entry.updatedAt) || 0,
      configuredBy: entry.configuredBy || null,
    }))
    .filter(item => item.price > 0)
    .sort((a, b) => a.price - b.price);
}

function setRolePrice(guildId, roleOrId, price, configuredBy = null) {
  const all = getAllShopData();
  if (!all[guildId]) all[guildId] = { roles: {} };
  if (!all[guildId].roles) all[guildId].roles = {};

  const roleId = typeof roleOrId === 'string' ? roleOrId : roleOrId?.id;
  const roleName = typeof roleOrId === 'string' ? null : roleOrId?.name || null;
  if (!roleId) return;

  const existing = all[guildId].roles[roleId] || {};
  all[guildId].roles[roleId] = {
    roleId,
    roleName,
    price: Math.max(1, Math.floor(price)),
    incomeBonusPercent: Math.max(0, Number(existing.incomeBonusPercent) || 0),
    configuredAt: Number(existing.configuredAt) || Date.now(),
    updatedAt: Date.now(),
    configuredBy: configuredBy || existing.configuredBy || null,
  };

  writeJson(shopPath, all);
}

function replaceRoleShopEntry(guildId, oldRoleId, newRoleOrId, overridePrice = null, configuredBy = null) {
  const all = getAllShopData();
  if (!all[guildId]) all[guildId] = { roles: {} };
  if (!all[guildId].roles) all[guildId].roles = {};

  const oldEntry = all[guildId].roles[oldRoleId];
  if (!oldEntry) return null;

  const newRoleId = typeof newRoleOrId === 'string' ? newRoleOrId : newRoleOrId?.id;
  const newRoleName = typeof newRoleOrId === 'string' ? null : newRoleOrId?.name || null;
  if (!newRoleId) return null;

  const nextPrice = Number.isFinite(overridePrice) && overridePrice > 0
    ? Math.floor(overridePrice)
    : Math.max(1, Math.floor(Number(oldEntry.price) || 1));

  delete all[guildId].roles[oldRoleId];
  all[guildId].roles[newRoleId] = {
    roleId: newRoleId,
    roleName: newRoleName,
    price: nextPrice,
    incomeBonusPercent: Math.max(0, Number(oldEntry.incomeBonusPercent) || 0),
    configuredAt: Number(oldEntry.configuredAt) || Date.now(),
    updatedAt: Date.now(),
    configuredBy: configuredBy || oldEntry.configuredBy || null,
  };

  writeJson(shopPath, all);
  return all[guildId].roles[newRoleId];
}

function removeRolePrice(guildId, roleId) {
  const all = getAllShopData();
  if (!all[guildId]?.roles?.[roleId]) return false;
  delete all[guildId].roles[roleId];
  writeJson(shopPath, all);
  return true;
}

function getRolePrice(guildId, roleId) {
  const guildData = getGuildShopData(guildId);
  const price = Number(guildData.roles?.[roleId]?.price) || 0;
  return price > 0 ? price : null;
}

function getRoleShopEntry(guildId, roleId) {
  const guildData = getGuildShopData(guildId);
  const entry = guildData.roles?.[roleId];
  if (!entry) return null;
  return {
    roleId: entry.roleId,
    roleName: entry.roleName || null,
    price: Number(entry.price) || 0,
    incomeBonusPercent: Math.max(0, Number(entry.incomeBonusPercent) || 0),
    configuredAt: Number(entry.configuredAt) || 0,
    updatedAt: Number(entry.updatedAt) || 0,
    configuredBy: entry.configuredBy || null,
  };
}

function setRoleIncomeBonusPercent(guildId, roleOrId, incomeBonusPercent, configuredBy = null) {
  const all = getAllShopData();
  if (!all[guildId]) all[guildId] = { roles: {} };
  if (!all[guildId].roles) all[guildId].roles = {};

  const roleId = typeof roleOrId === 'string' ? roleOrId : roleOrId?.id;
  if (!roleId) return null;

  const existing = all[guildId].roles[roleId];
  if (!existing || !(Number(existing.price) > 0)) return null;

  const cleanBonus = Math.max(0, Math.floor((Number(incomeBonusPercent) || 0) * 100) / 100);
  all[guildId].roles[roleId] = {
    ...existing,
    incomeBonusPercent: cleanBonus,
    updatedAt: Date.now(),
    configuredBy: configuredBy || existing.configuredBy || null,
  };

  writeJson(shopPath, all);
  return {
    roleId: all[guildId].roles[roleId].roleId,
    roleName: all[guildId].roles[roleId].roleName || null,
    price: Number(all[guildId].roles[roleId].price) || 0,
    incomeBonusPercent: Math.max(0, Number(all[guildId].roles[roleId].incomeBonusPercent) || 0),
    configuredAt: Number(all[guildId].roles[roleId].configuredAt) || 0,
    updatedAt: Number(all[guildId].roles[roleId].updatedAt) || 0,
    configuredBy: all[guildId].roles[roleId].configuredBy || null,
  };
}

function getIncomeBonusForMember(guildId, member) {
  if (!member?.roles?.cache) {
    return { percent: 0, roles: [] };
  }

  const configuredRoles = getRolePrices(guildId)
    .filter(item => item.price > 0 && item.incomeBonusPercent > 0);

  const matchedRoles = configuredRoles.filter(item => member.roles.cache.has(item.roleId));
  const percent = matchedRoles.reduce((acc, item) => acc + (Number(item.incomeBonusPercent) || 0), 0);

  return {
    percent: Math.max(0, Math.floor(percent * 100) / 100),
    roles: matchedRoles,
  };
}

function getLastRobbery(guildId, thiefId, victimId) {
  const all = readJson(robberyPath, {});
  const key = `${thiefId}:${victimId}`;
  const record = all[guildId]?.[key] || null;
  if (!record) return null;

  return {
    amount: Number(record.amount) || 0,
    at: Number(record.at) || 0,
  };
}

function getVictimRobberyRecord(guildId, victimId) {
  const all = readJson(robberyPath, {});
  const record = all[guildId]?.victims?.[victimId] || null;
  if (!record) return null;

  return {
    thiefId: record.thiefId || null,
    amountWallet: Number(record.amountWallet) || 0,
    amountBank: Number(record.amountBank) || 0,
    command: record.command || 'rob',
    at: Number(record.at) || 0,
    cooldownMs: Number(record.cooldownMs) || DEFAULT_ROBBERY_VICTIM_COOLDOWN_MS,
  };
}

function getVictimRobberyCooldown(guildId, victimId) {
  const record = getVictimRobberyRecord(guildId, victimId);
  if (!record) {
    return { remaining: 0, record: null };
  }

  const remaining = Math.max(0, record.cooldownMs - (Date.now() - record.at));
  return { remaining, record };
}

function recordRobbery(guildId, thiefId, victimId, amount, options = {}) {
  const all = readJson(robberyPath, {});
  if (!all[guildId]) all[guildId] = {};
  const key = `${thiefId}:${victimId}`;
  const now = Date.now();
  const victimCooldownMs = Math.max(1, Math.floor(Number(options.victimCooldownMs) || DEFAULT_ROBBERY_VICTIM_COOLDOWN_MS));
  all[guildId][key] = {
    amount: Math.max(0, Math.floor(amount || 0)),
    at: now,
  };

  if (!all[guildId].victims) all[guildId].victims = {};
  all[guildId].victims[victimId] = {
    thiefId,
    amountWallet: Math.max(0, Math.floor(Number(options.amountWallet) || 0)),
    amountBank: Math.max(0, Math.floor(Number(options.amountBank) || 0)),
    command: options.command || 'rob',
    at: now,
    cooldownMs: victimCooldownMs,
  };
  writeJson(robberyPath, all);

  const robberyLogs = readJson(robberyLogsPath, []);
  robberyLogs.push({
    type: 'robbery',
    command: options.command || 'rob',
    guildId,
    thiefId,
    victimId,
    amount: Math.max(0, Math.floor(amount || 0)),
    amountWallet: Math.max(0, Math.floor(Number(options.amountWallet) || 0)),
    amountBank: Math.max(0, Math.floor(Number(options.amountBank) || 0)),
    at: now,
    createdAt: new Date(now).toISOString(),
  });

  const maxEntries = 5000;
  if (robberyLogs.length > maxEntries) {
    robberyLogs.splice(0, robberyLogs.length - maxEntries);
  }

  writeJson(robberyLogsPath, robberyLogs);
}

function getRevengeBonusPercent(guildId, currentThiefId, currentVictimId) {
  const all = readJson(robberyPath, {});
  const entries = Object.entries(all[guildId] || {})
    .filter(([key]) => key !== 'victims')
    .map(([key, record]) => {
      const [thiefId, victimId] = key.split(':');
      return {
        thiefId,
        victimId,
        amount: Number(record?.amount) || 0,
        at: Number(record?.at) || 0,
      };
    })
    .filter(entry => entry.thiefId === currentVictimId);

  if (!entries.length) return 0;

  const reverse = entries.sort((a, b) => b.at - a.at || b.amount - a.amount)[0];
  const age = Date.now() - reverse.at;
  const maxAge = 24 * 60 * 60 * 1000;
  if (age > maxAge) return 0;

  const base = 0.2;
  const scaled = Math.min(0.3, (reverse.amount || 0) / 50_000);
  return base + scaled;
}

module.exports = {
  getGuildConfig,
  setCurrencyEmoji,
  getUserBalance,
  addToWallet,
  addToWalletNoStats,
  setWalletNoStats,
  removeFromWallet,
  canAfford,
  transferWallet,
  depositToBank,
  withdrawFromBank,
  getLeaderboard,
  getRemainingCooldown,
  setCooldown,
  tryGrantMessageReward,
  getRolePrices,
  setRolePrice,
  setRoleIncomeBonusPercent,
  getIncomeBonusForMember,
  replaceRoleShopEntry,
  removeRolePrice,
  getRolePrice,
  getRoleShopEntry,
  randomInt,
  setDailyProgress,
  getVictimRobberyRecord,
  getVictimRobberyCooldown,
  recordRobbery,
  removeFromBank,
  getRevengeBonusPercent,
};

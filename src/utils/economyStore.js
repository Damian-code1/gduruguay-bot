const { query } = require('./db');

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

function rowToConfig(row) {
  if (!row) return { ...DEFAULT_CONFIG };
  return {
    currencyEmoji: row.currency_emoji ?? DEFAULT_CONFIG.currencyEmoji,
    currencyName: row.currency_name ?? DEFAULT_CONFIG.currencyName,
    messageReward: {
      enabled: row.message_reward_enabled === undefined ? DEFAULT_CONFIG.messageReward.enabled : Boolean(row.message_reward_enabled),
      min: row.message_reward_min ?? DEFAULT_CONFIG.messageReward.min,
      max: row.message_reward_max ?? DEFAULT_CONFIG.messageReward.max,
      cooldownMs: Number(row.message_reward_cooldown_ms ?? DEFAULT_CONFIG.messageReward.cooldownMs),
    },
    dailyReward: Number(row.daily_reward ?? DEFAULT_CONFIG.dailyReward),
    workRewardMin: Number(row.work_reward_min ?? DEFAULT_CONFIG.workRewardMin),
    workRewardMax: Number(row.work_reward_max ?? DEFAULT_CONFIG.workRewardMax),
    dailyCooldownMs: Number(row.daily_cooldown_ms ?? DEFAULT_CONFIG.dailyCooldownMs),
    workCooldownMs: Number(row.work_cooldown_ms ?? DEFAULT_CONFIG.workCooldownMs),
  };
}

async function ensureGuildConfig(guildId) {
  const [rows] = await query('SELECT * FROM economy_config WHERE guild_id = ?', [guildId]);
  if (rows.length) return rowToConfig(rows[0]);

  await query(
    `INSERT INTO economy_config (guild_id, currency_emoji, currency_name, message_reward_enabled, message_reward_min, message_reward_max, message_reward_cooldown_ms, daily_reward, work_reward_min, work_reward_max, daily_cooldown_ms, work_cooldown_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE guild_id = guild_id`,
    [
      guildId,
      DEFAULT_CONFIG.currencyEmoji,
      DEFAULT_CONFIG.currencyName,
      1,
      DEFAULT_CONFIG.messageReward.min,
      DEFAULT_CONFIG.messageReward.max,
      DEFAULT_CONFIG.messageReward.cooldownMs,
      DEFAULT_CONFIG.dailyReward,
      DEFAULT_CONFIG.workRewardMin,
      DEFAULT_CONFIG.workRewardMax,
      DEFAULT_CONFIG.dailyCooldownMs,
      DEFAULT_CONFIG.workCooldownMs,
    ]
  );
  return { ...DEFAULT_CONFIG };
}

async function getGuildConfig(guildId) {
  return ensureGuildConfig(guildId);
}

async function setCurrencyEmoji(guildId, emoji) {
  await ensureGuildConfig(guildId);
  await query('UPDATE economy_config SET currency_emoji = ? WHERE guild_id = ?', [emoji, guildId]);
  return getGuildConfig(guildId);
}

async function ensureUserRecord(guildId, userId) {
  const [rows] = await query('SELECT * FROM economy_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (rows.length) return rows[0];

  await query(
    `INSERT INTO economy_users (guild_id, user_id, wallet, bank, total_earned, total_spent, daily_streak, last_daily_at)
     VALUES (?, ?, 0, 0, 0, 0, 0, 0)
     ON DUPLICATE KEY UPDATE guild_id = guild_id`,
    [guildId, userId]
  );
  const [created] = await query('SELECT * FROM economy_users WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  return created[0];
}

async function getUserBalance(guildId, userId) {
  const record = await ensureUserRecord(guildId, userId);
  const wallet = Number(record.wallet) || 0;
  const bank = Number(record.bank) || 0;
  return {
    wallet,
    bank,
    total: wallet + bank,
    totalEarned: Number(record.total_earned) || 0,
    totalSpent: Number(record.total_spent) || 0,
    dailyStreak: Number(record.daily_streak) || 0,
    lastDailyAt: Number(record.last_daily_at) || 0,
  };
}

async function updateUser(guildId, userId, updater) {
  const current = await ensureUserRecord(guildId, userId);
  const currentNormalized = {
    wallet: Number(current.wallet) || 0,
    bank: Number(current.bank) || 0,
    totalEarned: Number(current.total_earned) || 0,
    totalSpent: Number(current.total_spent) || 0,
    dailyStreak: Number(current.daily_streak) || 0,
    lastDailyAt: Number(current.last_daily_at) || 0,
  };

  const next = updater({ ...currentNormalized }) || currentNormalized;
  const clean = {
    wallet: Math.max(0, Math.floor(next.wallet || 0)),
    bank: Math.max(0, Math.floor(next.bank || 0)),
    totalEarned: Math.max(0, Math.floor(next.totalEarned || 0)),
    totalSpent: Math.max(0, Math.floor(next.totalSpent || 0)),
    dailyStreak: Math.max(0, Math.floor(next.dailyStreak || 0)),
    lastDailyAt: Math.max(0, Math.floor(next.lastDailyAt || 0)),
  };

  await query(
    `UPDATE economy_users SET wallet = ?, bank = ?, total_earned = ?, total_spent = ?, daily_streak = ?, last_daily_at = ?
     WHERE guild_id = ? AND user_id = ?`,
    [clean.wallet, clean.bank, clean.totalEarned, clean.totalSpent, clean.dailyStreak, clean.lastDailyAt, guildId, userId]
  );

  return {
    wallet: clean.wallet,
    bank: clean.bank,
    total_earned: clean.totalEarned,
    total_spent: clean.totalSpent,
    daily_streak: clean.dailyStreak,
    last_daily_at: clean.lastDailyAt,
  };
}

async function addToWallet(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: (current.wallet || 0) + cleanAmount,
    totalEarned: (current.totalEarned || 0) + cleanAmount,
  }));
}

async function addToWalletNoStats(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: (current.wallet || 0) + cleanAmount,
  }));
}

async function setWalletNoStats(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: cleanAmount,
  }));
}

async function removeFromWallet(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  return updateUser(guildId, userId, current => ({
    ...current,
    wallet: Math.max(0, (current.wallet || 0) - cleanAmount),
    totalSpent: (current.totalSpent || 0) + cleanAmount,
  }));
}

async function canAfford(guildId, userId, amount) {
  const balance = await getUserBalance(guildId, userId);
  return balance.wallet >= amount;
}

async function transferWallet(guildId, fromUserId, toUserId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return false;
  if (!(await canAfford(guildId, fromUserId, cleanAmount))) return false;

  await removeFromWallet(guildId, fromUserId, cleanAmount);
  await addToWallet(guildId, toUserId, cleanAmount);
  return true;
}

async function depositToBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  let deposited = 0;
  await updateUser(guildId, userId, current => {
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

async function withdrawFromBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  let withdrawn = 0;
  await updateUser(guildId, userId, current => {
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

async function removeFromBank(guildId, userId, amount) {
  const cleanAmount = Math.max(0, Math.floor(amount || 0));
  if (!cleanAmount) return 0;

  return updateUser(guildId, userId, current => ({
    ...current,
    bank: Math.max(0, (current.bank || 0) - cleanAmount),
    totalSpent: (current.totalSpent || 0) + cleanAmount,
  }));
}

async function setDailyProgress(guildId, userId, streak, lastDailyAt) {
  return updateUser(guildId, userId, current => ({
    ...current,
    dailyStreak: Math.max(0, Math.floor(streak || 0)),
    lastDailyAt: Math.max(0, Math.floor(lastDailyAt || Date.now())),
  }));
}

async function getLeaderboard(guildId, limit = 10, offset = 0) {
  const safeLimit = Math.max(1, Math.floor(Number(limit) || 10));
  const safeOffset = Math.max(0, Math.floor(Number(offset) || 0));

  const [rows] = await query(
    `SELECT user_id, wallet, bank, total_earned, total_spent FROM economy_users
     WHERE guild_id = ? ORDER BY (wallet + bank) DESC LIMIT ? OFFSET ?`,
    [guildId, safeLimit, safeOffset]
  );

  return rows.map(row => ({
    userId: row.user_id,
    wallet: Number(row.wallet) || 0,
    bank: Number(row.bank) || 0,
    total: (Number(row.wallet) || 0) + (Number(row.bank) || 0),
    totalEarned: Number(row.total_earned) || 0,
    totalSpent: Number(row.total_spent) || 0,
  }));
}

async function getCooldown(guildId, userId, key) {
  const [rows] = await query(
    'SELECT timestamp FROM economy_cooldowns WHERE guild_id = ? AND user_id = ? AND action = ?',
    [guildId, userId, key]
  );
  return rows.length ? Number(rows[0].timestamp) || 0 : 0;
}

async function setCooldown(guildId, userId, key, value) {
  const numericValue = Number(value);
  const clean = Number.isFinite(numericValue) ? numericValue : Date.now();
  await query(
    `INSERT INTO economy_cooldowns (guild_id, user_id, action, timestamp) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE timestamp = VALUES(timestamp)`,
    [guildId, userId, key, clean]
  );
}

async function getRemainingCooldown(guildId, userId, key, cooldownMs) {
  const last = await getCooldown(guildId, userId, key);
  const remaining = Math.max(0, cooldownMs - (Date.now() - last));
  return remaining;
}

function randomInt(min, max) {
  const low = Math.floor(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

async function tryGrantMessageReward(guildId, userId) {
  const config = await getGuildConfig(guildId);
  if (!config.messageReward?.enabled) {
    return { granted: false, reason: 'disabled' };
  }

  const remaining = await getRemainingCooldown(guildId, userId, 'message', config.messageReward.cooldownMs);
  if (remaining > 0) {
    return { granted: false, reason: 'cooldown', remaining };
  }

  const amount = randomInt(config.messageReward.min, config.messageReward.max);
  await addToWallet(guildId, userId, amount);
  await setCooldown(guildId, userId, 'message', Date.now());

  return { granted: true, amount };
}

async function getRolePrices(guildId) {
  const [rows] = await query(
    `SELECT role_id, role_name, price, income_bonus_percent, configured_at, updated_at, configured_by
     FROM economy_shop_roles WHERE guild_id = ? AND price > 0 ORDER BY price ASC`,
    [guildId]
  );
  return rows.map(row => ({
    roleId: row.role_id,
    roleName: row.role_name || null,
    price: Number(row.price) || 0,
    incomeBonusPercent: Math.max(0, Number(row.income_bonus_percent) || 0),
    configuredAt: Number(row.configured_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
    configuredBy: row.configured_by || null,
  }));
}

async function setRolePrice(guildId, roleOrId, price, configuredBy = null) {
  const roleId = typeof roleOrId === 'string' ? roleOrId : roleOrId?.id;
  const roleName = typeof roleOrId === 'string' ? null : roleOrId?.name || null;
  if (!roleId) return;

  const cleanPrice = Math.max(1, Math.floor(price));
  const now = Date.now();

  await query(
    `INSERT INTO economy_shop_roles (guild_id, role_id, role_name, price, income_bonus_percent, configured_at, updated_at, configured_by)
     VALUES (?, ?, ?, ?, 0, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), price = VALUES(price), updated_at = VALUES(updated_at), configured_by = COALESCE(VALUES(configured_by), configured_by)`,
    [guildId, roleId, roleName, cleanPrice, now, now, configuredBy]
  );
}

async function replaceRoleShopEntry(guildId, oldRoleId, newRoleOrId, overridePrice = null, configuredBy = null) {
  const [rows] = await query(
    'SELECT * FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?',
    [guildId, oldRoleId]
  );
  if (!rows.length) return null;
  const oldEntry = rows[0];

  const newRoleId = typeof newRoleOrId === 'string' ? newRoleOrId : newRoleOrId?.id;
  const newRoleName = typeof newRoleOrId === 'string' ? null : newRoleOrId?.name || null;
  if (!newRoleId) return null;

  const nextPrice = Number.isFinite(overridePrice) && overridePrice > 0
    ? Math.floor(overridePrice)
    : Math.max(1, Math.floor(Number(oldEntry.price) || 1));

  const now = Date.now();
  await query('DELETE FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?', [guildId, oldRoleId]);
  await query(
    `INSERT INTO economy_shop_roles (guild_id, role_id, role_name, price, income_bonus_percent, configured_at, updated_at, configured_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE role_name = VALUES(role_name), price = VALUES(price), updated_at = VALUES(updated_at)`,
    [guildId, newRoleId, newRoleName, nextPrice, Math.max(0, Number(oldEntry.income_bonus_percent) || 0), Number(oldEntry.configured_at) || now, now, configuredBy || oldEntry.configured_by || null]
  );

  return {
    roleId: newRoleId,
    roleName: newRoleName,
    price: nextPrice,
    incomeBonusPercent: Math.max(0, Number(oldEntry.income_bonus_percent) || 0),
    configuredAt: Number(oldEntry.configured_at) || now,
    updatedAt: now,
    configuredBy: configuredBy || oldEntry.configured_by || null,
  };
}

async function removeRolePrice(guildId, roleId) {
  const [result] = await query('DELETE FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
  return result.affectedRows > 0;
}

async function getRolePrice(guildId, roleId) {
  const [rows] = await query('SELECT price FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
  const price = rows.length ? Number(rows[0].price) || 0 : 0;
  return price > 0 ? price : null;
}

async function getRoleShopEntry(guildId, roleId) {
  const [rows] = await query('SELECT * FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
  if (!rows.length) return null;
  const entry = rows[0];
  return {
    roleId: entry.role_id,
    roleName: entry.role_name || null,
    price: Number(entry.price) || 0,
    incomeBonusPercent: Math.max(0, Number(entry.income_bonus_percent) || 0),
    configuredAt: Number(entry.configured_at) || 0,
    updatedAt: Number(entry.updated_at) || 0,
    configuredBy: entry.configured_by || null,
  };
}

async function setRoleIncomeBonusPercent(guildId, roleOrId, incomeBonusPercent, configuredBy = null) {
  const roleId = typeof roleOrId === 'string' ? roleOrId : roleOrId?.id;
  if (!roleId) return null;

  const [rows] = await query('SELECT * FROM economy_shop_roles WHERE guild_id = ? AND role_id = ?', [guildId, roleId]);
  if (!rows.length || !(Number(rows[0].price) > 0)) return null;

  const cleanBonus = Math.max(0, Math.floor((Number(incomeBonusPercent) || 0) * 100) / 100);
  const now = Date.now();

  await query(
    'UPDATE economy_shop_roles SET income_bonus_percent = ?, updated_at = ?, configured_by = COALESCE(?, configured_by) WHERE guild_id = ? AND role_id = ?',
    [cleanBonus, now, configuredBy, guildId, roleId]
  );

  return getRoleShopEntry(guildId, roleId);
}

async function getIncomeBonusForMember(guildId, member) {
  if (!member?.roles?.cache) {
    return { percent: 0, roles: [] };
  }

  const configuredRoles = (await getRolePrices(guildId))
    .filter(item => item.price > 0 && item.incomeBonusPercent > 0);

  const matchedRoles = configuredRoles.filter(item => member.roles.cache.has(item.roleId));
  const percent = matchedRoles.reduce((acc, item) => acc + (Number(item.incomeBonusPercent) || 0), 0);

  return {
    percent: Math.max(0, Math.floor(percent * 100) / 100),
    roles: matchedRoles,
  };
}

async function getRobberyGuildData(guildId) {
  const [rows] = await query('SELECT data FROM economy_robbery WHERE guild_id = ?', [guildId]);
  if (!rows.length || !rows[0].data) return {};
  return typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
}

async function saveRobberyGuildData(guildId, data) {
  await query(
    `INSERT INTO economy_robbery (guild_id, data) VALUES (?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [guildId, JSON.stringify(data)]
  );
}

async function getLastRobbery(guildId, thiefId, victimId) {
  const all = await getRobberyGuildData(guildId);
  const key = `${thiefId}:${victimId}`;
  const record = all[key] || null;
  if (!record) return null;

  return {
    amount: Number(record.amount) || 0,
    at: Number(record.at) || 0,
  };
}

async function getVictimRobberyRecord(guildId, victimId) {
  const all = await getRobberyGuildData(guildId);
  const record = all.victims?.[victimId] || null;
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

async function getVictimRobberyCooldown(guildId, victimId) {
  const record = await getVictimRobberyRecord(guildId, victimId);
  if (!record) {
    return { remaining: 0, record: null };
  }

  const remaining = Math.max(0, record.cooldownMs - (Date.now() - record.at));
  return { remaining, record };
}

async function recordRobbery(guildId, thiefId, victimId, amount, options = {}) {
  const all = await getRobberyGuildData(guildId);
  const key = `${thiefId}:${victimId}`;
  const now = Date.now();
  const victimCooldownMs = Math.max(1, Math.floor(Number(options.victimCooldownMs) || DEFAULT_ROBBERY_VICTIM_COOLDOWN_MS));
  all[key] = {
    amount: Math.max(0, Math.floor(amount || 0)),
    at: now,
  };

  if (!all.victims) all.victims = {};
  all.victims[victimId] = {
    thiefId,
    amountWallet: Math.max(0, Math.floor(Number(options.amountWallet) || 0)),
    amountBank: Math.max(0, Math.floor(Number(options.amountBank) || 0)),
    command: options.command || 'rob',
    at: now,
    cooldownMs: victimCooldownMs,
  };
  await saveRobberyGuildData(guildId, all);

  await query(
    `INSERT INTO economy_robbery_logs (guild_id, data, created_at) VALUES (?, CAST(? AS JSON), ?)`,
    [
      guildId,
      JSON.stringify({
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
      }),
      now,
    ]
  );

  const [[{ cnt }]] = await query('SELECT COUNT(*) AS cnt FROM economy_robbery_logs WHERE guild_id = ?', [guildId]);
  const maxEntries = 5000;
  if (cnt > maxEntries) {
    await query(
      `DELETE FROM economy_robbery_logs WHERE guild_id = ? ORDER BY id ASC LIMIT ?`,
      [guildId, cnt - maxEntries]
    );
  }
}

async function getRevengeBonusPercent(guildId, currentThiefId, currentVictimId) {
  const all = await getRobberyGuildData(guildId);
  const entries = Object.entries(all)
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

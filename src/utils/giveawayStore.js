const fs = require('fs/promises');
const path = require('path');

const dbPath = path.join(__dirname, '../../database.json');
const DEFAULT_DB = {
  giveaways: {},
  inviteSnapshots: {},
  settings: {},
};

let db = null;
let loadPromise = null;
let saveTimer = null;
let saveQueue = Promise.resolve();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDb(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    giveaways: source.giveaways && typeof source.giveaways === 'object' ? source.giveaways : {},
    inviteSnapshots: source.inviteSnapshots && typeof source.inviteSnapshots === 'object' ? source.inviteSnapshots : {},
    settings: source.settings && typeof source.settings === 'object' ? source.settings : {},
  };
}

async function ensureDatabase() {
  if (db) return db;
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const raw = await fs.readFile(dbPath, 'utf8');
        db = normalizeDb(JSON.parse(raw));
      } catch (error) {
        db = clone(DEFAULT_DB);
        await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8').catch(() => null);
      }
      return db;
    })();
  }

  return loadPromise;
}

function getDatabase() {
  return db || clone(DEFAULT_DB);
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveQueue = saveQueue
      .then(async () => {
        await ensureDatabase();
        await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
      })
      .catch(error => {
        console.error('[giveawayStore] save failed:', error);
      });
  }, 150);
}

async function flushDatabase() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await ensureDatabase();
  await saveQueue.catch(() => null);
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

function ensureGiveawaySchema(record) {
  const giveaway = record && typeof record === 'object' ? record : {};
  return {
    id: String(giveaway.id || giveaway.messageId || Date.now()),
    guildId: String(giveaway.guildId || ''),
    channelId: String(giveaway.channelId || ''),
    messageId: String(giveaway.messageId || ''),
    creatorId: String(giveaway.creatorId || giveaway.originalAuthor || ''),
    prize: String(giveaway.prize || ''),
    endsAt: Math.max(0, Number(giveaway.endsAt) || 0),
    createdAt: Math.max(0, Number(giveaway.createdAt) || Date.now()),
    requiredMessages: Math.max(0, Number(giveaway.requiredMessages) || 0),
    requiredInvites: Math.max(0, Number(giveaway.requiredInvites) || 0),
    winners: Math.max(1, Number(giveaway.winners) || 1),
    thumbnailUrl: String(giveaway.thumbnailUrl || ''),
    pingType: giveaway.pingType === 'everyone' ? 'everyone' : 'here',
    status: giveaway.status || 'active',
    endedAt: giveaway.endedAt ? Number(giveaway.endedAt) : null,
    winnerIds: Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds.map(String) : [],
    participants: Array.isArray(giveaway.participants) ? [...new Set(giveaway.participants.map(String))] : [],
    messageCounts: giveaway.messageCounts && typeof giveaway.messageCounts === 'object' ? giveaway.messageCounts : {},
    inviteCounts: giveaway.inviteCounts && typeof giveaway.inviteCounts === 'object' ? giveaway.inviteCounts : {},
    inviteSnapshot: giveaway.inviteSnapshot && typeof giveaway.inviteSnapshot === 'object' ? giveaway.inviteSnapshot : {},
    bannedUsers: Array.isArray(giveaway.bannedUsers) ? [...new Set(giveaway.bannedUsers.map(String))] : [],
    banLogs: Array.isArray(giveaway.banLogs) ? giveaway.banLogs.map(entry => ({
      userId: String(entry?.userId || ''),
      reason: String(entry?.reason || 'Sin razón especificada'),
      moderatorId: String(entry?.moderatorId || ''),
      moderatorName: String(entry?.moderatorName || 'Sistema'),
      source: String(entry?.source || 'manual'),
      createdAt: entry?.createdAt ? String(entry.createdAt) : new Date().toISOString(),
    })) : [],
    announcementChannelId: giveaway.announcementChannelId ? String(giveaway.announcementChannelId) : String(giveaway.channelId || ''),
    announcementMessageId: giveaway.announcementMessageId ? String(giveaway.announcementMessageId) : String(giveaway.messageId || ''),
    lastUpdatedAt: Math.max(0, Number(giveaway.lastUpdatedAt) || Date.now()),
    rerollCount: Math.max(0, Number(giveaway.rerollCount) || 0),
  };
}

async function getGiveawaysDb() {
  const database = await ensureDatabase();
  return database.giveaways;
}

async function getActiveGiveaways(guildId) {
  const giveaways = await getGiveawaysDb();
  return Object.values(giveaways)
    .filter(giveaway => giveaway.guildId === String(guildId) && giveaway.status === 'active')
    .map(giveaway => ensureGiveawaySchema(giveaway));
}

async function getGiveaway(giveawayId) {
  const giveaways = await getGiveawaysDb();
  const giveaway = giveaways[String(giveawayId)] || null;
  return giveaway ? ensureGiveawaySchema(giveaway) : null;
}

async function getActiveGiveawayByMessageId(messageId) {
  const target = String(messageId || '').trim();
  if (!target) return null;

  const giveaways = await getGiveawaysDb();
  const match = Object.values(giveaways).find(giveaway => {
    const schema = ensureGiveawaySchema(giveaway);
    return schema.status === 'active' && [schema.id, schema.messageId, schema.announcementMessageId].includes(target);
  });

  return match ? ensureGiveawaySchema(match) : null;
}

async function findGiveawayByMessageId(messageId, { activeOnly = true } = {}) {
  const target = String(messageId || '').trim();
  if (!target) return null;

  const giveaways = await getGiveawaysDb();
  const match = Object.values(giveaways).find(giveaway => {
    const schema = ensureGiveawaySchema(giveaway);
    if (activeOnly && schema.status !== 'active') return false;
    return [schema.id, schema.messageId, schema.announcementMessageId].includes(target);
  });

  return match ? ensureGiveawaySchema(match) : null;
}

async function createGiveaway(record) {
  const database = await ensureDatabase();
  const giveaway = ensureGiveawaySchema(record);
  database.giveaways[giveaway.id] = giveaway;
  scheduleSave();
  return giveaway;
}

async function updateGiveaway(giveawayId, patch) {
  const database = await ensureDatabase();
  const current = database.giveaways[String(giveawayId)];
  if (!current) return null;
  const next = ensureGiveawaySchema({ ...current, ...patch, id: current.id });
  database.giveaways[String(giveawayId)] = next;
  scheduleSave();
  return next;
}

async function removeGiveaway(giveawayId) {
  const database = await ensureDatabase();
  const existed = Boolean(database.giveaways[String(giveawayId)]);
  delete database.giveaways[String(giveawayId)];
  scheduleSave();
  return existed;
}

async function setGiveawayStatus(giveawayId, status, extra = {}) {
  return updateGiveaway(giveawayId, {
    status,
    endedAt: extra.endedAt ?? Date.now(),
    lastUpdatedAt: Date.now(),
    ...extra,
  });
}

async function addParticipant(giveawayId, userId) {
  const database = await ensureDatabase();
  const giveaway = database.giveaways[String(giveawayId)];
  if (!giveaway) return null;
  if ((giveaway.bannedUsers || []).map(String).includes(String(userId))) return null;

  giveaway.participants = [...new Set([...(giveaway.participants || []), String(userId)])];
  giveaway.lastUpdatedAt = Date.now();
  scheduleSave();
  return giveaway;
}

async function forceAddParticipant(giveawayId, userId) {
  const database = await ensureDatabase();
  const giveaway = database.giveaways[String(giveawayId)];
  if (!giveaway) return null;

  const key = String(userId);
  if (!Array.isArray(giveaway.participants)) giveaway.participants = [];
  giveaway.participants = [...new Set([...giveaway.participants.map(String), key])];
  if (!giveaway.messageCounts || typeof giveaway.messageCounts !== 'object') giveaway.messageCounts = {};
  if (!giveaway.inviteCounts || typeof giveaway.inviteCounts !== 'object') giveaway.inviteCounts = {};
  giveaway.messageCounts[key] = Math.max(Number(giveaway.messageCounts[key]) || 0, Number(giveaway.requiredMessages) || 0);
  giveaway.inviteCounts[key] = Math.max(Number(giveaway.inviteCounts[key]) || 0, Number(giveaway.requiredInvites) || 0);
  giveaway.lastUpdatedAt = Date.now();
  scheduleSave();
  return ensureGiveawaySchema(giveaway);
}

async function isGiveawayBanned(giveawayId, userId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return false;
  return (giveaway.bannedUsers || []).map(String).includes(String(userId));
}

async function banUserFromGiveaway(giveawayId, userId, entry = {}) {
  const database = await ensureDatabase();
  const giveaway = database.giveaways[String(giveawayId)];
  if (!giveaway) return null;

  const bannedUsers = new Set((giveaway.bannedUsers || []).map(String));
  bannedUsers.add(String(userId));
  giveaway.bannedUsers = [...bannedUsers];
  giveaway.banLogs = Array.isArray(giveaway.banLogs) ? giveaway.banLogs : [];
  giveaway.banLogs.push({
    userId: String(userId),
    reason: String(entry.reason || 'Sin razón especificada'),
    moderatorId: String(entry.moderatorId || ''),
    moderatorName: String(entry.moderatorName || 'Sistema'),
    source: String(entry.source || 'manual'),
    createdAt: entry.createdAt || new Date().toISOString(),
  });
  giveaway.lastUpdatedAt = Date.now();
  scheduleSave();
  return ensureGiveawaySchema(giveaway);
}

async function banUserFromActiveGiveaways(guildId, userId, entry = {}) {
  const giveaways = await getActiveGiveaways(guildId);
  const results = [];
  for (const giveaway of giveaways) {
    const updated = await banUserFromGiveaway(giveaway.id, userId, entry);
    if (updated) results.push(updated);
  }
  return results;
}

async function unbanUserFromGiveaway(giveawayId, userId, entry = {}) {
  const database = await ensureDatabase();
  const giveaway = database.giveaways[String(giveawayId)];
  if (!giveaway) return null;

  giveaway.bannedUsers = (Array.isArray(giveaway.bannedUsers) ? giveaway.bannedUsers : [])
    .map(String)
    .filter(id => id !== String(userId));
  giveaway.banLogs = Array.isArray(giveaway.banLogs) ? giveaway.banLogs : [];
  giveaway.banLogs.push({
    userId: String(userId),
    reason: String(entry.reason || 'Unbanned'),
    moderatorId: String(entry.moderatorId || ''),
    moderatorName: String(entry.moderatorName || 'Sistema'),
    source: String(entry.source || 'unban'),
    createdAt: entry.createdAt || new Date().toISOString(),
  });
  giveaway.lastUpdatedAt = Date.now();
  scheduleSave();
  return ensureGiveawaySchema(giveaway);
}

async function unbanUserFromActiveGiveaways(guildId, userId, entry = {}) {
  const giveaways = await getActiveGiveaways(guildId);
  const results = [];
  for (const giveaway of giveaways) {
    const updated = await unbanUserFromGiveaway(giveaway.id, userId, entry);
    if (updated) results.push(updated);
  }
  return results;
}

async function getGiveawayBanLogs(giveawayId) {
  const giveaway = await getGiveaway(giveawayId);
  return giveaway?.banLogs || [];
}

async function incrementMessageCounts(guildId, userId, amount = 1) {
  const database = await ensureDatabase();
  const active = Object.values(database.giveaways).filter(g => g.guildId === String(guildId) && g.status === 'active');
  if (!active.length) return 0;

  for (const giveaway of active) {
    const key = String(userId);
    giveaway.messageCounts[key] = Math.max(0, Number(giveaway.messageCounts[key]) || 0) + amount;
    giveaway.lastUpdatedAt = Date.now();
  }

  scheduleSave();
  return active.length;
}

async function incrementInviteCounts(guildId, inviterId, amount = 1) {
  const database = await ensureDatabase();
  const active = Object.values(database.giveaways).filter(g => g.guildId === String(guildId) && g.status === 'active');
  if (!active.length) return 0;

  for (const giveaway of active) {
    const key = String(inviterId);
    giveaway.inviteCounts[key] = Math.max(0, Number(giveaway.inviteCounts[key]) || 0) + amount;
    giveaway.lastUpdatedAt = Date.now();
  }

  scheduleSave();
  return active.length;
}

async function setInviteSnapshot(giveawayId, snapshot) {
  const database = await ensureDatabase();
  const giveaway = database.giveaways[String(giveawayId)];
  if (!giveaway) return null;
  giveaway.inviteSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  giveaway.lastUpdatedAt = Date.now();
  scheduleSave();
  return giveaway;
}

async function setGuildInviteSnapshot(guildId, snapshot) {
  const database = await ensureDatabase();
  database.inviteSnapshots[String(guildId)] = snapshot && typeof snapshot === 'object' ? snapshot : {};
  scheduleSave();
  return database.inviteSnapshots[String(guildId)];
}

async function getGuildInviteSnapshot(guildId) {
  const database = await ensureDatabase();
  return database.inviteSnapshots[String(guildId)] || {};
}

async function getSetting(key, fallback = null) {
  const database = await ensureDatabase();
  const value = database.settings?.[String(key)];
  return value === undefined ? fallback : value;
}

async function setSetting(key, value) {
  const database = await ensureDatabase();
  database.settings[String(key)] = value;
  scheduleSave();
  return value;
}

async function deleteSetting(key) {
  const database = await ensureDatabase();
  const existed = Object.prototype.hasOwnProperty.call(database.settings, String(key));
  delete database.settings[String(key)];
  scheduleSave();
  return existed;
}

function getUserStatsFromGiveaway(giveaway, userId) {
  if (!giveaway) return null;
  const key = String(userId);
  const participants = Array.isArray(giveaway.participants) ? giveaway.participants.map(String) : [];
  const bannedUsers = Array.isArray(giveaway.bannedUsers) ? giveaway.bannedUsers.map(String) : [];
  return {
    giveawayId: giveaway.id,
    prize: giveaway.prize,
    requiredMessages: giveaway.requiredMessages,
    requiredInvites: giveaway.requiredInvites,
    messages: Math.max(0, Number(giveaway.messageCounts?.[key]) || 0),
    invites: Math.max(0, Number(giveaway.inviteCounts?.[key]) || 0),
    joined: participants.includes(key),
    status: giveaway.status,
    endsAt: giveaway.endsAt,
    creatorId: giveaway.creatorId,
    participants: participants.length,
    banned: bannedUsers.includes(key),
  };
}

async function getGiveawayStats(giveawayId, userId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return null;
  return getUserStatsFromGiveaway(giveaway, userId);
}

async function getEligibleParticipants(giveawayId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return [];

  const eligible = [];
  for (const userId of giveaway.participants || []) {
    const stats = getUserStatsFromGiveaway(giveaway, userId);
    if (!stats) continue;
    if (stats.banned) continue;
    eligible.push({ userId, stats });
  }

  return eligible;
}

async function getActiveGiveawaysByGuild(guildId) {
  return getActiveGiveaways(guildId);
}

module.exports = {
  ensureDatabase,
  flushDatabase,
  getDatabase,
  createGiveaway,
  updateGiveaway,
  removeGiveaway,
  setGiveawayStatus,
  getGiveaway,
  getActiveGiveaways,
  getActiveGiveawayByMessageId,
  findGiveawayByMessageId,
  getActiveGiveawaysByGuild,
  addParticipant,
  forceAddParticipant,
  isGiveawayBanned,
  banUserFromGiveaway,
  banUserFromActiveGiveaways,
  unbanUserFromGiveaway,
  unbanUserFromActiveGiveaways,
  getGiveawayBanLogs,
  incrementMessageCounts,
  incrementInviteCounts,
  setInviteSnapshot,
  setGuildInviteSnapshot,
  getGuildInviteSnapshot,
  getSetting,
  setSetting,
  deleteSetting,
  getGiveawayStats,
  getEligibleParticipants,
};

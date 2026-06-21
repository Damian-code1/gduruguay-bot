const { query } = require('./db');

const HISTORY_TTL_MS = 20 * 60 * 1000;
const cleanupTimers = new Map();

function timerKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearCleanupTimer(k) {
  const timer = cleanupTimers.get(k);
  if (timer) clearTimeout(timer);
  cleanupTimers.delete(k);
}

function scheduleHistoryCleanup(guildId, userId, expiresAt) {
  const k = timerKey(guildId, userId);
  clearCleanupTimer(k);
  const delay = Math.max(1000, Number(expiresAt) - Date.now());
  const timer = setTimeout(async () => {
    try {
      await query(
        "DELETE FROM afk WHERE guild_id = ? AND user_id = ? AND state = 'history' AND expires_at <= ?",
        [guildId, userId, Date.now()]
      );
      await query(
        'DELETE FROM afk_mentions WHERE guild_id = ? AND user_id = ?',
        [guildId, userId]
      );
    } catch (error) {
      console.error('Error limpiando historial AFK:', error);
    }
    clearCleanupTimer(k);
  }, delay);
  timer.unref?.();
  cleanupTimers.set(k, timer);
}

async function setAfk(guildId, userId, payload) {
  const reason = String(payload?.reason || 'AFK');
  const since = Number(payload?.since || Date.now());
  const username = String(payload?.username || '');
  const previousNickname = payload?.previousNickname ?? null;

  await query(
    `INSERT INTO afk (guild_id, user_id, state, reason, since, username, previous_nickname, mention_count, returned_at, expires_at)
     VALUES (?, ?, 'active', ?, ?, ?, ?, 0, NULL, NULL)
     ON DUPLICATE KEY UPDATE
       state = 'active', reason = VALUES(reason), since = VALUES(since),
       username = VALUES(username), previous_nickname = VALUES(previous_nickname),
       mention_count = 0, returned_at = NULL, expires_at = NULL`,
    [guildId, userId, reason, since, username, previousNickname]
  );

  clearCleanupTimer(timerKey(guildId, userId));
  await query('DELETE FROM afk_mentions WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

async function getAfk(guildId, userId) {
  const [rows] = await query(
    "SELECT * FROM afk WHERE guild_id = ? AND user_id = ? AND state = 'active'",
    [guildId, userId]
  );
  if (!rows.length) return null;

  const record = rows[0];
  return {
    state: record.state,
    reason: record.reason,
    since: Number(record.since),
    username: record.username,
    previousNickname: record.previous_nickname,
    mentionCount: Number(record.mention_count || 0),
  };
}

async function clearAfk(guildId, userId) {
  const [rows] = await query(
    "SELECT * FROM afk WHERE guild_id = ? AND user_id = ? AND state = 'active'",
    [guildId, userId]
  );
  if (!rows.length) return false;

  const expiresAt = Date.now() + HISTORY_TTL_MS;
  await query(
    "UPDATE afk SET state = 'history', returned_at = ?, expires_at = ? WHERE guild_id = ? AND user_id = ?",
    [Date.now(), expiresAt, guildId, userId]
  );

  scheduleHistoryCleanup(guildId, userId, expiresAt);
  return true;
}

async function recordAfkMention(guildId, userId, mention) {
  const [rows] = await query(
    "SELECT * FROM afk WHERE guild_id = ? AND user_id = ? AND state = 'active'",
    [guildId, userId]
  );
  if (!rows.length) return null;

  const mentionUserId = String(mention?.userId || '');
  const username = String(mention?.username || 'Usuario');
  const content = String(mention?.content || '').slice(0, 500);
  const channelId = String(mention?.channelId || '');
  const channelName = String(mention?.channelName || '');
  const timestamp = Number(mention?.timestamp || Date.now());

  await query(
    `INSERT INTO afk_mentions (guild_id, user_id, mention_user_id, mention_username, content, channel_id, channel_name, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, userId, mentionUserId, username, content, channelId, channelName, timestamp]
  );

  await query(
    'UPDATE afk SET mention_count = mention_count + 1 WHERE guild_id = ? AND user_id = ?',
    [guildId, userId]
  );

  const record = rows[0];
  return {
    state: record.state,
    reason: record.reason,
    since: Number(record.since),
    username: record.username,
    previousNickname: record.previous_nickname,
    mentionCount: Number(record.mention_count || 0) + 1,
  };
}

async function getLastAfkMentions(guildId, userId) {
  const [rows] = await query(
    "SELECT * FROM afk WHERE guild_id = ? AND user_id = ? AND state = 'history'",
    [guildId, userId]
  );
  if (!rows.length) return null;

  const record = rows[0];
  const [mentions] = await query(
    'SELECT * FROM afk_mentions WHERE guild_id = ? AND user_id = ? ORDER BY timestamp ASC',
    [guildId, userId]
  );

  return {
    state: record.state,
    reason: record.reason,
    since: Number(record.since),
    username: record.username,
    previousNickname: record.previous_nickname,
    mentionCount: Number(record.mention_count || 0),
    returnedAt: record.returned_at ? Number(record.returned_at) : null,
    expiresAt: record.expires_at ? Number(record.expires_at) : null,
    mentions: mentions.map(m => ({
      userId: m.mention_user_id,
      username: m.mention_username,
      content: m.content,
      channelId: m.channel_id,
      channelName: m.channel_name,
      timestamp: Number(m.timestamp),
    })),
  };
}

module.exports = {
  setAfk,
  getAfk,
  clearAfk,
  recordAfkMention,
  getLastAfkMentions,
};
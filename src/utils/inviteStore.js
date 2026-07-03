'use strict';

const { query } = require('./database');

/** Refresca el cache local (DB) de invites del server con los usos actuales de Discord. */
async function refreshInviteCache(guild) {
  try {
    const invites = await guild.invites.fetch();
    for (const invite of invites.values()) {
      await query(
        `INSERT INTO invite_cache (guild_id, code, inviter_id, uses)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE uses = VALUES(uses), inviter_id = VALUES(inviter_id)`,
        [guild.id, invite.code, invite.inviterId || null, invite.uses || 0],
      );
    }
    return invites;
  } catch (err) {
    console.error('Error refrescando cache de invites:', err);
    return null;
  }
}

/** Compara el snapshot guardado contra los invites actuales para saber cuál subió de uso (= quién invitó). */
async function findUsedInviteCode(guild) {
  const [cached] = await query('SELECT code, uses FROM invite_cache WHERE guild_id = ?', [guild.id]);
  const cachedMap = new Map(cached.map((r) => [r.code, r.uses]));

  const current = await guild.invites.fetch().catch(() => null);
  if (!current) return null;

  for (const invite of current.values()) {
    const prevUses = cachedMap.get(invite.code) || 0;
    if ((invite.uses || 0) > prevUses) {
      return { code: invite.code, inviterId: invite.inviterId || null };
    }
  }
  return null;
}

async function incrementInviteCount(guildId, userId) {
  await query(
    `INSERT INTO invite_counts (guild_id, user_id, count)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE count = count + 1`,
    [guildId, userId],
  );
}

async function getInviteCount(guildId, userId) {
  const [rows] = await query(
    'SELECT count FROM invite_counts WHERE guild_id = ? AND user_id = ?',
    [guildId, userId],
  );
  return rows[0]?.count || 0;
}

module.exports = { refreshInviteCache, findUsedInviteCode, incrementInviteCount, getInviteCount };
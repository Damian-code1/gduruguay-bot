'use strict';

const { query } = require('./database');
const { getMuteRoleId } = require('./muteRoleStore');

// key: `${guildId}:${userId}` -> Timeout
const timers = new Map();

function timerKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearMuteTimer(guildId, userId) {
  const key = timerKey(guildId, userId);
  const existing = timers.get(key);
  if (existing) {
    clearTimeout(existing);
    timers.delete(key);
  }
}

function setMuteTimer(guildId, userId, durationMs, callback) {
  clearMuteTimer(guildId, userId);
  // setTimeout tiene un límite de ~24.8 días (int32); para mutes más largos, encadenamos.
  const MAX_TIMEOUT = 2_147_000_000;

  const schedule = (remainingMs) => {
    const key = timerKey(guildId, userId);
    if (remainingMs > MAX_TIMEOUT) {
      const t = setTimeout(() => schedule(remainingMs - MAX_TIMEOUT), MAX_TIMEOUT);
      timers.set(key, t);
    } else {
      const t = setTimeout(async () => {
        timers.delete(key);
        await callback();
      }, Math.max(remainingMs, 0));
      timers.set(key, t);
    }
  };

  schedule(durationMs);
}

/**
 * Al arrancar el bot, recupera mutes activos desde la BD y reprograma sus timers
 * (o desmutea inmediatamente si ya venció mientras el bot estaba offline).
 * @param {import('discord.js').Client} client
 */
async function restoreActiveMutes(client) {
  const [rows] = await query(
    'SELECT guild_id, user_id, expires_at FROM active_mutes WHERE expires_at IS NOT NULL',
  );

  for (const row of rows) {
    const guildId = row.guild_id;
    const userId = row.user_id;
    const expiresAt = new Date(row.expires_at).getTime();
    const remaining = expiresAt - Date.now();

    const unmuteAction = async () => {
      try {
        const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
        if (!guild) return;

        const roleId = await getMuteRoleId(guildId);
        if (!roleId) return;

        const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
        if (member?.roles.cache.has(roleId)) {
          await member.roles.remove(roleId, 'Mute expirado').catch(() => null);
        }

        await query('DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
      } catch (err) {
        console.error('Error al desmutear automáticamente:', err);
      }
    };

    if (remaining <= 0) {
      await unmuteAction();
    } else {
      setMuteTimer(guildId, userId, remaining, unmuteAction);
    }
  }

  if (rows.length) {
    console.log(`🔁 Reprogramados ${rows.length} mute(s) activos.`);
  }
}

module.exports = { setMuteTimer, clearMuteTimer, restoreActiveMutes };

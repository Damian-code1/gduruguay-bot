const activeMuteTimers = new Map();
const MAX_TIMEOUT_MS = 2_147_483_647;

function timerKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function clearMuteTimer(guildId, userId) {
  const key = timerKey(guildId, userId);
  const existing = activeMuteTimers.get(key);
  if (existing) {
    existing.cancelled = true;
    if (existing.timeoutId) {
      clearTimeout(existing.timeoutId);
    }
    activeMuteTimers.delete(key);
    return true;
  }
  return false;
}

function scheduleTimer(key, remainingMs, callback) {
  const entry = activeMuteTimers.get(key);
  if (!entry || entry.cancelled) return;

  const delay = Math.min(remainingMs, MAX_TIMEOUT_MS);
  entry.timeoutId = setTimeout(async () => {
    const current = activeMuteTimers.get(key);
    if (!current || current.cancelled) return;

    const nextRemaining = remainingMs - delay;
    if (nextRemaining > 0) {
      scheduleTimer(key, nextRemaining, callback);
      return;
    }

    activeMuteTimers.delete(key);
    try {
      await callback();
    } catch {
      // ignore
    }
  }, delay);

  if (typeof entry.timeoutId.unref === 'function') entry.timeoutId.unref();
}

function setMuteTimer(guildId, userId, durationMs, callback) {
  clearMuteTimer(guildId, userId);

  if (!durationMs || durationMs <= 0 || typeof callback !== 'function') {
    return null;
  }

  const key = timerKey(guildId, userId);
  activeMuteTimers.set(key, { cancelled: false, timeoutId: null });
  scheduleTimer(key, durationMs, callback);
  return activeMuteTimers.get(key)?.timeoutId || null;
}

module.exports = {
  clearMuteTimer,
  setMuteTimer,
};
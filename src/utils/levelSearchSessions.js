'use strict';

// Sesiones activas de /levelsearch, en memoria.
// key: sessionId -> session object (ver commands/levelsearch.js para la forma exacta)
const sessions = new Map();

const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutos de inactividad

function registerLevelSearchSession(session) {
  session.lastActivity = Date.now();
  sessions.set(session.id, session);
  scheduleExpiry(session.id);
  return session;
}

function getLevelSearchSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.lastActivity = Date.now();
  return session;
}

function deleteLevelSearchSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.expiryTimer) clearTimeout(session.expiryTimer);
  sessions.delete(sessionId);
}

function scheduleExpiry(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;
  if (session.expiryTimer) clearTimeout(session.expiryTimer);

  session.expiryTimer = setTimeout(() => {
    const current = sessions.get(sessionId);
    if (!current) return;
    if (Date.now() - current.lastActivity >= SESSION_TTL_MS) {
      sessions.delete(sessionId);
    } else {
      scheduleExpiry(sessionId);
    }
  }, SESSION_TTL_MS);

  // No mantener el proceso vivo solo por este timer
  if (typeof session.expiryTimer.unref === 'function') session.expiryTimer.unref();
}

module.exports = {
  registerLevelSearchSession,
  getLevelSearchSession,
  deleteLevelSearchSession,
};

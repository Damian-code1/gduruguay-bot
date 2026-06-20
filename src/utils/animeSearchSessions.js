const sessions = new Map();

const SESSION_TTL_MS = 10 * 60 * 1000;

function scheduleCleanup(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return;

  if (session.timer) {
    clearTimeout(session.timer);
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  session.timer = setTimeout(() => {
    sessions.delete(sessionId);
  }, SESSION_TTL_MS);

  session.timer.unref?.();
}

function registerAnimeSearchSession(session) {
  sessions.set(session.id, {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
    timer: null,
  });

  scheduleCleanup(session.id);
  return session.id;
}

function getAnimeSearchSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function touchAnimeSearchSession(sessionId) {
  if (!sessions.has(sessionId)) return null;
  scheduleCleanup(sessionId);
  return sessions.get(sessionId) || null;
}

function deleteAnimeSearchSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }

  sessions.delete(sessionId);
}

async function handleAnimeSearchInteraction(interaction) {
  const parts = String(interaction.customId || '').split(':');
  if (parts[0] !== 'animesearch' || parts.length < 3) return false;

  const sessionId = parts[1];
  const action = parts[2];
  const session = getAnimeSearchSession(sessionId);

  if (!session) {
    await interaction.reply({ content: '❌ Esta búsqueda expiró.', ephemeral: true }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== session.authorId) {
    await interaction.reply({ content: '❌ Solo el autor de la búsqueda puede usar estos controles.', ephemeral: true }).catch(() => null);
    return true;
  }

  touchAnimeSearchSession(sessionId);

  try {
    if (interaction.isButton()) {
      if (action === 'prev') {
        session.currentPage = Math.max(1, Number(session.currentPage || 1) - 1);
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'next') {
        session.currentPage = Math.min(Math.max(1, Number(session.totalPages || 1)), Number(session.currentPage || 1) + 1);
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'back') {
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else {
        return false;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (action !== 'select') return false;
      const selectedValue = String(interaction.values?.[0] || '').trim();
      const pageResults = Array.isArray(session.currentPageResults) ? session.currentPageResults : [];
      const matchedAnime = pageResults.find((anime) => String(anime?.mal_id ?? '') === selectedValue);
      const matchedIndex = pageResults.findIndex((anime) => String(anime?.mal_id ?? '') === selectedValue);

      if (!selectedValue || matchedIndex < 0 || !matchedAnime) {
        await interaction.reply({ content: '❌ Selección inválida.', ephemeral: true }).catch(() => null);
        return true;
      }

      session.selectedAnimeId = selectedValue;
      session.selectedAnime = matchedAnime;
      session.selectedIndex = matchedIndex;
      session.mode = 'detail';

      const payload = await session.renderDetail(matchedAnime);
      await interaction.update(payload).catch(async () => {
        await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
      });

      return true;
    }

    const payload = session.mode === 'detail'
      ? await session.renderDetail(session.selectedAnime)
      : await session.renderList(session.currentPage);

    await interaction.update(payload).catch(async () => {
      await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
    });

    return true;
  } catch (error) {
    console.error('[animesearch][session]', error);
    await interaction.reply({ content: '❌ Ocurrió un error actualizando la búsqueda.', ephemeral: true }).catch(() => null);
    return true;
  }
}

module.exports = {
  registerAnimeSearchSession,
  getAnimeSearchSession,
  touchAnimeSearchSession,
  deleteAnimeSearchSession,
  handleAnimeSearchInteraction,
};

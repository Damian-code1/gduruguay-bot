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

function registerAnimeTopSession(session) {
  sessions.set(session.id, {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
    timer: null,
  });

  scheduleCleanup(session.id);
  return session.id;
}

function getAnimeTopSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function touchAnimeTopSession(sessionId) {
  if (!sessions.has(sessionId)) return null;
  scheduleCleanup(sessionId);
  return sessions.get(sessionId) || null;
}

function deleteAnimeTopSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }

  sessions.delete(sessionId);
}

async function handleAnimeTopInteraction(interaction) {
  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return false;

  const parts = String(interaction.customId || '').split(':');
  if (parts[0] !== 'animetop' || parts.length < 3) return false;

  const sessionId = parts[1];
  const action = parts[2];
  const session = getAnimeTopSession(sessionId);

  if (!session) {
    await interaction.reply({ content: '❌ Esta lista de anime expiró.', ephemeral: true }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== session.authorId) {
    await interaction.reply({ content: '❌ Solo quien ejecutó el comando puede usar estos controles.', ephemeral: true }).catch(() => null);
    return true;
  }

  touchAnimeTopSession(sessionId);

  try {
    if (interaction.isButton()) {
      if (action === 'prev') {
        const nextPage = Math.max(1, Number(session.currentPage || 1) - 1);
        if (nextPage === Number(session.currentPage || 1)) {
          await interaction.reply({ content: '❌ Ya estás en la primera página.', ephemeral: true }).catch(() => null);
          return true;
        }
        session.mode = 'list';
        await session.loadPage(nextPage);
      } else if (action === 'next') {
        const maxPages = Math.max(1, Number(session.totalPages || 1));
        const nextPage = Math.min(maxPages, Number(session.currentPage || 1) + 1);
        if (nextPage === Number(session.currentPage || 1)) {
          await interaction.reply({ content: '❌ No hay más páginas disponibles.', ephemeral: true }).catch(() => null);
          return true;
        }
        session.mode = 'list';
        await session.loadPage(nextPage);
      } else if (action === 'back') {
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else {
        return false;
      }

      const payload = await session.renderList(session.currentPage);
      await interaction.update(payload).catch(async () => {
        await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
      });

      return true;
    }

    if (interaction.isStringSelectMenu()) {
      if (action !== 'select') return false;

      const selectedId = Number(interaction.values?.[0]);
      if (!Number.isInteger(selectedId) || selectedId <= 0) {
        await interaction.reply({ content: '❌ Selección inválida.', ephemeral: true }).catch(() => null);
        return true;
      }

      const payload = await session.renderDetail(selectedId);
      if (!payload) {
        await interaction.reply({ content: '❌ No se pudo cargar la ficha del anime.', ephemeral: true }).catch(() => null);
        return true;
      }

      session.mode = 'detail';

      await interaction.update(payload).catch(async () => {
        await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
      });

      return true;
    }
  } catch (error) {
    console.error('[animetop][session]', error);
    await interaction.reply({ content: '❌ Ocurrió un error actualizando la búsqueda.', ephemeral: true }).catch(() => null);
    return true;
  }

  return false;
}

module.exports = {
  registerAnimeTopSession,
  getAnimeTopSession,
  touchAnimeTopSession,
  deleteAnimeTopSession,
  handleAnimeTopInteraction,
};

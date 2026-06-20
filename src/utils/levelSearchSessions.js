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

function registerLevelSearchSession(session) {
  sessions.set(session.id, {
    ...session,
    expiresAt: Date.now() + SESSION_TTL_MS,
    timer: null,
  });
  scheduleCleanup(session.id);
  return session.id;
}

function getLevelSearchSession(sessionId) {
  return sessions.get(sessionId) || null;
}

function touchLevelSearchSession(sessionId) {
  if (!sessions.has(sessionId)) return null;
  scheduleCleanup(sessionId);
  return sessions.get(sessionId) || null;
}

function deleteLevelSearchSession(sessionId) {
  const session = sessions.get(sessionId);
  if (session?.timer) {
    clearTimeout(session.timer);
  }
  sessions.delete(sessionId);
}

async function handleLevelSearchInteraction(interaction) {
  const parts = String(interaction.customId || '').split(':');
  if (parts[0] !== 'lvlsearch' || parts.length < 3) return false;

  const sessionId = parts[1];
  const action = parts[2];
  const session = getLevelSearchSession(sessionId);

  if (!session) {
    await interaction.reply({ content: '❌ Esta búsqueda expiró.', ephemeral: true }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== session.authorId) {
    await interaction.reply({ content: '❌ Solo el autor de la búsqueda puede usar estos controles.', ephemeral: true }).catch(() => null);
    return true;
  }

  touchLevelSearchSession(sessionId);

  try {
    if (interaction.isButton()) {
      await interaction.deferUpdate().catch(() => null);

      if (action === 'first') {
        session.currentPage = 0;
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'prev') {
        session.currentPage = Math.max(0, Number(session.currentPage || 0) - 1);
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'next') {
        session.currentPage = Math.min(Math.max(0, Number(session.totalPages || 1) - 1), Number(session.currentPage || 0) + 1);
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'last') {
        session.currentPage = Math.max(0, Number(session.totalPages || 1) - 1);
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'back') {
        session.mode = 'list';
        await session.loadPage(session.currentPage);
      } else if (action === 'copyid') {
  const levelId = String(
    session.selectedLevel?.id ??
    session.selectedLevel?.levelID ??
    session.selectedLevel?.levelId ??
    ''
  );

  await interaction.followUp({
    content: levelId,
    ephemeral: true,
  });

  return true;
} else if (action === 'close') {
        deleteLevelSearchSession(sessionId);
        const payload = session.renderClosed
          ? await session.renderClosed()
          : { content: '🔎 Búsqueda cerrada.' };
        await interaction.message.edit(payload).catch(async () => {
          await interaction.followUp({ content: '❌ No se pudo cerrar la búsqueda.', ephemeral: true }).catch(() => null);
        });
        return true;
      } else {
        return false;
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (action !== 'select') return false;
      await interaction.deferUpdate().catch(() => null);

      const selectedValue = String(interaction.values?.[0] || '').trim();
      const pageLevels = Array.isArray(session.currentPageResults) ? session.currentPageResults : [];
      const matchedLevel = pageLevels.find((level) => String(level?.id ?? level?.levelID ?? level?.levelId ?? '') === selectedValue);
      const matchedIndex = pageLevels.findIndex((level) => String(level?.id ?? level?.levelID ?? level?.levelId ?? '') === selectedValue);

      if (!selectedValue || matchedIndex < 0 || !matchedLevel) {
        await interaction.reply({ content: '❌ Selección inválida.', ephemeral: true }).catch(() => null);
        return true;
      }

      session.selectedLevelId = selectedValue;
      session.selectedLevel = matchedLevel;
      session.selectedIndex = matchedIndex;
      session.mode = 'detail';

      const payload = await session.renderDetail(matchedLevel);
      await interaction.message.edit(payload).catch(async () => {
        await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
      });

      return true;
    }

    const payload = session.mode === 'detail'
      ? await session.renderDetail(session.selectedLevel)
      : await session.renderList(session.currentPage);

    await interaction.deferUpdate().catch(() => null);
    await interaction.message.edit(payload).catch(async () => {
      await interaction.followUp({ content: '❌ No se pudo actualizar el mensaje.', ephemeral: true }).catch(() => null);
    });

    return true;
  } catch (error) {
    console.error('[levelsearch][session]', error);
    await interaction.reply({ content: '❌ Ocurrió un error actualizando la búsqueda.', ephemeral: true }).catch(() => null);
    return true;
  }
}

module.exports = {
  registerLevelSearchSession,
  getLevelSearchSession,
  touchLevelSearchSession,
  deleteLevelSearchSession,
  handleLevelSearchInteraction,
};
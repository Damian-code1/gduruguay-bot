'use strict';

const { MessageFlags } = require('discord.js');
const { getLevelSearchSession, deleteLevelSearchSession } = require('./levelSearchSessions');
const { getLevelId, attachAredlPositions, fetchSearchPage, fetchLevelById, resolveFullLevel } = require('./levelSearchData');
const { buildListPayload, buildDetailPayload, buildClosedPayload, buildEmptyPayload, buildErrorPayload } = require('./levelSearchUi');

/**
 * Carga (con caché en session.pageCache) y setea como página actual los resultados de `pageNumber`.
 * También precarga la siguiente página en segundo plano para que next/prev se sienta instantáneo.
 */
async function loadPage(session, pageNumber) {
  const page = Math.max(0, Number(pageNumber) || 0);
  let data = session.pageCache.get(page);
  if (!data) {
    data = await fetchSearchPage(session.query, page);
    session.pageCache.set(page, data);
  }

  session.currentPage = page;
  session.currentPageResults = await attachAredlPositions(Array.isArray(data.results) ? data.results : []);
  session.totalPages = Math.max(1, Number(data.totalPages || session.totalPages || 1));
  session.totalResults = data.totalResults ?? session.totalResults ?? null;

  const nextPage = page + 1;
  if (nextPage < session.totalPages && !session.pageCache.has(nextPage)) {
    fetchSearchPage(session.query, nextPage)
      .then((nextData) => session.pageCache.set(nextPage, nextData))
      .catch(() => null);
  }
}

function findLevelInPage(session, value) {
  const pageLevels = Array.isArray(session.currentPageResults) ? session.currentPageResults : [];
  const rawValue = String(value || '').trim();
  return pageLevels.find((level) => String(getLevelId(level)) === rawValue) || null;
}

/**
 * Maneja todas las interacciones de componentes (`customId` que empieza con `lvlsearch:`).
 * customId shape: lvlsearch:<sessionId>:<action>
 */
async function handleLevelSearchInteraction(interaction) {
  const [, sessionId, action] = interaction.customId.split(':');
  const session = getLevelSearchSession(sessionId);

  if (!session) {
    return interaction.update({
      ...buildClosedPayload({ query: '' }),
    }).catch(() =>
      interaction.reply({ content: 'Esta búsqueda expiró. Usá `/levelsearch` de nuevo.', flags: MessageFlags.Ephemeral }).catch(() => null),
    );
  }

  if (interaction.user.id !== session.userId) {
    return interaction.reply({
      content: 'Esta búsqueda no es tuya. Usá `/levelsearch` para hacer la tuya.',
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    switch (action) {
      case 'first':
        await loadPage(session, 0);
        return interaction.update(buildListPayload(session));

      case 'prev':
        await loadPage(session, session.currentPage - 1);
        return interaction.update(buildListPayload(session));

      case 'next':
        await loadPage(session, session.currentPage + 1);
        return interaction.update(buildListPayload(session));

      case 'last':
        await loadPage(session, session.totalPages - 1);
        return interaction.update(buildListPayload(session));

      case 'select': {
        const selectedValue = interaction.values?.[0];
        const rawLevel = findLevelInPage(session, selectedValue);
        if (!rawLevel) {
          return interaction.reply({ content: 'No pude encontrar ese nivel en esta página. Probá de nuevo.', flags: MessageFlags.Ephemeral });
        }
        const level = await resolveFullLevel(rawLevel, fetchLevelById);
        session.selectedLevel = level;
        return interaction.update(buildDetailPayload(session, level));
      }

      case 'back':
        return interaction.update(buildListPayload(session));

      case 'copyid': {
        const level = session.selectedLevel;
        const id = level ? getLevelId(level) : null;
        return interaction.reply({
          content: id ? `\`${id}\`` : 'No hay un ID disponible.',
          flags: MessageFlags.Ephemeral,
        });
      }

      case 'close':
        deleteLevelSearchSession(session.id);
        return interaction.update(buildClosedPayload(session));

      default:
        return interaction.reply({ content: 'Acción desconocida.', flags: MessageFlags.Ephemeral });
    }
  } catch (error) {
    console.error('[levelsearch] Error manejando interacción:', error);
    const payload = buildErrorPayload(error?.message || 'Ocurrió un error inesperado.');
    return interaction.update(payload).catch(() => interaction.reply({ ...payload }).catch(() => null));
  }
}

module.exports = { handleLevelSearchInteraction, loadPage };

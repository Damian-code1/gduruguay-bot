'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { registerLevelSearchSession } = require('../utils/levelSearchSessions');
const { attachAredlPositions, fetchSearchPage } = require('../utils/levelSearchData');
const { buildListPayload, buildEmptyPayload, buildErrorPayload } = require('../utils/levelSearchUi');
const { loadPage } = require('../utils/levelSearchInteractions');

module.exports = {
  visibility: 'public', // usado por /cmds

  data: new SlashCommandBuilder()
    .setName('levelsearch')
    .setDescription('Busca niveles de Geometry Dash por nombre o ID.')
    .addStringOption((opt) =>
      opt.setName('query').setDescription('Nombre del nivel o ID').setRequired(true),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const query = interaction.options.getString('query', true).trim();

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // Ephemeral mientras busca

    try {
      const initial = await fetchSearchPage(query, 0);

      if (!Array.isArray(initial.results) || initial.results.length === 0) {
        return interaction.editReply(buildEmptyPayload(query));
      }

      initial.results = await attachAredlPositions(initial.results);

      const sessionId = `${interaction.id}`;

      const session = {
        id: sessionId,
        userId: interaction.user.id,
        query,
        currentPage: 0,
        currentPageResults: initial.results,
        totalPages: Math.max(1, initial.totalPages || 1),
        totalResults: initial.totalResults,
        pageCache: new Map([[0, initial]]),
        selectedLevel: null,
      };

      registerLevelSearchSession(session);

      // Asegura consistencia de página (recalcula si hiciera falta) antes del primer render.
      await loadPage(session, 0);

      return interaction.editReply(buildListPayload(session));
    } catch (err) {
      console.error('[levelsearch] Error:', err);
      return interaction.editReply(buildErrorPayload(`Error al conectarse a GDBrowser: ${err?.message || String(err)}`));
    }
  },
};

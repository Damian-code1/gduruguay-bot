const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { fetchKitsuTopByCategory, fetchKitsuById } = require('../utils/animeKitsu');
const { getAnimeDisplayField, buildAnimeStreamingButtons } = require('../utils/animeJikan');

const PAGE_SIZE = 10;

function parseCategories(input) {
  return String(input || '')
    .split(/\s*(?:,|\+|\/|\||&|\s+y\s+)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeAndSortAnimeLists(lists) {
  const merged = new Map();

  for (const list of lists) {
    for (const anime of Array.isArray(list) ? list : []) {
      if (!anime?.mal_id) continue;

      const current = merged.get(anime.mal_id);
      const nextScore = Number(anime?.score || 0);
      const currentScore = Number(current?.score || 0);

      if (!current || nextScore > currentScore) {
        merged.set(anime.mal_id, anime);
      }
    }
  }

  return [...merged.values()].sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
}

// Use Kitsu top-by-category endpoint
async function fetchMergedTopPage(genres, page) {
  // genres: array of category names. We join them with comma to pass to Kitsu filter
  const filter = genres.map((g) => g.name || g).join(',');
  const { results, pageInfo } = await fetchKitsuTopByCategory(filter, page, PAGE_SIZE).catch(() => ({ results: [], pageInfo: { total: 0 } }));
  const totalPages = Math.max(1, Math.ceil((pageInfo?.total || 0) / PAGE_SIZE));
  return { results: Array.isArray(results) ? results.slice(0, PAGE_SIZE) : [], totalPages };
}

module.exports = {
  name: 'animetop',
  aliases: ['atop', 'topanime', 'animerec', 'animetop5', 'topani', 'anitop'],
  help: {
    purpose: 'Muestra animes por una o varias categorías con paginación dinámica y ficha visual.',
    category: '🎮 Diversión',
    usage: '-animetop <categoría>',
    aliases: ['atop', 'topanime', 'animerec', 'animetop5', 'topani', 'anitop'],
  },
  async execute(message, args) {
    const categoryInput = args.join(' ').trim();

    if (!categoryInput) {
      const genres = await fetchAnimeGenres();
      const available = genres
        .slice(0, 30)
        .map((genre) => genre.name)
        .join(' • ');

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(EMBED_COLOR)
            .setTitle('📖 Categorías disponibles · -animetop')
            .setDescription([
              'Usá `-animetop` seguido de una o varias categorías para ver resultados paginados.',
              'Podés separarlas con coma, `+` o `y`.',
            ].join('\n\n'))
            .addFields(
              { name: 'Uso', value: '`-animetop romance`\n`-animetop romance, action`\n`-animetop shounen + seinen`' },
              { name: 'Categorías disponibles', value: available.slice(0, 1024) || 'Action • Comedy • Romance • Shounen • Seinen • Horror' },
              { name: 'Alias', value: '`-atop`, `-topanime`, `-animerec`, `-animetop5`, `-topani`, `-anitop`' }
            ),
        ],
      });
    }

    const loading = await message.reply('📡 Consultando categorías y ranking en Jikan...');

    try {
      const genres = await fetchAnimeGenres();
      const categoryParts = parseCategories(categoryInput);
      const resolvedGenres = [...new Map(categoryParts
        .map((part) => resolveGenre(part, genres))
        .filter(Boolean)
        .map((genre) => [genre.id, genre]))
        .values()];

      if (resolvedGenres.length === 0) {
        const preview = genres.slice(0, 20).map((g) => g.name).join(' • ');
        await loading.edit({
          embeds: [
            new EmbedBuilder()
              .setColor(EMBED_COLOR)
              .setTitle('❌ Categoría no reconocida')
              .setDescription(`No encontré la categoría **${categoryInput}**.`)
              .addFields({ name: 'Categorías válidas (ejemplos)', value: preview.slice(0, 1024) || 'Action • Comedy • Romance • Shounen • Seinen • Horror...' }),
          ],
        });
        return;
      }

      const state = {
        genres: resolvedGenres,
        currentPage: 1,
        totalPages: 1,
        currentPageResults: [],
        selectedAnime: null,
        selectedAnimeId: null,
        mode: 'list',
      };

      const loadPage = async (pageNumber) => {
        const page = Math.max(1, Number(pageNumber) || 1);
        const data = await fetchMergedTopPage(resolvedGenres, page);
        state.currentPage = page;
        state.currentPageResults = Array.isArray(data.results) ? data.results.slice(0, PAGE_SIZE) : [];
        state.totalPages = Math.max(1, Number(data.totalPages || data.totalPages || state.totalPages || 1));
        state.selectedAnime = null;
        state.selectedAnimeId = null;
        return state.currentPageResults;
      };

      await loadPage(1);

      if (state.currentPageResults.length === 0) {
        await loading.edit('❌ No encontré animes con score en esa categoría.');
        return;
      }

      const renderList = async () => {
        const page = Math.max(1, Number(state.currentPage) || 1);
        const title = resolvedGenres.map((genre) => genre.name || genre).join(' + ');
        const lines = [
          `🔎 **Resultados para "${title}" - Página ${page}**`,
          '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯',
        ];

        state.currentPageResults.slice(0, PAGE_SIZE).forEach((anime, idx) => {
          const score = anime?.averageRating ? `${anime.averageRating}` : 'Sin score';
          const t = anime?.title || `Anime #${idx + 1}`;
          lines.push(`${idx + 1}. ${t} - ⭐ ${score}`);
          if (anime?.poster) lines.push(`🖼️ Mini: ${anime.poster}`);
          if (idx < Math.min(10, state.currentPageResults.length) - 1) lines.push('⎯⎯⎯⎯⎯⎯⎯');
        });

        lines.push('⎯⎯⎯⎯⎯⎯⎯');
        lines.push('⬇️ **Elegí un anime...**');

        const embed = new EmbedBuilder().setColor(0x23272A).setTitle(`Resultados para "${title}" - Página ${page}`).setDescription(lines.join('\n'));

        const navRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`anime:${message.id}:prev`).setLabel('Anterior').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1),
          new ButtonBuilder().setCustomId(`anime:${message.id}:next`).setLabel('Siguiente').setEmoji('➡️').setStyle(ButtonStyle.Secondary).setDisabled(page >= state.totalPages)
        );

        const selectRow = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`anime:${message.id}:select`)
            .setPlaceholder('Elegí un anime...')
            .addOptions(state.currentPageResults.slice(0, PAGE_SIZE).map((anime, idx) => ({
              label: (anime.title || `Anime ${idx + 1}`).slice(0, 100),
              description: (anime.averageRating ? `⭐ ${anime.averageRating}` : '').slice(0, 100),
              value: String(anime.id),
            })))
        );

        return { embeds: [embed], components: [navRow, selectRow] };
      };

      const renderDetail = async () => {
        const baseAnime = state.selectedAnime || state.currentPageResults?.[0];
        if (!baseAnime?.id) return null;

        const fullAnime = await fetchKitsuById(baseAnime.id).catch(() => baseAnime);
        const title = fullAnime.title || 'Anime sin título';
        const poster = fullAnime.poster || fullAnime.cover || null;
        const desc = String(fullAnime.synopsis || 'Sin sinopsis disponible.').trim();
        const synopsis = desc.length > 1000 ? `${desc.slice(0, 997).trim()}…` : desc;
        const score = fullAnime?.averageRating ? `${fullAnime.averageRating}` : 'Desconocido';
        const mediaField = await getAnimeDisplayField(fullAnime, title);
        const status = fullAnime?.status || 'Desconocido';
        const genres = Array.isArray(fullAnime?.genres) ? fullAnime.genres.join(' • ') : 'Sin géneros';

        const embed = new EmbedBuilder()
          .setColor(0x23272A)
          .setTitle(`⭐ ${title}`)
          .setDescription('⎯⎯⎯⎯⎯⎯⎯')
          .addFields(
            { name: mediaField.name, value: String(mediaField.value), inline: true },
            { name: 'Estado', value: String(status), inline: true },
            { name: 'Rating', value: String(score), inline: true },
            { name: 'Géneros', value: String(genres), inline: true },
            { name: 'Sinopsis', value: `> ${synopsis.replace(/\n+/g, '\n> ')}`, inline: false },
            { name: '\u200b', value: '⎯⎯⎯⎯⎯⎯⎯', inline: false }
          );

        if (poster) embed.setImage(poster);

        const linksRow = new ActionRowBuilder();
        linksRow.addComponents(...await buildAnimeStreamingButtons(fullAnime));

        const backRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`anime:${message.id}:back`).setLabel('Volver a la lista').setEmoji('↩️').setStyle(ButtonStyle.Secondary)
        );

        return { embeds: [embed], components: [linksRow, backRow] };
      };

      await loading.edit({ content: '', ...(await renderList()) });

      const collector = loading.createMessageComponentCollector({ time: 10 * 60 * 1000, filter: (interaction) => interaction.user.id === message.author.id });

      collector.on('collect', async (interaction) => {
        try {
          if (interaction.isButton()) {
            if (interaction.customId === `anime:${message.id}:prev`) {
              if (state.currentPage <= 1) {
                await interaction.reply({ content: '❌ Ya estás en la primera página.', ephemeral: true }).catch(() => null);
                return;
              }

              const nextPage = state.currentPage - 1;
              await interaction.deferUpdate().catch(() => null);
              await loadPage(nextPage);
              state.mode = 'list';
              await loading.edit({ content: '', ...(await renderList()) }).catch(() => null);
              return;
            }

            if (interaction.customId === `anime:${message.id}:next`) {
              if (state.currentPage >= state.totalPages) {
                await interaction.reply({ content: '❌ No hay más páginas disponibles.', ephemeral: true }).catch(() => null);
                return;
              }

              const nextPage = state.currentPage + 1;
              await interaction.deferUpdate().catch(() => null);
              await loadPage(nextPage);
              state.mode = 'list';
              await loading.edit({ content: '', ...(await renderList()) }).catch(() => null);
              return;
            }

            if (interaction.customId === `anime:${message.id}:back`) {
              await interaction.deferUpdate().catch(() => null);
              state.mode = 'list';
              await loading.edit({ content: '', ...(await renderList()) }).catch(() => null);
              return;
            }
          }


          if (interaction.isStringSelectMenu()) {
            if (interaction.customId !== `anime:${message.id}:select`) return;

            const selectedValue = String(interaction.values?.[0] || '').trim();
            const matchedAnime = state.currentPageResults.find((anime) => String(anime?.id ?? '') === selectedValue);

            if (!selectedValue || !matchedAnime) {
              await interaction.reply({ content: '❌ Selección inválida.', ephemeral: true }).catch(() => null);
              return;
            }

            state.selectedAnimeId = selectedValue;
            state.selectedAnime = matchedAnime;
            state.mode = 'detail';

            await interaction.deferUpdate().catch(() => null);
            const detailPayload = await renderDetail();
            if (!detailPayload) return;
            await loading.edit({ content: '', ...detailPayload }).catch(() => null);
          }
        } catch (error) {
          console.error('[animetop][collector]', error);
          await interaction.reply({ content: '❌ Ocurrió un error actualizando la búsqueda.', ephemeral: true }).catch(() => null);
        }
      });

      collector.on('end', async () => {
        await loading.edit({ components: [] }).catch(() => null);
      });
    } catch (error) {
      console.error('[animetop]', error);
      await loading.edit('❌ Error al consultar Jikan. Probá de nuevo en unos segundos.');
    }
  },
};

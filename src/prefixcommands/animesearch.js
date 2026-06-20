const {
  MessageFlags,
} = require('discord.js');

const {
  searchAniListPage,
  fetchAniListFullById,
  cleanHtml,
  buildExternalButtonsForMedia,
  getBannerOrCover,
} = require('../utils/animeAnilist');

const SEARCH_PAGE_SIZE = 10;
const SEARCH_COLLECTOR_MS = 10 * 60 * 1000;

const synopsisCache =
  new Map();

const genreTranslationMap =
  new Map([
    ['action', 'Acción'],
    ['adventure', 'Aventura'],
    ['comedy', 'Comedia'],
    ['drama', 'Drama'],
    ['ecchi', 'Ecchi'],
    ['fantasy', 'Fantasía'],
    ['horror', 'Terror'],
    ['mystery', 'Misterio'],
    ['romance', 'Romance'],
    ['sci-fi', 'Ciencia ficción'],
    ['science fiction', 'Ciencia ficción'],
    ['slice of life', 'Slice of Life'],
    ['sports', 'Deportes'],
    ['supernatural', 'Sobrenatural'],
    ['thriller', 'Suspenso'],
    ['psychological', 'Psicológico'],
    ['music', 'Música'],
    ['school', 'Escolar'],
    ['shounen', 'Shounen'],
    ['shonen', 'Shounen'],
    ['seinen', 'Seinen'],
    ['josei', 'Josei'],
    ['mecha', 'Mecha'],
  ]);

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function translateGenres(genres) {
  if (!Array.isArray(genres))
    return 'Desconocido';

  return genres
    .map(g => {
      const key =
        normalize(g);

      return (
        genreTranslationMap.get(
          key
        ) ||
        g
      );
    })
    .join(', ');
}

function buildV2StatusCard(
  title,
  description,
  accentColor
) {
  return [
    {
      type: 17,

      accent_color:
        accentColor,

      components: [
        {
          type: 10,

          content:
            `# ${title}\n\n${description}`,
        },
      ],
    },
  ];
}

function buildSearchListCard({
  query,
  results,
  page,
  totalPages,
  totalResults,
  messageId,
}) {
  const lines = results.map((anime, index) => {
    const score = anime?.averageScore ? `⭐ ${anime.averageScore}%` : '⭐ Sin score';
    const title = anime?.title?.romaji || anime?.title?.english || anime?.title?.native || `Anime ${index + 1}`;
    const format = anime?.format ? ` · ${anime.format}` : '';
    return `${index + 1}. ${title}${format} — ${score}`;
  });

  const selectOptions = results.slice(0, 10).map((anime, index) => ({
    label: String(anime?.title?.romaji || anime?.title?.english || anime?.title?.native || `Anime ${index + 1}`).slice(0, 100),
    description: String(anime?.averageScore ? `⭐ ${anime.averageScore}%` : anime?.status || 'Seleccionar anime').slice(0, 100),
    value: String(anime?.id || ''),
  })).filter(option => option.value);

  const rows = [];

  if (selectOptions.length) {
    rows.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `animesearch:${messageId}:select`,
          placeholder: 'Elegí un anime de la lista...',
          min_values: 1,
          max_values: 1,
          options: selectOptions,
        },
      ],
    });
  }

  if (totalPages > 1) {
    rows.push({
      type: 1,
      components: [
        {
          type: 2,
          style: 2,
          custom_id: `animesearch:${messageId}:prev`,
          label: 'Anterior',
          emoji: { name: '⬅️' },
          disabled: page <= 1,
        },
        {
          type: 2,
          style: 2,
          custom_id: `animesearch:${messageId}:next`,
          label: 'Siguiente',
          emoji: { name: '➡️' },
          disabled: page >= totalPages,
        },
      ],
    });
  }

  return {
    flags: MessageFlags.IsComponentsV2,
    components: [
      {
        type: 17,
        accent_color: 0x5865F2,
        components: [
          {
            type: 10,
            content:
              `# 🔎 Resultados para "${query}"\n\n` +
              `${lines.length ? lines.join('\n') : 'Sin resultados en esta página.'}\n\n` +
              `### 📄 Página ${page} de ${totalPages}\n` +
              `Mostrando ${results.length} de ${totalResults} resultados.\n\n` +
              `Elegí un anime para ver el detalle.`,
          },
        ],
      },
      ...rows,
    ],
  };
}

function buildDetailBackButton(messageId) {
  return {
    type: 1,
    components: [
      {
        type: 2,
        style: 2,
        custom_id: `animesearch:${messageId}:back`,
        label: 'Volver a la lista',
        emoji: { name: '↩️' },
      },
    ],
  };
}

async function sendV2(
  message,
  payload
) {
  return message.channel.send(
    payload
  ).catch(() => null);
}

async function editOrSendV2(
  message,
  sentMessage,
  payload
) {
  if (sentMessage?.edit) {
    return sentMessage.edit(
      payload
    ).catch(() => null);
  }

  return sendV2(message, payload);
}

async function translateToSpanish(
  text
) {
  const raw = String(
    text || ''
  ).trim();

  if (!raw) {
    return 'Sin sinopsis.';
  }

  if (
    synopsisCache.has(raw)
  ) {
    return synopsisCache.get(
      raw
    );
  }

  let translator = null;

  try {
    translator = require(
      'google-translate-api-x'
    );
  } catch {}

  if (!translator) {
    return raw;
  }

  try {
    const res =
      await translator(raw, {
        to: 'es',
      });

    const translated =
      res?.text || raw;

    synopsisCache.set(
      raw,
      translated
    );

    return translated;
  } catch {
    return raw;
  }
}

function buildAnimeCard(
  media,
  translatedSynopsis,
  options = {}
) {
  const title =
    media.title?.romaji ||
    media.title?.english ||
    media.title?.native ||
    'Anime';

  const score =
    media.averageScore
      ? `${media.averageScore}%`
      : 'Desconocido';

  const popularity =
    media.popularity
      ? `${media.popularity.toLocaleString()}`
      : 'Desconocida';

  const genres =
    translateGenres(
      media.genres
    );

  const image =
    getBannerOrCover(
      media
    ) ||
    'https://i.imgur.com/txgh4hD.png';

  const synopsis = String(
    translatedSynopsis ||
      cleanHtml(
        media.description
      ) ||
      'Sin sinopsis.'
  )
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 1200);

  const info = [
    `📺 **Formato:** ${
      media.format ||
      'Desconocido'
    }`,

    `🎞️ **Episodios:** ${
      media.episodes ||
      'Desconocidos'
    }`,

    `📡 **Estado:** ${
      media.status ||
      'Desconocido'
    }`,

    `⭐ **Score:** ${score}`,

    `🔥 **Popularidad:** ${popularity}`,
  ].join('\n');

  const externalButtons =
    buildExternalButtonsForMedia(
      media
    );

  const components = [
    {
      type: 17,

      components: [
        {
          type: 12,

          items: [
            {
              media: {
                type: 1,
                url: image,
              },

              spoiler: false,
            },
          ],
        },

        {
          type: 14,
          divider: true,
          spacing: 1,
        },

        {
          type: 10,

          content:
            `# ⭐ ${title}\n\n` +
            `> ${synopsis.replace(
              /\n+/g,
              '\n> '
            )}\n\n` +
            `### 📺 Información\n${info}\n\n` +
            `### 🎭 Géneros\n${genres}`,
        },

        {
          type: 14,
          divider: true,
          spacing: 1,
        },

        {
          type: 1,

          components:
            externalButtons.length
              ? externalButtons.map(
                  btn => ({
                    type: 2,
                    style: 5,

                    label:
                      btn.label,

                    emoji: {
                      name:
                        btn.emoji,
                    },

                    url:
                      btn.url,
                  })
                )
              : [
                  {
                    type: 2,
                    style: 2,
                    label:
                      'No disponible',

                    disabled: true,
                  },
                ],
        },
      ],
    },
  ];

  if (options.backButton) {
    components.push(
      buildDetailBackButton(
        options.messageId
      )
    );
  }

  return {
    flags:
      MessageFlags
        .IsComponentsV2,

    components,
  };
}

module.exports = {
  name: 'animesearch',

  aliases: [
    'anime',
    'ani',
    'anisearch',
    'buscaranime',
  ],

  help: {
    purpose:
      'Busca anime usando AniList con interfaz V2.',

    category:
      '🎮 Anime',

    usage:
      '-animesearch <nombre>',
  },

  async execute(
    message,
    args
  ) {
    const query = args
      .join(' ')
      .trim();

    if (!query) {
      return sendV2(message, {
        flags:
          MessageFlags
            .IsComponentsV2,

        components:
          buildV2StatusCard(
            '❌ Debes escribir un anime',
            'Ejemplo: -animesearch death note',
            0xed4245
          ),
      });
    }

    const loading =
      await sendV2(message, {
        flags:
          MessageFlags
            .IsComponentsV2,

        components:
          buildV2StatusCard(
            '🔍 Buscando anime en AniList...',
            'Un momento, estoy consultando la base de datos.',
            0xfee75c
          ),
      });

    if (!loading) {
      return null;
    }

    const state = {
      page: 1,
      totalPages: 1,
      totalResults: 0,
      results: [],
      selected: null,
    };

    const renderList = async () => {
      const payload = buildSearchListCard({
        query,
        results: state.results,
        page: state.page,
        totalPages: state.totalPages,
        totalResults: state.totalResults,
        messageId: message.id,
      });

      await editOrSendV2(message, loading, payload);
    };

    const loadPage = async (page) => {
      const { results, pageInfo } = await searchAniListPage(
        query,
        page,
        SEARCH_PAGE_SIZE
      );

      state.page = pageInfo?.currentPage || page;
      state.totalPages = pageInfo?.lastPage || 1;
      state.totalResults = pageInfo?.total || results.length || 0;
      state.results = Array.isArray(results) ? results : [];
      state.selected = null;
    };

    try {
      await loadPage(1);

      if (!state.results.length) {
        return editOrSendV2(
          message,
          loading,
          {
            flags:
              MessageFlags
                .IsComponentsV2,

            components:
              buildV2StatusCard(
                '❌ No encontré resultados',
                'Probá con otro nombre o una escritura distinta.',
                0xed4245
              ),
          }
        );
      }

        await renderList();

        const collector = loading.createMessageComponentCollector({
          time: SEARCH_COLLECTOR_MS,
          filter: interaction => interaction.user.id === message.author.id,
        });

        collector.on('collect', async (interaction) => {
          try {
            if (interaction.isButton()) {
              if (interaction.customId === `animesearch:${message.id}:prev`) {
                if (state.page <= 1) {
                  return interaction.reply({ content: '❌ Ya estás en la primera página.', ephemeral: true }).catch(() => null);
                }

                await interaction.deferUpdate().catch(() => null);
                await loadPage(Math.max(1, state.page - 1));
                await renderList();
                return;
              }

              if (interaction.customId === `animesearch:${message.id}:next`) {
                if (state.page >= state.totalPages) {
                  return interaction.reply({ content: '❌ No hay más páginas disponibles.', ephemeral: true }).catch(() => null);
                }

                await interaction.deferUpdate().catch(() => null);
                await loadPage(Math.min(state.totalPages, state.page + 1));
                await renderList();
                return;
              }

              if (interaction.customId === `animesearch:${message.id}:back`) {
                await interaction.deferUpdate().catch(() => null);
                await renderList();
                return;
              }
            }

            if (interaction.isStringSelectMenu()) {
              if (interaction.customId !== `animesearch:${message.id}:select`) return;

              const selectedId = String(interaction.values?.[0] || '').trim();
              const matched = state.results.find(anime => String(anime?.id || '') === selectedId);

              if (!selectedId || !matched) {
                return interaction.reply({ content: '❌ Selección inválida.', ephemeral: true }).catch(() => null);
              }

              state.selected = matched;

              await interaction.deferUpdate().catch(() => null);

              const full = await fetchAniListFullById(matched.id).catch(() => matched);

              const translated = await translateToSpanish(
                cleanHtml(full.description)
              );

              const payload = buildAnimeCard(full, translated, {
                backButton: true,
                messageId: message.id,
              });

              await editOrSendV2(message, loading, payload);
            }
          } catch (error) {
            console.error('[animesearch][collector]', error);
            await interaction.reply({ content: '❌ Ocurrió un error actualizando la búsqueda.', ephemeral: true }).catch(() => null);
          }
        });

        collector.on('end', async () => {
          await loading.edit({ components: [] }).catch(() => null);
        });

        return;
    } catch (e) {
      console.error(
        '[animesearch]',
        e
      );

      return editOrSendV2(
        message,
        loading,
        {
          flags:
            MessageFlags
              .IsComponentsV2,

          components:
            buildV2StatusCard(
              '❌ Error buscando el anime',
              'Intentalo de nuevo en unos segundos.',
              0xed4245
            ),
        }
      );
    }
  },
};
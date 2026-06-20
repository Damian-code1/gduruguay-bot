const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require('discord.js');
const { registerLevelSearchSession } = require('../utils/levelSearchSessions');

const PAGE_SIZE = 6;
const NUMBER_FMT = new Intl.NumberFormat('es-ES');
const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;
const AREDL_API = 'https://api.aredl.net/v2';
const AREDL_CACHE_TTL_MS = 10 * 60 * 1000;

const aredlCache = {
  fetchedAt: 0,
  levels: [],
};

// Replace these strings with your server's custom emoji codes if you want
// e.g. downloads: '<:gd_download:1234567890>'
const EMOJI = {
  downloads: '<:download:1503144036872224931>',
  likes: '<:like:1503144065175257259>',
  length: '<:time:1503144138558804139>',
  stars: '<:starpoint:1503144120657383524>',
  coins: '<:silvercoin:1503144102990971162>',
  song: '🎵',
  author: '<:creatorpoints:1503145472574095603>',
  difficulty: '<:orbs:1503144087203610706>',
};

async function doFetch(url, options) {
  if (typeof fetch === 'function') return fetch(url, options);
  try {
    const undici = require('undici');
    if (undici && typeof undici.fetch === 'function') return undici.fetch(url, options);
  } catch (e) {}

  try {
    // node-fetch v2 (CJS) or v3 (default export)
    const nodeFetch = require('node-fetch');
    if (typeof nodeFetch === 'function') return nodeFetch(url, options);
    if (nodeFetch && typeof nodeFetch.default === 'function') return nodeFetch.default(url, options);
  } catch (e) {}

  throw new Error('No fetch implementation available (global fetch, undici or node-fetch)');
}

const LENGTH_MAP = {
  0: 'Tiny',
  1: 'Short',
  2: 'Medium',
  3: 'Largo',
  4: 'XL',
  5: 'Platformer',
};

const DIFFICULTY_MAP = {
  Auto: 'auto',
  Easy: 'easy',
  Normal: 'normal',
  Hard: 'hard',
  Harder: 'harder',
  Insane: 'insane',
  'Easy Demon': 'easydemon',
  'Medium Demon': 'mediumdemon',
  'Hard Demon': 'harddemon',
  'Insane Demon': 'insanedemon',
  'Extreme Demon': 'extremedemon',
  'N/A': 'na',
};

function formatNumber(value) {
  return NUMBER_FMT.format(Number(value || 0));
}

function pill(value) {
  return `\`${value}\``;
}

function truncate(text, max = 70) {
  const value = String(text || '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function normalizeName(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function normalizeResults(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.results)) return payload.results;
  if (payload && Array.isArray(payload.levels)) return payload.levels;
  if (payload && Array.isArray(payload.value)) return payload.value;
  if (payload && Array.isArray(payload.data)) return payload.data;
  return [];
}

function extractPageMeta(payload, results, currentPage = 0) {
  const first = Array.isArray(payload) ? payload[0] : payload;
  const totalPagesRaw = first?.pages ?? payload?.pages ?? payload?.pageCount ?? payload?.totalPages;
  const totalResultsRaw = first?.results ?? payload?.results ?? payload?.totalResults ?? payload?.count ?? payload?.Count;

  const resultsCount = Array.isArray(results) ? results.length : 0;
  const totalPages = Number(totalPagesRaw);
  const totalResults = Number(totalResultsRaw);

  return {
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : (resultsCount < PAGE_SIZE ? currentPage + 1 : currentPage + 2),
    totalResults: Number.isFinite(totalResults) && totalResults >= 0 ? totalResults : null,
  };
}

function getLevelId(level) {
  return level?.id ?? level?.levelID ?? level?.levelId ?? level?.levelid ?? '';
}

function getLevelName(level) {
  return level?.name ?? level?.levelName ?? level?.levelname ?? 'Nivel sin nombre';
}

function getLevelAuthor(level) {
  return level?.author ?? level?.creator ?? level?.username ?? level?.authorName ?? 'Desconocido';
}

function getDifficultyLabel(level) {
  return level?.difficulty ?? level?.difficultyText ?? level?.difficultyType ?? 'N/A';
}

function getDifficultyFaceKey(level) {
  const face = level?.difficultyFace;
  if (typeof face === 'string' && face.trim()) {
    if (/^https?:\/\//i.test(face)) return face.trim();
    return face.trim().toLowerCase();
  }

  const difficulty = getDifficultyLabel(level);
  return DIFFICULTY_MAP[difficulty] || DIFFICULTY_MAP[String(difficulty)] || 'na';
}

function getDifficultyThumbnail(level) {
  const faceKey = getDifficultyFaceKey(level);
  const baseUrl = /^https?:\/\//i.test(faceKey)
    ? faceKey
    : `https://gdbrowser.com/assets/difficulties/${faceKey}.png`;

  // Use a resize proxy so the face renders smaller inside Discord's fixed thumbnail box.
  // This keeps the same style, but with more transparent padding / smaller visual size.
  return `https://images.weserv.nl/?url=${encodeURIComponent(baseUrl)}&w=64&h=64&fit=contain&output=png`;
}

function getLength(level) {
  const length = level?.length ?? level?.lengthID ?? level?.levelLength;
  return LENGTH_MAP[length] ?? length ?? 'N/A';
}

function getCoinsText(level) {
  const coins = Number(level?.coins ?? level?.coinCount ?? level?.verifiedCoins ?? 0);
  const verifiedRaw = level?.coinsVerified ?? level?.coinsverified ?? level?.verifiedCoins;
  const verified = Boolean(verifiedRaw === true || Number(verifiedRaw) === 1);
  if (coins === 3 && verified) return '🥉 🥈 🥇';
  if (coins > 0) return `${coins} moneda(s)`;
  return 'Sin monedas';
}

function getSongLine(level) {
  const songName = level?.songName ?? level?.songname ?? level?.song ?? level?.songTitle ?? '';
  const songAuthor = level?.songAuthor ?? level?.songauthor ?? level?.songArtist ?? level?.songAuthorName ?? '';
  const officialSong = Number(level?.officialSong ?? 0);

  const normalizedSongName = String(songName || '').trim();
  const normalizedSongAuthor = String(songAuthor || '').trim();

  const songNameHasAuthor = Boolean(
    normalizedSongName &&
    normalizedSongAuthor &&
    normalizedSongName.toLowerCase().includes(normalizedSongAuthor.toLowerCase())
  );

  const authorHasSongName = Boolean(
    normalizedSongName &&
    normalizedSongAuthor &&
    normalizedSongAuthor.toLowerCase().includes(normalizedSongName.toLowerCase())
  );

  if (normalizedSongName && normalizedSongAuthor) {
    if (songNameHasAuthor || authorHasSongName || normalizedSongName === normalizedSongAuthor) {
      return `__${normalizedSongName}__`;
    }

    return `__${normalizedSongName}__ - ${normalizedSongAuthor}`;
  }

  if (normalizedSongName) return `__${normalizedSongName}__`;

  const songId = Number(level?.songId ?? level?.songID ?? level?.customSongID ?? level?.customSong ?? 0);
  if (songId > 0) return `__Canción personalizada (ID ${songId})__`;
  if (officialSong > 0) return '__Canción oficial de Geometry Dash__';
  return '';
}

function buildDifficultyBlock(level) {
  return `🎯 ${getDifficultyLabel(level)}`;
}

function isExtremeDemon(level) {
  return String(getDifficultyLabel(level)).trim().toLowerCase() === 'extreme demon';
}

function getAredlPosition(level) {
  const rawPosition = level?.__aredlPosition ?? level?.aredlPosition ?? level?.position ?? null;
  const position = Number(rawPosition);
  return Number.isFinite(position) && position > 0 ? position : null;
}

function getAredlPositionLine(level) {
  const position = getAredlPosition(level);
  if (!position) return null;
  return `📍 AREDL posición: #${position}`;
}

async function fetchAredlLevels() {
  const now = Date.now();
  if (aredlCache.levels.length && now - aredlCache.fetchedAt < AREDL_CACHE_TTL_MS) {
    return aredlCache.levels;
  }

  const response = await doFetch(`${AREDL_API}/api/aredl/levels`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar niveles de AREDL (${response.status})`);
  }

  const data = await response.json();
  const levels = Array.isArray(data) ? data : data?.data || [];

  aredlCache.fetchedAt = now;
  aredlCache.levels = levels;
  return levels;
}

async function attachAredlPositions(levels) {
  if (!Array.isArray(levels) || !levels.length) return levels;

  let aredlLevels = [];
  try {
    aredlLevels = await fetchAredlLevels();
  } catch (error) {
    console.warn('[levelsearch] AREDL cache error', error);
    return levels;
  }

  if (!aredlLevels.length) return levels;

  return levels.map((level) => {
    if (!isExtremeDemon(level)) return level;

    const levelId = Number(getLevelId(level));
    const levelName = normalizeName(getLevelName(level));
    const match = aredlLevels.find((entry) => Number(entry?.level_id) === levelId)
      || aredlLevels.find((entry) => normalizeName(entry?.name) === levelName)
      || aredlLevels.find((entry) => normalizeName(entry?.name).includes(levelName) || levelName.includes(normalizeName(entry?.name)));

    if (!match) return level;

    return {
      ...level,
      __aredlPosition: Number(match.position),
    };
  });
}

function buildLevelStats(level) {
  return [
    `${EMOJI.downloads} ${pill(formatNumber(level?.downloads ?? level?.downloadCount ?? 0))}`,
    `${EMOJI.likes} ${pill(formatNumber(level?.likes ?? level?.likeCount ?? 0))}`,
    `${EMOJI.length} ${pill(getLength(level))}`,
    `${EMOJI.stars} ${pill(`${level?.stars ?? level?.starCount ?? 0}`)}`,
    `${EMOJI.coins} ${getCoinsText(level)}`,
  ].join(' · ');
}

function buildLevelStatsLines(level) {
  const lines = [
    `${EMOJI.downloads} ${pill(formatNumber(level?.downloads ?? level?.downloadCount ?? 0))}`,
    `${EMOJI.likes} ${pill(formatNumber(level?.likes ?? level?.likeCount ?? 0))}`,
    `${EMOJI.length} ${pill(getLength(level))}`,
    `${EMOJI.stars} ${pill(`${level?.stars ?? level?.starCount ?? 0}`)}`,
    `${EMOJI.coins} ${getCoinsText(level)}`,
  ];

  return lines;
}

function buildLevelCardText(level, index) {
  const title = `▶️ **${getLevelName(level)}** by ${getLevelAuthor(level)}`;
  const positionLine = getAredlPositionLine(level);
  const downloads = `${EMOJI.downloads} ${pill(formatNumber(level?.downloads ?? level?.downloadCount ?? 0))}`;
  const likes = `${EMOJI.likes} ${pill(formatNumber(level?.likes ?? level?.likeCount ?? 0))}`;
  const length = `${EMOJI.length} ${pill(getLength(level))}`;
  const song = getSongLine(level);

  return [
    title,
    positionLine,
    downloads,
    likes,
    length,
    song ? `${EMOJI.song} ${song}` : null,
  ].filter(Boolean).join('\n');
}

function buildListComponents(session) {
  const pageLevels = session.currentPageResults.slice(0, PAGE_SIZE);

  const firstBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:first`)
    .setLabel('<< Primera')
    .setEmoji('⏮️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.currentPage <= 0);

  const prevBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:prev`)
    .setLabel('<< Anterior')
    .setEmoji('⬅️')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(session.currentPage <= 0);

  const nextBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:next`)
    .setLabel('Siguiente >>')
    .setEmoji('➡️')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(session.currentPage >= session.totalPages - 1);

  const lastBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:last`)
    .setLabel('Última >>')
    .setEmoji('⏭️')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(session.currentPage >= session.totalPages - 1);

  const closeBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:close`)
    .setLabel('Cerrar')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger);

  const buttonsRow = new ActionRowBuilder().addComponents(firstBtn, prevBtn, nextBtn, lastBtn, closeBtn);

  const select = new StringSelectMenuBuilder()
    .setCustomId(`lvlsearch:${session.id}:select`)
    .setPlaceholder('Elegí un nivel de esta página')
    .addOptions(
      pageLevels.map((level, idx) => ({
        label: `${idx + 1}. ${truncate(getLevelName(level), 70)}`,
        description: `Autor: ${truncate(getLevelAuthor(level), 80)} · ID: ${getLevelId(level)}`,
        value: String(getLevelId(level)),
      }))
    );

  const selectRow = new ActionRowBuilder().addComponents(select);
  return [buttonsRow, selectRow];
}

function buildDetailComponents(session) {
  const backBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:back`)
    .setLabel('Volver a la lista')
    .setEmoji('↩️')
    .setStyle(ButtonStyle.Secondary);

  const copyIdBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:copyid`)
    .setLabel('Copiar ID')
    .setEmoji('🆔')
    .setStyle(ButtonStyle.Primary);

  const closeBtn = new ButtonBuilder()
    .setCustomId(`lvlsearch:${session.id}:close`)
    .setLabel('Cerrar')
    .setEmoji('❌')
    .setStyle(ButtonStyle.Danger);

  return [
    new ActionRowBuilder().addComponents(
      backBtn,
      copyIdBtn,
      closeBtn
    )
  ];
}

function buildHeaderCard(session) {
  return {
    type: 17,
    accent_color: 0x5865F2,
    components: [
      {
        type: 10,
        content:
          `# 🔎 Resultados de búsqueda para "${truncate(session.query, 40)}"\n\nPágina ${session.currentPage + 1}`,
      },
    ],
  };
}

function buildLevelListCards(session) {
  // Deprecated: kept for compatibility but newer UI uses a single container.
  const pageLevels = session.currentPageResults.slice(0, PAGE_SIZE);

  return pageLevels.map((level, idx) => ({
    type: 9,
    components: [
      {
        type: 10,
        content: buildLevelCardText(level, idx),
      },
    ],
    accessory: {
      type: 11,
      media: { type: 1, url: getDifficultyThumbnail(level) },
      spoiler: false,
    },
  }));
}

function buildCompactListContainer(session) {
  const pageLevels = session.currentPageResults.slice(0, PAGE_SIZE);

  const components = [];

  // Header
  components.push({ type: 10, content: `# 🔎 Resultados de búsqueda para "${truncate(session.query, 40)}"\n\nPágina ${session.currentPage + 1}` });

  // Divider
  components.push({ type: 14 });

  // Levels
  pageLevels.forEach((level, idx) => {
    components.push({
      type: 9,
      components: [
        { type: 10, content: buildLevelCardText(level, idx) },
      ],
      accessory: { type: 11, media: { type: 1, url: getDifficultyThumbnail(level) }, spoiler: false },
    });

    // add divider between items
    components.push({ type: 14 });
  });

  return {
    type: 17,
    accent_color: null,
    components,
  };
}

function buildDetailCard(session, level) {
  // Compact detail: header section with difficulty face accessory,
  // then a single stats block and minimal extra lines.
  const positionLine = getAredlPositionLine(level);
  return {
    type: 17,
    accent_color: null,
    components: [
      {
        type: 9,
        components: [
          {
            type: 10,
            content:
              `# ${getLevelName(level)}\n` +
              `${EMOJI.author} ${getLevelAuthor(level)}\n` +
              `**${buildDifficultyBlock(level)}**` +
              (positionLine ? `\n${positionLine}` : ''),
          },
        ],
        accessory: { type: 11, media: { type: 1, url: getDifficultyThumbnail(level) }, spoiler: false },
      },
      { type: 14 },
      // Stats as vertical list
      ...buildLevelStatsLines(level).map((line) => ({ type: 10, content: line })),
      // Song line
      { type: 10, content: `${EMOJI.song} ${getSongLine(level) || 'Sin información'}` },
      // ID + context
      { type: 10, content: `🆔 ${getLevelId(level)} • Página ${session.currentPage + 1}` },
    ],
  };
}

function buildListPayload(session) {
  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      buildCompactListContainer(session),
      ...buildListComponents(session),
    ],
  };
}

async function resolveFullLevel(level, fetchLevelById) {
  const hasSongInfo = Boolean(level?.songName || level?.song || level?.songId || level?.songID || level?.customSongID || level?.customSong);
  const hasDifficultyInfo = Boolean(level?.difficulty || level?.difficultyFace);

  if (hasSongInfo && hasDifficultyInfo) return level;

  const id = getLevelId(level);
  if (!id || !fetchLevelById) return level;

  try {
    const full = await fetchLevelById(id);
    if (full && !full.error) return { ...level, ...full };
  } catch (error) {
    console.error('[levelsearch] resolveFullLevel', error);
  }

  return level;
}

function findSelectedLevel(session, selectedValue) {
  const pageLevels = Array.isArray(session.currentPageResults) ? session.currentPageResults : [];
  const rawValue = String(selectedValue || '').trim();
  if (!rawValue) return null;

  const byId = pageLevels.find((level) => String(getLevelId(level)) === rawValue);
  if (byId) return byId;

  const byIndex = Number(rawValue);
  if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < pageLevels.length) {
    return pageLevels[byIndex];
  }

  return null;
}

async function buildDetailPayload(session, fetchLevelById) {
  const rawLevel = session.selectedLevel || findSelectedLevel(session, session.selectedLevelId);
  const level = await resolveFullLevel(rawLevel, fetchLevelById);

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      buildDetailCard(session, level),
      ...buildDetailComponents(session),
    ],
  };
}

function buildClosedPayload(session) {
  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: null,
        components: [
          {
            type: 10,
            content:
              `# 🔎 Búsqueda cerrada\n\n` +
              `La búsqueda de "${truncate(session.query, 40)}" fue cerrada.`,
          },
        ],
      },
    ],
  };
}

function parseSearchQuery(args) {
  return args.join(' ').trim();
}

async function fetchSearchPage(query, page) {
  const numericId = /^\d+$/.test(query);

  if (numericId) {
    const res = await doFetch(`https://gdbrowser.com/api/level/${query}`);
    if (!res.ok) return { results: [], totalPages: 1, totalResults: 0 };
    const level = await res.json();
    if (!level || level.error) return { results: [], totalPages: 1, totalResults: 0 };
    return { results: [level], totalPages: 1, totalResults: 1 };
  }

  const res = await doFetch(`https://gdbrowser.com/api/search/${encodeURIComponent(query)}?page=${page}`);
  if (!res.ok) return { results: [], totalPages: 0, totalResults: 0 };

  const data = await res.json();
  const results = normalizeResults(data);
  const meta = extractPageMeta(data, results, page);
  return {
    results,
    totalPages: meta.totalPages,
    totalResults: meta.totalResults,
  };
}

async function fetchLevelById(id) {
  const res = await doFetch(`https://gdbrowser.com/api/level/${id}`);
  if (!res.ok) return null;
  const level = await res.json();
  if (!level || level.error) return null;
  return level;
}

module.exports = {
  name: 'levelsearch',
  aliases: ['level', 'lvl', 'gd'],
  async execute(message, args) {
    const query = parseSearchQuery(args);

    if (!query) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📖 Uso: -levelsearch')
          .setDescription('Busca niveles por nombre o ID y muestra resultados paginados con vista detallada.')
          .addFields(
            { name: 'Uso', value: '`-levelsearch <nombre o id>`' },
            { name: 'Ejemplo', value: '`-levelsearch Bloodbath`' },
            { name: 'Aliases', value: '`-gd`, `-level`, `-lvl`' },
          )
          .setColor(0x2C2F33)
        ]
      });
    }

    const loadingMsg = await message.reply('🔍 Buscando niveles...');

    try {
      const initial = await fetchSearchPage(query, 0);

      if (!Array.isArray(initial.results) || initial.results.length === 0) {
        await loadingMsg.edit('❌ No se encontraron niveles con ese nombre');
        return;
      }

      initial.results = await attachAredlPositions(initial.results);

      const sessionId = `${message.id}-${Date.now()}`;

      const session = {
        id: sessionId,
        authorId: message.author.id,
        query,
        currentPage: 0,
        currentPageResults: initial.results,
        totalPages: initial.totalPages || 1,
        totalResults: initial.totalResults,
        pageSize: PAGE_SIZE,
        pageCache: new Map([[0, initial]]),
        mode: 'list',
        selectedIndex: 0,
        selectedLevelId: null,
        selectedLevel: null,
        loadPage: async (pageNumber) => {
          const page = Math.max(0, Number(pageNumber) || 0);
          let data = session.pageCache.get(page);
          if (!data) {
            data = await fetchSearchPage(query, page);
            session.pageCache.set(page, data);
          }

          session.currentPage = page;
          session.currentPageResults = await attachAredlPositions(Array.isArray(data.results) ? data.results : []);
          session.totalPages = Math.max(1, Number(data.totalPages || session.totalPages || 1));
          session.totalResults = data.totalResults ?? session.totalResults ?? null;
          session.selectedIndex = 0;
          session.selectedLevelId = null;
          session.selectedLevel = null;

          // Prefetch next page in the background so next/prev feels instant.
          const nextPage = page + 1;
          if (nextPage < session.totalPages && !session.pageCache.has(nextPage)) {
            fetchSearchPage(query, nextPage)
              .then((nextData) => session.pageCache.set(nextPage, nextData))
              .catch(() => null);
          }

          return data;
        },
        renderList: async () => buildListPayload(session),
        renderDetail: async (selectedLevel) => {
          if (selectedLevel) {
            session.selectedLevel = selectedLevel;
            session.selectedLevelId = getLevelId(selectedLevel);
            session.selectedIndex = Array.isArray(session.currentPageResults)
              ? session.currentPageResults.findIndex((level) => String(getLevelId(level)) === String(getLevelId(selectedLevel)))
              : 0;
          }

          return buildDetailPayload(session, fetchLevelById);
        },
        renderClosed: async () => buildClosedPayload(session),
      };

      registerLevelSearchSession(session);

      const payload = await session.renderList();
      await message.channel.send(payload);
    } catch (err) {
      console.error('[levelsearch]', err && err.stack ? err.stack : err);
      const errMsg = `❌ Error al conectarse a GDBrowser: ${truncate(err?.message || String(err), 200)}`;
      try {
        await loadingMsg.edit(errMsg);
      } catch (editErr) {
        console.error('[levelsearch] failed to edit loading message', editErr);
        try {
          await message.channel.send(errMsg);
        } catch (sendErr) {
          console.error('[levelsearch] failed to send fallback error message', sendErr);
        }
      }
    }
  }
};
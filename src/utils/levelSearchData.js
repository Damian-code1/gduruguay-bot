'use strict';

const GDBROWSER_API = 'https://gdbrowser.com/api';
const AREDL_API = 'https://api.aredl.net/v2';
const AREDL_CACHE_TTL_MS = 10 * 60 * 1000;
const PAGE_SIZE = 6;

const NUMBER_FMT = new Intl.NumberFormat('es-ES');

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

// Emojis custom del servidor de GD Uruguay (el bot tiene permisos de admin ahí).
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

const aredlCache = { fetchedAt: 0, levels: [] };

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

  // Proxy de resize para que la cara se vea más chica dentro del thumbnail de Discord.
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
    normalizedSongName && normalizedSongAuthor && normalizedSongName.toLowerCase().includes(normalizedSongAuthor.toLowerCase()),
  );
  const authorHasSongName = Boolean(
    normalizedSongName && normalizedSongAuthor && normalizedSongAuthor.toLowerCase().includes(normalizedSongName.toLowerCase()),
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

  const response = await fetch(`${AREDL_API}/api/aredl/levels`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`No se pudo consultar niveles de AREDL (${response.status})`);

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
    console.warn('[levelsearch] AREDL cache error:', error.message);
    return levels;
  }

  if (!aredlLevels.length) return levels;

  return levels.map((level) => {
    if (!isExtremeDemon(level)) return level;

    const levelId = Number(getLevelId(level));
    const levelName = normalizeName(getLevelName(level));
    const match =
      aredlLevels.find((entry) => Number(entry?.level_id) === levelId) ||
      aredlLevels.find((entry) => normalizeName(entry?.name) === levelName) ||
      aredlLevels.find(
        (entry) => normalizeName(entry?.name).includes(levelName) || levelName.includes(normalizeName(entry?.name)),
      );

    if (!match) return level;
    return { ...level, __aredlPosition: Number(match.position) };
  });
}

async function fetchSearchPage(query, page) {
  const numericId = /^\d+$/.test(query);

  if (numericId) {
    const res = await fetch(`${GDBROWSER_API}/level/${query}`);
    if (!res.ok) return { results: [], totalPages: 1, totalResults: 0 };
    const level = await res.json();
    if (!level || level.error) return { results: [], totalPages: 1, totalResults: 0 };
    return { results: [level], totalPages: 1, totalResults: 1 };
  }

  const res = await fetch(`${GDBROWSER_API}/search/${encodeURIComponent(query)}?page=${page}`);
  if (!res.ok) return { results: [], totalPages: 0, totalResults: 0 };

  const data = await res.json();
  const results = normalizeResults(data);
  const meta = extractPageMeta(data, results, page);
  return { results, totalPages: meta.totalPages, totalResults: meta.totalResults };
}

async function fetchLevelById(id) {
  const res = await fetch(`${GDBROWSER_API}/level/${id}`);
  if (!res.ok) return null;
  const level = await res.json();
  if (!level || level.error) return null;
  return level;
}

async function resolveFullLevel(level, fetchById = fetchLevelById) {
  const hasSongInfo = Boolean(level?.songName || level?.song || level?.songId || level?.songID || level?.customSongID || level?.customSong);
  const hasDifficultyInfo = Boolean(level?.difficulty || level?.difficultyFace);
  if (hasSongInfo && hasDifficultyInfo) return level;

  const id = getLevelId(level);
  if (!id) return level;

  try {
    const full = await fetchById(id);
    if (full && !full.error) return { ...level, ...full };
  } catch (error) {
    console.error('[levelsearch] resolveFullLevel:', error);
  }

  return level;
}

module.exports = {
  PAGE_SIZE,
  EMOJI,
  formatNumber,
  pill,
  truncate,
  getLevelId,
  getLevelName,
  getLevelAuthor,
  getDifficultyLabel,
  getDifficultyThumbnail,
  getLength,
  getCoinsText,
  getSongLine,
  getAredlPositionLine,
  attachAredlPositions,
  fetchSearchPage,
  fetchLevelById,
  resolveFullLevel,
};

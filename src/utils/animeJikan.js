const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } = require('discord.js');

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const SEPARATOR = '⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯';
const EMBED_COLOR = 0x23272A;

const GENRE_EMOJIS = {
  action: '⚔️',
  adventure: '🧭',
  comedy: '😂',
  drama: '🎭',
  ecchi: '😳',
  fantasy: '🪄',
  horror: '👻',
  mystery: '🕵️',
  romance: '💖',
  sci: '🚀',
  slice: '🍵',
  sports: '🏅',
  supernatural: '✨',
  thriller: '🔪',
  psychological: '🧠',
  music: '🎵',
  school: '🏫',
  shounen: '🔥',
  shonen: '🔥',
  seinen: '🧨',
  josei: '🌹',
  shoujo: '🌸',
  shojo: '🌸',
  mecha: '🤖',
  military: '🪖',
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max = 360) {
  const value = String(text || '').trim();
  if (!value) return 'Sin sinopsis disponible.';
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trim()}…`;
}

function levenshteinDistance(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);

  const matrix = Array.from({ length: aa.length + 1 }, () => new Array(bb.length + 1).fill(0));

  for (let i = 0; i <= aa.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bb.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= aa.length; i += 1) {
    for (let j = 1; j <= bb.length; j += 1) {
      const cost = aa[i - 1] === bb[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aa.length][bb.length];
}

function similarity(a, b) {
  const aa = normalizeText(a);
  const bb = normalizeText(b);
  if (!aa || !bb) return 0;
  const maxLen = Math.max(aa.length, bb.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(aa, bb);
  let score = 1 - (distance / maxLen);

  if (aa === bb) score += 0.2;
  if (bb.includes(aa) || aa.includes(bb)) score += 0.12;
  if (bb.startsWith(aa)) score += 0.08;

  return Math.max(0, Math.min(score, 1));
}

function getTitleCandidates(anime) {
  const titles = [anime?.title, anime?.title_english, anime?.title_japanese];

  if (Array.isArray(anime?.titles)) {
    for (const item of anime.titles) {
      if (item?.title) titles.push(item.title);
    }
  }

  if (Array.isArray(anime?.title_synonyms)) {
    titles.push(...anime.title_synonyms);
  }

  return [...new Set(titles.filter(Boolean))];
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Jikan respondió ${response.status}`);
  }

  return response.json();
}

async function fetchAnimeByQuery(query, limit = 12, type = null) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
    sfw: 'true',
  });

  if (type) params.set('type', type);

  const payload = await fetchJson(`${JIKAN_BASE}/anime?${params.toString()}`);
  return Array.isArray(payload?.data) ? payload.data : [];
}

async function fetchAnimeSearchPage(query, page = 1, limit = 10) {
  const params = new URLSearchParams({
    q: query,
    page: String(page),
    limit: String(limit),
    sfw: 'true',
  });

  const payload = await fetchJson(`${JIKAN_BASE}/anime?${params.toString()}`);
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || {},
  };
}

async function searchAnimeFlexible(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const firstBatch = await fetchAnimeByQuery(raw, 12);
  let candidates = firstBatch;

  if (candidates.length === 0) {
    const simplified = normalizeText(raw).split(' ').slice(0, 3).join(' ');
    if (simplified) {
      candidates = await fetchAnimeByQuery(simplified, 12);
    }
  }

  if (candidates.length === 0) return null;

  const scored = candidates
    .map((anime) => {
      const names = getTitleCandidates(anime);
      const bestTitleScore = names.reduce((best, title) => Math.max(best, similarity(raw, title)), 0);
      const scoreBonus = Number(anime?.score || 0) / 100;
      const popularityBonus = anime?.popularity ? 1 / Math.max(1, Number(anime.popularity)) : 0;
      const finalScore = bestTitleScore + scoreBonus + popularityBonus;
      return { anime, rank: finalScore };
    })
    .sort((a, b) => b.rank - a.rank);

  return scored[0]?.anime || null;
}

async function fetchAnimeFullById(malId) {
  const payload = await fetchJson(`${JIKAN_BASE}/anime/${malId}/full`);
  return payload?.data || null;
}

async function fetchAnimeGenres() {
  const payload = await fetchJson(`${JIKAN_BASE}/genres/anime`);
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data
    .filter((genre) => genre?.name && Number.isInteger(genre?.mal_id))
    .map((genre) => ({
      id: genre.mal_id,
      name: genre.name,
      normalized: normalizeText(genre.name),
      count: genre.count || 0,
    }));
}

function resolveGenre(input, genres) {
  const raw = normalizeText(input);
  if (!raw) return null;

  const exact = genres.find((g) => g.normalized === raw);
  if (exact) return exact;

  const aliasMatch = genres.find((g) => {
    const gName = g.normalized;
    return gName.includes(raw) || raw.includes(gName);
  });
  if (aliasMatch) return aliasMatch;

  const scored = genres
    .map((g) => ({ genre: g, score: similarity(raw, g.name) }))
    .sort((a, b) => b.score - a.score);

  if ((scored[0]?.score || 0) < 0.45) return null;
  return scored[0].genre;
}

async function fetchTopAnimeByGenre(genreId, limit = 10) {
  const params = new URLSearchParams({
    genres: String(genreId),
    order_by: 'score',
    sort: 'desc',
    type: 'tv',
    sfw: 'true',
    limit: String(limit),
  });

  const payload = await fetchJson(`${JIKAN_BASE}/anime?${params.toString()}`);
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return data
    .filter((anime) => anime && anime.mal_id)
    .slice(0, limit);
}

async function fetchAnimeTopPageByGenre(genreId, page = 1, limit = 10) {
  const params = new URLSearchParams({
    genres: String(genreId),
    order_by: 'score',
    sort: 'desc',
    type: 'tv',
    sfw: 'true',
    page: String(page),
    limit: String(limit),
  });

  const payload = await fetchJson(`${JIKAN_BASE}/anime?${params.toString()}`);
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    pagination: payload?.pagination || {},
  };
}

function getGenreWithEmoji(name) {
  const normalized = normalizeText(name);
  const key = Object.keys(GENRE_EMOJIS).find((token) => normalized.includes(token));
  const emoji = key ? GENRE_EMOJIS[key] : '🏷️';
  return `${emoji} ${name}`;
}

function formatGenres(genres) {
  if (!Array.isArray(genres) || genres.length === 0) return '🏷️ Sin géneros';
  return genres.slice(0, 8).map((g) => getGenreWithEmoji(g.name)).join(' • ');
}

function getEpisodesStatus(anime) {
  const episodes = Number(anime?.episodes || 0);
  const episodesText = episodes > 0 ? episodes : '¿?';
  const statusRaw = String(anime?.status || '').toLowerCase();

  if (statusRaw.includes('currently')) {
    return `En emisión ( ${episodesText} Eps. )`;
  }

  if (statusRaw.includes('finished')) {
    return `Finalizado ( ${episodesText} Eps. )`;
  }

  return `${anime?.status || 'Desconocido'} ( ${episodesText} Eps. )`;
}

function getMediaType(anime) {
  return normalizeText(anime?.type || anime?.showType || anime?.mediaType || anime?.kind || anime?.attributes?.type || anime?.attributes?.showType || '');
}

function isMovieMedia(anime) {
  const mediaType = getMediaType(anime);
  return mediaType.includes('movie') || mediaType.includes('film');
}

function formatDurationText(rawDuration) {
  const text = String(rawDuration || '').trim();
  if (!text) return 'Desconocida';

  const normalized = text
    .replace(/\s+/g, ' ')
    .replace(/hours?/i, 'h')
    .replace(/hrs?\.?/i, 'h')
    .replace(/minutes?/i, 'm')
    .replace(/mins?\.?/i, 'm')
    .replace(/\bhr\.?/i, 'h')
    .replace(/\bmin\.?/i, 'm')
    .replace(/\b(episodes?|eps?\.?|ep\.?)/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized || text;
}

async function resolveMovieDurationText(anime, fallbackTitle = '') {
  const directDuration = anime?.duration || anime?.attributes?.duration || anime?.runtime || anime?.attributes?.runtime || null;
  if (directDuration) return formatDurationText(directDuration);

  const searchQuery = String(fallbackTitle || anime?.title || anime?.title_english || anime?.title_japanese || '').trim();
  if (!searchQuery) return 'Desconocida';

  try {
    const movieCandidates = await fetchAnimeByQuery(searchQuery, 12, 'movie');
    const normalizedQuery = normalizeText(searchQuery);
    const exactMovie = movieCandidates.find((item) => {
      const titles = getTitleCandidates(item);
      return titles.some((title) => normalizeText(title) === normalizedQuery);
    });

    const found = exactMovie || movieCandidates[0] || await searchAnimeFlexible(searchQuery);
    if (!found?.mal_id) return 'Desconocida';

    const full = await fetchAnimeFullById(found.mal_id).catch(() => null);
    const duration = full?.duration || full?.attributes?.duration || full?.runtime || full?.attributes?.runtime || null;
    return formatDurationText(duration);
  } catch {
    return 'Desconocida';
  }
}

function getCrunchyrollExternalUrl(anime) {
  const externalLinks = Array.isArray(anime?.external) ? anime.external : [];
  const crunchyroll = externalLinks.find((item) => /crunchyroll/i.test(String(item?.name || '')) && item?.url);
  return crunchyroll?.url || null;
}

async function resolveCrunchyrollUrl(anime) {
  const externalUrl = getCrunchyrollExternalUrl(anime);
  if (externalUrl) return externalUrl;

  const title = String(anime?.title || anime?.title_english || anime?.title_japanese || '').trim();
  if (!title) return null;

  if (isMovieMedia(anime)) {
    return `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`;
  }

  try {
    const type = isMovieMedia(anime) ? 'movie' : null;
    const candidates = await fetchAnimeByQuery(title, 12, type);
    const normalizedTitle = normalizeText(title);

    const picked = candidates.find((item) => {
      const names = getTitleCandidates(item);
      return names.some((candidateTitle) => normalizeText(candidateTitle) === normalizedTitle || normalizeText(candidateTitle).includes(normalizedTitle) || normalizedTitle.includes(normalizeText(candidateTitle)));
    }) || candidates[0] || null;

    if (!picked?.mal_id) return null;

    const full = await fetchAnimeFullById(picked.mal_id).catch(() => null);
    return getCrunchyrollExternalUrl(full) || `https://www.crunchyroll.com/search?q=${encodeURIComponent(searchQuery)}`;
  } catch {
    return null;
  }
}

async function getAnimeDisplayField(anime, fallbackTitle = '') {
  if (isMovieMedia(anime)) {
    const duration = await resolveMovieDurationText(anime, fallbackTitle);
    return { name: 'Película', value: String(duration || 'Desconocida') };
  }

  const episodes = Number(anime?.episodes || anime?.episodeCount || anime?.attributes?.episodeCount || 0);
  return { name: 'Episodios', value: episodes > 0 ? String(episodes) : '¿?' };
}

function estimateSeasonsText(anime) {
  const relations = Array.isArray(anime?.relations) ? anime.relations : [];
  const sequelLike = relations
    .filter((rel) => ['sequel', 'prequel'].includes(String(rel?.relation || '').toLowerCase()))
    .reduce((count, rel) => count + (Array.isArray(rel?.entry) ? rel.entry.filter((e) => e.type === 'anime').length : 0), 0);

  const seasons = sequelLike > 0 ? sequelLike + 1 : null;
  const text = seasons ? String(seasons) : 'Desconocido';

  if (sequelLike > 0) {
    return `${text} (con secuelas/pre-cuelas)`;
  }

  return text;
}

function getCoverImage(anime) {
  return anime?.images?.jpg?.large_image_url
    || anime?.images?.webp?.large_image_url
    || anime?.images?.jpg?.image_url
    || anime?.images?.webp?.image_url
    || null;
}

function getTrailerUrl(anime) {
  return anime?.trailer?.url
    || (anime?.trailer?.youtube_id ? `https://www.youtube.com/watch?v=${anime.trailer.youtube_id}` : null)
    || null;
}

function getCrunchyrollUrl(anime) {
  const externalUrl = getCrunchyrollExternalUrl(anime);
  if (externalUrl) return externalUrl;

  if (isMovieMedia(anime)) return null;

  const title = encodeURIComponent(anime?.title || anime?.title_english || 'anime');
  return `https://www.crunchyroll.com/search?q=${title}`;
}

function buildExternalLinks(anime) {
  const title = encodeURIComponent(anime?.title || anime?.title_english || 'anime');
  const movie = isMovieMedia(anime);

  return {
    mal: anime?.url || `https://myanimelist.net/anime/${anime?.mal_id || ''}`,
    crunchyroll: getCrunchyrollUrl(anime),
    animeflv: movie ? null : `https://www3.animeflv.net/browse?q=${title}`,
    trailer: getTrailerUrl(anime) || `https://www.youtube.com/results?search_query=${title}+trailer`,
  };
}

async function buildAnimeStreamingButtons(anime) {
  const links = buildExternalLinks(anime);
  const crunchyrollUrl = await resolveCrunchyrollUrl(anime);
  const buttons = [];

  if (crunchyrollUrl) {
    buttons.push(new ButtonBuilder().setLabel('Ver en Crunchyroll').setEmoji('🟩').setStyle(ButtonStyle.Link).setURL(crunchyrollUrl));
  }

  if (links.animeflv) {
    buttons.push(new ButtonBuilder().setLabel('Ver en AnimeFLV').setEmoji('🟪').setStyle(ButtonStyle.Link).setURL(links.animeflv));
  }

  // Removed MyAnimeList button
  buttons.push(new ButtonBuilder().setLabel('Ver Tráiler').setEmoji('🟥').setStyle(ButtonStyle.Link).setURL(links.trailer));

  return buttons;
}

async function buildAnimeButtons(anime) {
  const buttons = await buildAnimeStreamingButtons(anime);
  const row = new ActionRowBuilder().addComponents(...buttons);

  return row;
}

async function buildAnimeVisualEmbed(anime) {
  const title = anime?.title || anime?.title_english || 'Anime sin título';
  const synopsisRaw = String(anime?.synopsis || anime?.background || 'Sin sinopsis disponible.').trim();
  const synopsisTrimmed = synopsisRaw.length > 1000 ? `${synopsisRaw.slice(0, 997).trim()}…` : synopsisRaw;
  const synopsisBlock = `> ${synopsisTrimmed.replace(/\n+/g, '\n> ')}`;

  const score = anime?.score ? `${anime.score}/10` : 'Desconocido';
  const displayField = await getAnimeDisplayField(anime, title);
  const status = getEpisodesStatus(anime) || 'Desconocido';
  const genres = formatGenres(anime?.genres || []) || '🏷️ Sin géneros';
  const links = buildExternalLinks(anime);

  const embed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`⭐ ${title}`)
    .setDescription(SEPARATOR);

  // Fields: media count + Status (inline), Rating + Genres (inline)
  embed.addFields(
    { name: displayField.name, value: String(displayField.value), inline: true },
    { name: 'Estado', value: String(status), inline: true },
    { name: 'Rating', value: String(score), inline: true },
    { name: 'Géneros', value: String(genres), inline: true },
    { name: 'Sinopsis', value: synopsisBlock, inline: false },
    { name: '\u200b', value: SEPARATOR, inline: false }
  );

  const image = getCoverImage(anime);
  if (image) {
    embed.setImage(image);
  }

  return embed;
}

function buildAnimeTopListEmbed(categoryName, page, totalPages, animes) {
  const lines = [
    `🔎 **Resultados para "${categoryName}" - Página ${page}**`,
    SEPARATOR,
  ];

  animes.slice(0, 10).forEach((anime, index) => {
    const score = anime?.score ? `${anime.score}/10` : 'Sin score';
    const title = anime?.title || anime?.title_english || `Anime #${index + 1}`;
    const image = getCoverImage(anime);
    lines.push(`${index + 1}. ${title} - ⭐ ${score}`);
    if (image) lines.push(`🖼️ [Mini-thumbnail](${image})`);
    if (index < Math.min(10, animes.length) - 1) lines.push(SEPARATOR);
  });

  lines.push(SEPARATOR);
  lines.push('⬇️ **Elegí un anime...**');

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Resultados para "${categoryName}" - Página ${page}`)
    .setDescription(lines.join('\n'));
}

function buildAnimeTopSelectRow(sessionId, animes) {
  const options = animes.slice(0, 10).map((anime, index) => {
    const score = anime?.score ? `${anime.score}/10` : 'Sin score';
    const title = anime?.title || anime?.title_english || `Anime #${index + 1}`;
    return {
      label: title.slice(0, 100),
      description: `⭐ ${score} · MAL ID ${anime.mal_id}`.slice(0, 100),
      value: String(anime.mal_id),
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`animetop:${sessionId}:select`)
      .setPlaceholder('Elegí un anime...')
      .addOptions(options)
  );
}

function buildAnimeTopNavRow(sessionId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`animetop:${sessionId}:prev`)
      .setLabel('Anterior')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`animetop:${sessionId}:next`)
      .setLabel('Siguiente')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
}

function buildAnimeTopDetailBackRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`animetop:${sessionId}:back`)
      .setLabel('Volver a la lista')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildAnimeSearchListEmbed(query, page, totalPages, animes) {
  const lines = [
    `🔎 **Resultados para:** ${query}`,
    `📄 **Página ${page} de ${totalPages}**`,
    SEPARATOR,
  ];

  animes.forEach((anime, index) => {
    const title = anime?.title || anime?.title_english || `Anime #${index + 1}`;
    const score = anime?.score ? `${anime.score}/10` : 'Sin score';
    lines.push(`${index + 1}. ${title} - ⭐ ${score}`);
    if (index < animes.length - 1) lines.push(SEPARATOR);
  });

  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`Resultados para "${query}" - Página ${page}`)
    .setDescription(lines.join('\n'));
}

function buildAnimeSearchNavRow(sessionId, page, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`animesearch:${sessionId}:prev`)
      .setLabel('Anterior')
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`animesearch:${sessionId}:next`)
      .setLabel('Siguiente')
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages)
  );
}

function buildAnimeSearchSelectRow(sessionId, animes) {
  const options = animes.slice(0, 10).map((anime, index) => {
    const title = anime?.title || anime?.title_english || `Anime #${index + 1}`;
    const score = anime?.score ? `${anime.score}/10` : 'Sin score';
    return {
      label: title.slice(0, 100),
      description: `⭐ ${score} · MAL ID ${anime.mal_id}`.slice(0, 100),
      value: String(anime.mal_id),
    };
  });

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`animesearch:${sessionId}:select`)
      .setPlaceholder('Elegí un anime de esta página...')
      .addOptions(options)
  );
}

function buildAnimeDetailBackRow(sessionId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`animesearch:${sessionId}:back`)
      .setLabel('Volver a la lista')
      .setEmoji('↩️')
      .setStyle(ButtonStyle.Secondary)
  );
}

module.exports = {
  SEPARATOR,
  EMBED_COLOR,
  truncate,
  normalizeText,
  searchAnimeFlexible,
  fetchAnimeFullById,
  fetchAnimeSearchPage,
  fetchAnimeGenres,
  resolveGenre,
  fetchTopAnimeByGenre,
  fetchAnimeTopPageByGenre,
  buildAnimeButtons,
  buildAnimeStreamingButtons,
  buildAnimeVisualEmbed,
  getAnimeDisplayField,
  isMovieMedia,
  formatDurationText,
  buildAnimeTopListEmbed,
  buildAnimeTopSelectRow,
  buildAnimeTopNavRow,
  buildAnimeTopDetailBackRow,
  buildAnimeSearchListEmbed,
  buildAnimeSearchNavRow,
  buildAnimeSearchSelectRow,
  buildAnimeDetailBackRow,
};

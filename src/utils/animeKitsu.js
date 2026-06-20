const KITSU_BASE = 'https://kitsu.io/api/edge';

function cleanText(text = '') {
  return String(text || '').replace(/<br\s*\/?>(\s*)/gi, '\n').replace(/<[^>]+>/g, '').trim();
}

async function fetchJson(url) {
  const fetchImpl = typeof fetch !== 'undefined' ? fetch : null;
  if (!fetchImpl) throw new Error('fetch not available in this environment');
  const res = await fetchImpl(url, { headers: { Accept: 'application/vnd.api+json' } });
  if (!res.ok) throw new Error(`Kitsu responded ${res.status}`);
  return res.json();
}

function buildIncludeUrl(baseUrl) {
  const joiner = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${joiner}include=genres,categories`;
}

function normalizeName(value) {
  return String(value || '').trim();
}

function uniqueNames(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => normalizeName(value)).filter(Boolean))];
}

function extractNamesFromIncluded(payload) {
  const included = Array.isArray(payload?.included) ? payload.included : [];
  const names = [];

  for (const item of included) {
    if (!item || typeof item !== 'object') continue;
    const type = String(item.type || '').toLowerCase();
    if (!['genre', 'genres', 'category', 'categories'].includes(type)) continue;

    const name = item.attributes?.name || item.attributes?.slug || item.attributes?.title || item.attributes?.canonicalTitle || '';
    if (name) names.push(name);
  }

  return uniqueNames(names);
}

function extractGenreCandidates(media, payload = null) {
  const directGenres = Array.isArray(media?.genres) ? media.genres : [];
  const directCategories = Array.isArray(media?.categories) ? media.categories : [];
  const attrGenres = Array.isArray(media?.attributes?.genres) ? media.attributes.genres : [];
  const attrCategories = Array.isArray(media?.attributes?.categories) ? media.attributes.categories : [];
  const includedNames = extractNamesFromIncluded(payload);

  const all = [...directGenres, ...directCategories, ...attrGenres, ...attrCategories, ...includedNames];
  const names = all.map((g) => {
    if (!g) return '';
    if (typeof g === 'string') return g;
    return g.name || g.title || g.slug || g.attributes?.name || g.attributes?.slug || '';
  });

  return uniqueNames(names);
}

async function fetchKitsuGenreFallback(query) {
  const fallbackQuery = String(query || '').trim();
  if (!fallbackQuery) return [];

  try {
    const { results } = await searchKitsuPage(fallbackQuery, 1, 1);
    const first = Array.isArray(results) ? results[0] : null;
    return extractGenreCandidates(first || {}, null);
  } catch {
    return [];
  }
}

async function resolveGenresWithFallback(media, payload = null, fallbackQuery = '') {
  let names = extractGenreCandidates(media, payload);
  if (names.length > 0) return names;

  const abbrev = Array.isArray(media?.attributes?.abbreviatedTitles)
    ? media.attributes.abbreviatedTitles
    : Array.isArray(media?.abbreviatedTitles)
      ? media.abbreviatedTitles
      : [];

  const quickSeed = uniqueNames([media?.title, media?.attributes?.canonicalTitle, ...abbrev])[0] || fallbackQuery;
  names = await fetchKitsuGenreFallback(quickSeed);
  if (names.length > 0) return names;

  if (abbrev.length > 0) return uniqueNames(abbrev);
  return [];
}

async function mapAnimeWithGenres(item, payload = null, fallbackQuery = '') {
  const a = item.attributes || {};
  const media = {
    id: item.id,
    slug: a.slug,
    title: a.canonicalTitle || a.titles?.en || a.titles?.en_jp || 'Sin título',
    synopsis: cleanText(a.synopsis || ''),
    poster: a.posterImage?.large || a.posterImage?.original || a.posterImage?.medium || null,
    cover: a.coverImage?.large || a.coverImage?.original || null,
    averageRating: a.averageRating || null,
    episodeCount: a.episodeCount || null,
    status: a.status || null,
    airingStart: a.startDate || null,
    showType: a.showType || null,
    categories: a.categories || [],
    attributes: a,
  };

  media.genres = await resolveGenresWithFallback(media, payload, fallbackQuery);
  return media;
}

async function fetchKitsuRandomPool(limit = 20, offset = null) {
  const off = Number.isFinite(offset) ? Number(offset) : Math.floor(Math.random() * 501);
  const url = buildIncludeUrl(`${KITSU_BASE}/anime?page[limit]=${limit}&page[offset]=${off}&sort=-averageRating`);
  const payload = await fetchJson(url);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const mapped = [];

  for (const item of data) {
    mapped.push(await mapAnimeWithGenres(item, payload, item?.attributes?.canonicalTitle || item?.attributes?.titles?.en || ''));
  }

  return mapped;
}

async function fetchKitsuTopByCategory(category, page = 1, limit = 10) {
  const q = encodeURIComponent(String(category || ''));
  const offset = Math.max(0, (Number(page) - 1) * Number(limit));
  const url = buildIncludeUrl(`${KITSU_BASE}/anime?filter[categories]=${q}&page[limit]=${limit}&page[offset]=${offset}&sort=-averageRating`);
  const payload = await fetchJson(url);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const total = Number(payload?.meta?.count || data.length);
  const results = [];

  for (const item of data) {
    results.push(await mapAnimeWithGenres(item, payload, category));
  }

  return { results, pageInfo: { total, currentPage: page, perPage: limit } };
}

async function searchKitsuPage(query, page = 1, limit = 10) {
  const q = encodeURIComponent(String(query || ''));
  const offset = Math.max(0, (Number(page) - 1) * Number(limit));
  const url = buildIncludeUrl(`${KITSU_BASE}/anime?filter[text]=${q}&page[limit]=${limit}&page[offset]=${offset}&sort=-averageRating`);
  const payload = await fetchJson(url);
  const data = Array.isArray(payload?.data) ? payload.data : [];
  const total = Number(payload?.meta?.count || data.length);
  const results = [];

  for (const item of data) {
    results.push(await mapAnimeWithGenres(item, payload, query));
  }

  return { results, pageInfo: { total, currentPage: page, perPage: limit } };
}

async function fetchKitsuById(id) {
  const url = buildIncludeUrl(`${KITSU_BASE}/anime/${id}`);
  const payload = await fetchJson(url);
  const item = payload?.data;
  if (!item) return null;
  return mapAnimeWithGenres(item, payload, item?.attributes?.canonicalTitle || item?.attributes?.titles?.en || '');
}

module.exports = {
  fetchKitsuRandomPool,
  searchKitsuPage,
  fetchKitsuById,
  fetchKitsuTopByCategory,
  cleanText,
  extractNamesFromIncluded,
  extractGenreCandidates,
  resolveGenresWithFallback,
};

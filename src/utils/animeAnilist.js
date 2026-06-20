const ANILIST_API = 'https://graphql.anilist.co';
const DEFAULT_PER_PAGE = 10;

function cleanHtml(text = '') {
  return String(text || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function graphql(query, variables = {}) {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`AniList GraphQL error ${res.status}: ${txt}`);
  }
  return res.json();
}

async function searchAniListPage(search, page = 1, perPage = DEFAULT_PER_PAGE) {
  const query = `
    query ($search: String, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total, currentPage, lastPage, hasNextPage }
        media(search: $search, type: ANIME, sort: [SCORE_DESC, POPULARITY_DESC]) {
          id
          idMal
          title { romaji, english, native }
          description
          bannerImage
          coverImage { extraLarge, large, medium, color }
          episodes
          format
          status
          averageScore
          popularity
          genres
          externalLinks { id, site, url }
        }
      }
    }
  `;
  const variables = { search, page, perPage };
  const payload = await graphql(query, variables);
  const pageData = payload?.data?.Page || {};
  const media = Array.isArray(pageData.media) ? pageData.media : [];
  return {
    results: media,
    pageInfo: pageData.pageInfo || { total: 0, currentPage: page, lastPage: page, hasNextPage: false },
  };
}

async function searchPopularWithMinScore(minScore = 60, page = 1, perPage = 50) {
  const query = `
    query ($minScore: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total, currentPage, lastPage, hasNextPage }
        media(type: ANIME, sort: [POPULARITY_DESC], averageScore_greater: $minScore) {
          id
          idMal
          title { romaji, english, native }
          description
          bannerImage
          coverImage { extraLarge, large, medium, color }
          episodes
          format
          status
          averageScore
          popularity
          genres
          externalLinks { id, site, url }
        }
      }
    }
  `;
  const variables = { minScore: Number(minScore || 0), page, perPage };
  const payload = await graphql(query, variables);
  const pageData = payload?.data?.Page || {};
  const media = Array.isArray(pageData.media) ? pageData.media : [];
  return { results: media, pageInfo: pageData.pageInfo || { total: 0, currentPage: page, lastPage: page, hasNextPage: false } };
}

async function searchPopularByGenreWithMinScore(genre, minScore = 60, page = 1, perPage = 50) {
  const query = `
    query ($genre: String, $minScore: Int, $page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total, currentPage, lastPage, hasNextPage }
        media(type: ANIME, sort: [POPULARITY_DESC], genre_in: [$genre], averageScore_greater: $minScore) {
          id
          idMal
          title { romaji, english, native }
          description
          bannerImage
          coverImage { extraLarge, large, medium, color }
          episodes
          format
          status
          averageScore
          popularity
          genres
          externalLinks { id, site, url }
        }
      }
    }
  `;
  const variables = { genre, minScore: Number(minScore || 0), page, perPage };
  const payload = await graphql(query, variables);
  const pageData = payload?.data?.Page || {};
  const media = Array.isArray(pageData.media) ? pageData.media : [];
  return { results: media, pageInfo: pageData.pageInfo || { total: 0, currentPage: page, lastPage: page, hasNextPage: false } };
}

async function fetchAniListFullById(anilistId) {
  const query = `
    query ($id: Int) {
      Media(id: $id, type: ANIME) {
        id
        idMal
        title { romaji, english, native }
        description
        bannerImage
        coverImage { extraLarge, large, medium, color }
        episodes
        format
        status
        averageScore
        popularity
        genres
        externalLinks { id, site, url }
        trailer { id, site, thumbnail, url }
        relations { edges { node { id, title { romaji } type } } }
      }
    }
  `;
  const variables = { id: Number(anilistId) };
  const payload = await graphql(query, variables);
  return payload?.data?.Media || null;
}

function mapStreamingLinks(externalLinks = []) {
  const map = {};
  for (const link of externalLinks || []) {
    const site = String(link.site || '').toLowerCase();
    const url = link.url || null;
    if (!url) continue;
    if (/crunchyroll/.test(site)) map.crunchyroll = url;
    else if (/netflix/.test(site)) map.netflix = url;
    else if (/hulu/.test(site)) map.hulu = url;
    else if (/funimation/.test(site)) map.funimation = url;
    else if (/amazon/i.test(site) || /prime/.test(site)) map.amazon = url;
    else if (/disney/.test(site)) map.disney = url;
    else if (/youtube/.test(site)) map.youtube = url;
  }
  return map;
}

function getBannerOrCover(media) {
  return media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || null;
}

function buildExternalButtonsForMedia(media) {
  const external = Array.isArray(media?.externalLinks) ? media.externalLinks : media?.externalLinks || [];
  const mapped = mapStreamingLinks(external);
  const titleEncoded = encodeURIComponent(media?.title?.romaji || media?.title?.english || media?.title?.native || 'anime');

  const buttons = [];
  if (mapped.crunchyroll) buttons.push({ label: 'Ver en Crunchyroll', emoji: '🟩', url: mapped.crunchyroll });
  if (mapped.netflix) buttons.push({ label: 'Ver en Netflix', emoji: '⬛', url: mapped.netflix });
  if (mapped.hulu) buttons.push({ label: 'Ver en Hulu', emoji: '🟢', url: mapped.hulu });
  if (mapped.funimation) buttons.push({ label: 'Ver en Funimation', emoji: '🟦', url: mapped.funimation });
  if (mapped.amazon) buttons.push({ label: 'Ver en Prime', emoji: '🟧', url: mapped.amazon });
  if (mapped.disney) buttons.push({ label: 'Ver en Disney+', emoji: '⭐', url: mapped.disney });
  if (mapped.youtube) buttons.push({ label: 'Ver Tráiler', emoji: '🟥', url: mapped.youtube });

  buttons.push({ label: 'Buscar en AnimeFLV', emoji: '🟪', url: `https://www3.animeflv.net/browse?q=${titleEncoded}` });

  return buttons;
}

module.exports = {
  searchAniListPage,
  fetchAniListFullById,
  cleanHtml,
  mapStreamingLinks,
  getBannerOrCover,
  buildExternalButtonsForMedia,
  searchPopularWithMinScore,
  searchPopularByGenreWithMinScore,
};

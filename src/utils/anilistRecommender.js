const fs = require('fs');
const path = require('path');

const {
  MessageFlags,
} = require('discord.js');

const {
  fetchKitsuRandomPool,
  fetchKitsuById,
  cleanText,
} = require('./animeKitsu');

const {
  searchAniListPage,
  buildExternalButtonsForMedia,
} = require('./animeAnilist');

const {
  getAnimeDisplayField,
} = require('./animeJikan');

const PERSIST_PATH = path.join(
  __dirname,
  '..',
  'anilist-recommender.json'
);

const DEFAULT_TARGET_CHANNEL_ID =
  '1502203819293937664';

const synopsisTranslationCache =
  new Map();

const streamingCache =
  new Map();

const aniListExternalLinksCache =
  new Map();

const activeWorkers = new Set();

let clientRef = null;

let state = {
  enabled: false,
  intervalMinutes: 60,
};

let loopToken = 0;

const genreTranslationMap = new Map([
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
  ['shounen', 'Shounen'],
  ['shonen', 'Shounen'],
]);

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function loadState() {
  try {
    if (fs.existsSync(PERSIST_PATH)) {
      const raw = fs.readFileSync(
        PERSIST_PATH,
        'utf8'
      );

      state = {
        ...state,
        ...JSON.parse(raw),
      };
    }
  } catch (e) {
    console.error(e);
  }
}

function saveState() {
  try {
    fs.writeFileSync(
      PERSIST_PATH,
      JSON.stringify(state, null, 2),
      'utf8'
    );
  } catch (e) {
    console.error(e);
  }
}

function extractGenres(media) {
  const rawGenres = [
    ...(Array.isArray(media.genres)
      ? media.genres
      : []),

    ...(Array.isArray(
      media.categories
    )
      ? media.categories
      : []),
  ];

  const cleaned = rawGenres.map(g => {
    if (typeof g === 'string') {
      return g;
    }

    return (
      g?.title ||
      g?.name ||
      g?.attributes?.title ||
      g?.attributes?.name
    );
  });

  return [
    ...new Set(
      cleaned
        .filter(Boolean)
        .map(g => normalize(g))
    ),
  ];
}

function translateGenres(media) {
  const genres =
    extractGenres(media);

  if (!genres.length) {
    return 'Desconocido';
  }

  return genres
    .map(g => {
      return (
        genreTranslationMap.get(g) ||
        g.charAt(0).toUpperCase() +
          g.slice(1)
      );
    })
    .join(', ');
}

async function translateToSpanish(
  text
) {
  const raw = String(text || '').trim();

  if (!raw) {
    return 'Sin sinopsis.';
  }

  if (
    synopsisTranslationCache.has(raw)
  ) {
    return synopsisTranslationCache.get(
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
    const res = await translator(raw, {
      to: 'es',
    });

    const translated =
      res?.text || raw;

    synopsisTranslationCache.set(
      raw,
      translated
    );

    return translated;
  } catch {
    return raw;
  }
}

async function fetchHTML(url) {
  try {
    const controller =
      new AbortController();

    const timeout = setTimeout(
      () => controller.abort(),
      8000
    );

    const res = await fetch(url, {
      signal: controller.signal,

      headers: {
        'User-Agent':
          'Mozilla/5.0',
      },
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return '';
    }

    return (
      await res.text()
    ).toLowerCase();
  } catch {
    return '';
  }
}

function titleMatch(
  html,
  titles
) {
  return titles.some(title => {
    const clean = title
      .replace(/[^\w\s]/g, '')
      .trim();

    if (!clean) return false;

    return html.includes(clean);
  });
}

async function detectCrunchyroll(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.crunchyroll.com/search?q=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/series/') ||
        html.includes('/watch/')
      );

    if (valid) {
      return {
        key: 'crunchyroll',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectAnimeFLV(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www3.animeflv.net/browse?q=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      html.includes('/anime/');

    if (valid) {
      return {
        key: 'animeflv',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectNetflix(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.netflix.com/search?q=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/title/') ||
        html.includes('videoid')
      );

    if (valid) {
      return {
        key: 'netflix',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectPrime(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.primevideo.com/search/ref=atv_nb_sr?phrase=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/detail/') ||
        html.includes('gti=')
      );

    if (valid) {
      return {
        key: 'prime',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectDisney(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.disneyplus.com/search/${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/series/') ||
        html.includes('/movies/')
      );

    if (valid) {
      return {
        key: 'disney',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectHulu(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.hulu.com/search?q=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/series/') ||
        html.includes('/movie/') ||
        html.includes('hulu.com')
      );

    if (valid) {
      return {
        key: 'hulu',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectFunimation(
  titles
) {
  for (const title of titles) {
    const url =
      `https://www.funimation.com/search/?q=${encodeURIComponent(title)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      (
        html.includes('/shows/') ||
        html.includes('funimation')
      );

    if (valid) {
      return {
        key: 'funimation',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectYouTube(
  titles
) {
  for (const title of titles) {
    const searchText =
      `${title} trailer anime`;

    const url =
      `https://www.youtube.com/results?search_query=${encodeURIComponent(searchText)}`;

    const html =
      await fetchHTML(url);

    const valid =
      titleMatch(html, titles) &&
      html.includes('/watch');

    if (valid) {
      return {
        key: 'youtube',
        found: true,
        url,
      };
    }
  }

  return null;
}

async function detectStreamingPlatforms(
  anime
) {
  const titles = [
    anime.title,
    anime.canonicalTitle,
    anime.titles?.en,
    anime.titles?.en_jp,
    anime.titles?.ja_jp,
    ...(anime.abbreviatedTitles || []),
  ]
    .filter(Boolean)
    .map(t =>
      String(t)
        .trim()
        .toLowerCase()
    );

  const uniqueTitles = [
    ...new Set(titles),
  ];

  const cacheKey = uniqueTitles[0];

  if (streamingCache.has(cacheKey)) {
    return streamingCache.get(
      cacheKey
    );
  }

  const result = {
    crunchyroll: false,
    animeflv: false,
    netflix: false,
    prime: false,
    disney: false,
    hulu: false,
    funimation: false,
    youtube: false,

    crunchyrollUrl: null,
    animeflvUrl: null,
    netflixUrl: null,
    primeUrl: null,
    disneyUrl: null,
    huluUrl: null,
    funimationUrl: null,
    youtubeUrl: null,
  };

  const workers = [
    detectCrunchyroll(uniqueTitles),
    detectAnimeFLV(uniqueTitles),
    detectNetflix(uniqueTitles),
    detectPrime(uniqueTitles),
    detectDisney(uniqueTitles),
    detectHulu(uniqueTitles),
    detectFunimation(uniqueTitles),
    detectYouTube(uniqueTitles),
  ];

  const responses =
    await Promise.allSettled(workers);

  for (const r of responses) {
    if (
      r.status !== 'fulfilled' ||
      !r.value
    ) {
      continue;
    }

    const {
      key,
      found,
      url,
    } = r.value;

    if (!found) continue;

    result[key] = true;
    result[`${key}Url`] = url;
  }

  streamingCache.set(
    cacheKey,
    result
  );

  return result;
}

async function getAniListExternalLinksForTitle(title) {
  const normalizedTitle = normalize(title);

  if (!normalizedTitle) {
    return [];
  }

  if (aniListExternalLinksCache.has(normalizedTitle)) {
    return aniListExternalLinksCache.get(normalizedTitle);
  }

  try {
    const search = await searchAniListPage(title, 1, 1);
    const media = Array.isArray(search?.results) ? search.results[0] : null;
    const links = Array.isArray(media?.externalLinks) ? media.externalLinks : [];
    aniListExternalLinksCache.set(normalizedTitle, links);
    return links;
  } catch {
    aniListExternalLinksCache.set(normalizedTitle, []);
    return [];
  }
}

async function pickRandomGoodAnime() {
  const randomOffset = Math.floor(
    Math.random() * 500
  );

  const pool =
    await fetchKitsuRandomPool(
      20,
      randomOffset
    );

  if (
    !Array.isArray(pool) ||
    !pool.length
  ) {
    return null;
  }

  const shuffled = pool.sort(
    () => Math.random() - 0.5
  );

  for (const anime of shuffled) {
    if (
      anime?.synopsis &&
      anime.synopsis.length > 30
    ) {
      const full =
        await fetchKitsuById(
          anime.id
        ).catch(() => anime);

      const streaming =
        await detectStreamingPlatforms(
          full
        );

      const hasStreaming =
        streaming.crunchyroll ||
        streaming.animeflv ||
        streaming.netflix ||
        streaming.prime ||
        streaming.disney ||
        streaming.hulu ||
        streaming.funimation ||
        streaming.youtube;

      if (!hasStreaming) {
        continue;
      }

      const synopsis =
        await translateToSpanish(
          cleanText(
            full.synopsis ||
              anime.synopsis
          )
        );

      return {
        ...anime,
        ...full,
        translatedSynopsis:
          synopsis,
      };
    }
  }

  return null;
}

async function createAnimeComponents(
  anime
) {
  const synopsis = String(
    anime.translatedSynopsis ||
      anime.synopsis ||
      'Sin sinopsis.'
  )
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 1200);

  const display =
    await getAnimeDisplayField(
      anime,
      anime.title
    );

  const streaming =
    await detectStreamingPlatforms(
      anime
    );

  const aniListExternalLinks =
    await getAniListExternalLinksForTitle(
      anime.title || anime.canonicalTitle || anime.titles?.en_jp || anime.titles?.en || anime.titles?.ja_jp
    );

  const mergedExternalLinks = [
    ...aniListExternalLinks,
    ...[
      streaming.crunchyroll && streaming.crunchyrollUrl
        ? { site: 'Crunchyroll', url: streaming.crunchyrollUrl }
        : null,
      streaming.netflix && streaming.netflixUrl
        ? { site: 'Netflix', url: streaming.netflixUrl }
        : null,
      streaming.hulu && streaming.huluUrl
        ? { site: 'Hulu', url: streaming.huluUrl }
        : null,
      streaming.funimation && streaming.funimationUrl
        ? { site: 'Funimation', url: streaming.funimationUrl }
        : null,
      streaming.prime && streaming.primeUrl
        ? { site: 'Amazon Prime Video', url: streaming.primeUrl }
        : null,
      streaming.disney && streaming.disneyUrl
        ? { site: 'Disney+', url: streaming.disneyUrl }
        : null,
      streaming.youtube && streaming.youtubeUrl
        ? { site: 'YouTube', url: streaming.youtubeUrl }
        : null,
    ].filter(Boolean),
  ]
    .filter(link => link && link.url)
    .filter((link, index, array) => index === array.findIndex(other => String(other.url) === String(link.url)));

  const genres =
    translateGenres(anime);

  const buttons = [];

  const mediaForButtons = {
    title: {
      romaji:
        anime.title ||
        anime.canonicalTitle ||
        anime.titles?.en_jp ||
        anime.titles?.en ||
        anime.titles?.ja_jp ||
        'anime',
    },

    externalLinks: [
      ...mergedExternalLinks,
    ],
  };

  const externalButtons =
    buildExternalButtonsForMedia(
      mediaForButtons
    );

  for (const btn of externalButtons) {
    buttons.push({
      type: 2,
      style: 5,
      label: btn.label,
      emoji: {
        name: btn.emoji,
      },
      url: btn.url,
    });
  }

  if (
    streaming.disney &&
    streaming.disneyUrl
  ) {
    buttons.push({
      type: 2,
      style: 5,
      label: 'Ver en Disney+',
      emoji: {
        name: '⭐',
      },
      url: streaming.disneyUrl,
    });
  }

  return [
    {
      type: 17,
      accent_color: null,

      components: [
        {
          type: 12,

          items: [
            {
              media: {
                type: 1,
                url:
                  anime.coverImage ||
                  anime.cover ||
                  anime.posterImage ||
                  anime.poster ||
                  'https://i.imgur.com/txgh4hD.png',
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
            `# ⭐ ${anime.title}\n\n` +
            `> ${synopsis.replace(
              /\n+/g,
              '\n> '
            )}\n\n` +
            `### 📺 Información\n` +
            `**${display.name}**\n${display.value}\n\n` +
            `### 🎭 Géneros\n${genres}\n\n` +
            `### ⭐ Rating\n${
              anime.averageRating ||
              'Desconocido'
            }`,
        },

        {
          type: 14,
          divider: true,
          spacing: 1,
        },

        {
          type: 1,
          components: buttons,
        },
      ],
    },
  ];
}

async function sendRecommendation() {
  if (!clientRef) {
    return {
      ok: false,
      reason: 'no_client',
    };
  }

  const targetId =
    state.channelId ||
    DEFAULT_TARGET_CHANNEL_ID;

  const channel =
    await clientRef.channels
      .fetch(targetId)
      .catch(() => null);

  if (!channel) {
    return {
      ok: false,
      reason: 'no_channel',
      details: targetId,
    };
  }

  const anime =
    await pickRandomGoodAnime();

  if (!anime) {
    return {
      ok: false,
      reason: 'no_candidates',
    };
  }

  const components =
    await createAnimeComponents(
      anime
    );

  let sent;

  try {
    sent = await channel.send({
      flags:
        MessageFlags
          .IsComponentsV2,

      components,
    });
  } catch (e) {
    return {
      ok: false,
      reason: 'send_error',
      details:
        e?.message ||
        'unknown',
    };
  }

  try {
    await sent.react('👍');
    await sent.react('👎');
  } catch {}

  state.lastRunAt = Date.now();

  saveState();

  return {
    ok: true,
  };
}

async function recommendNow(client) {
  const prev = clientRef;

  clientRef = client;

  try {
    return await sendRecommendation();
  } catch (e) {
    return {
      ok: false,
      reason: 'exception',
      details:
        e?.message ||
        'unknown',
    };
  } finally {
    clientRef = prev;
  }
}

function startLoop(
  client,
  intervalMinutes,
  channelId
) {
  stopLoop();

  clientRef = client;

  state.enabled = true;

  state.intervalMinutes =
    Number(intervalMinutes) || 60;

  if (channelId) {
    state.channelId =
      String(channelId);
  }

  saveState();

  loopToken++;

  const currentToken =
    loopToken;

  const loop = async () => {
    while (
      state.enabled &&
      currentToken === loopToken
    ) {
      if (
        activeWorkers.size < 1
      ) {
        const worker =
          sendRecommendation()
            .catch(console.error)
            .finally(() =>
              activeWorkers.delete(
                worker
              )
            );

        activeWorkers.add(worker);
      }

      await sleep(
        state.intervalMinutes *
          60 *
          1000
      );
    }
  };

  loop().catch(console.error);
}

function stopLoop() {
  loopToken++;

  state.enabled = false;

  saveState();
}

function init(client) {
  loadState();

  clientRef = client;

  if (state.enabled) {
    startLoop(
      client,
      state.intervalMinutes,
      state.channelId
    );
  }
}

module.exports = {
  init,
  startLoop,
  stopLoop,

  getState: () => state,

  sendRecommendation,
  recommendNow,
};
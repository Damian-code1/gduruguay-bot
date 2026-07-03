'use strict';

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { fetch } = require('undici');

const AREDL_API = 'https://api.aredl.net/v2';
const NLW_API = 'https://nlw.oat.zone';
const LIST_WORTHY_SHEET_ID = '15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8';
const LIST_WORTHY_GID = '0';
const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2 ?? 32768;

const LIST_WORTHY_CACHE_TTL_MS = 5 * 60 * 1000;
const listWorthyCache = {
  fetchedAt: 0,
  entries: [],
};

function normalizeName(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function sanitizeCell(text) {
  return String(text || '')
    .replace(/\|/g, '')
    .replace(/\uFE0F/g, '')
    .trim();
}

function parseListWorthyEntries(csvText) {
  const lines = String(csvText || '').split(/\r?\n/);
  const entries = [];
  let currentTier = null;

  for (const line of lines) {
    if (!line || !line.trim()) continue;
    const cells = parseCsvLine(line).map(sanitizeCell);
    const marker = cells[0] || '';

    const tierHeaderCell = cells.find(cell => /\bTier$/i.test(cell));
    if (tierHeaderCell) {
      currentTier = tierHeaderCell.replace(/\s*Tier$/i, '').trim();
      continue;
    }

    if (!currentTier) continue;
    if (marker && /^\d+$/.test(marker)) continue;

    const isLevelRow = marker.includes('▶');
    if (!isLevelRow) continue;

    const levelName = cells[1] || '';
    if (!levelName) continue;

    entries.push({
      name: levelName,
      tier: currentTier,
      normalized: normalizeName(levelName),
    });
  }

  return entries;
}

async function getListWorthyEntries() {
  const now = Date.now();
  if (listWorthyCache.entries.length && now - listWorthyCache.fetchedAt < LIST_WORTHY_CACHE_TTL_MS) {
    return listWorthyCache.entries;
  }

  const url = `https://docs.google.com/spreadsheets/d/${LIST_WORTHY_SHEET_ID}/export?format=csv&gid=${LIST_WORTHY_GID}`;
  const resp = await fetch(url, {
    headers: {
      Accept: 'text/csv,*/*',
      'User-Agent': 'Mozilla/5.0',
    },
  });

  if (!resp.ok) {
    throw new Error(`No se pudo leer List Worthy Sheet (${resp.status})`);
  }

  const csvText = await resp.text();
  const entries = parseListWorthyEntries(csvText);

  listWorthyCache.fetchedAt = now;
  listWorthyCache.entries = entries;
  return entries;
}

async function fetchListWorthyByName(name) {
  try {
    const entries = await getListWorthyEntries();
    if (!entries.length) return null;

    const q = normalizeName(name);
    const exact = entries.find(item => item.normalized === q);

    if (exact) {
      return {
        match: exact,
        matches: [exact],
        exact: true,
      };
    }

    const partial = entries.filter(
      item => item.normalized.includes(q)
    );

    if (!partial.length) return null;

    if (partial.length > 1) {
      return {
        match: null,
        matches: partial.slice(0, 10),
        exact: false,
      };
    }

    return {
      match: partial[0],
      matches: partial,
      exact: false,
    };
  } catch (err) {
    console.warn('List Worthy Sheet error', err);
    return null;
  }
}

async function fetchNlwByName(name) {
  try {
    const resp = await fetch(`${NLW_API}/list?type=all`, { headers: { Accept: 'application/json' } });
    if (!resp.ok) return null;
    const list = await resp.json();
    if (!Array.isArray(list)) return null;

    const q = String(name).trim().toLowerCase();
    const exact = list.find(
      l => String(l.name || '').trim().toLowerCase() === q
    );

    if (exact) {
      return {
        match: exact,
        matches: [exact],
        exact: true,
      };
    }

    const partial = list.filter(
      l => String(l.name || '').toLowerCase().includes(q)
    );

    if (!partial.length) return null;

    if (partial.length > 1) {
      return {
        match: null,
        matches: partial.slice(0, 10),
        exact: false,
      };
    }

    return {
      match: partial[0],
      matches: partial,
      exact: false,
    };
  } catch (e) {
    console.warn('NLW API error', e);
    return null;
  }
}

async function resolveLevelIdByName(levelName) {
  const response = await fetch(`${AREDL_API}/api/aredl/levels`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar niveles de AREDL (${response.status})`);
  }

  const data = await response.json();
  const levels = Array.isArray(data) ? data : data.data || [];
  const normalizedQuery = levelName.trim().toLowerCase();

  const exact = levels.find(
    level => String(level.name || '').trim().toLowerCase() === normalizedQuery
  );

  if (exact) {
    return {
      levelId: exact.id,
      levelName: exact.name,
      matches: [exact],
      exact: true,
    };
  }

  const partialMatches = levels.filter(level =>
    String(level.name || '').toLowerCase().includes(normalizedQuery)
  );

  if (!partialMatches.length) {
    return {
      levelId: null,
      levelName: null,
      matches: [],
      exact: false,
    };
  }

  if (partialMatches.length > 1) {
    return {
      levelId: null,
      levelName: null,
      matches: partialMatches.slice(0, 10),
      exact: false,
    };
  }

  return {
    levelId: partialMatches[0].id,
    levelName: partialMatches[0].name,
    matches: partialMatches,
    exact: false,
  };
}

function getTierFromLevel(level) {
  if (!level) return null;

  const tryFields = [
    'tier',
    'difficulty_tier',
    'difficultyTier',
    'difficulty',
    'difficulty_name',
    'difficulty_tier_name',
    'difficultyRating',
  ];

  for (const f of tryFields) {
    if (Object.prototype.hasOwnProperty.call(level, f) && level[f] != null) {
      return level[f];
    }
  }

  if (level.difficulty && typeof level.difficulty === 'object') {
    if (level.difficulty.tier) return level.difficulty.tier;
    if (level.difficulty.name) return level.difficulty.name;
  }

  return null;
}

function makeV2Card({ title, subtitle = '', lines = [], footer = '', sections = [] }) {
  const components = [{ type: 10, content: title.startsWith('#') ? title : `# ${title}` }];

  if (subtitle) {
    components.push({ type: 14 });
    components.push({ type: 10, content: subtitle });
  }

  for (const section of sections) {
    const sectionLines = Array.isArray(section?.lines) ? section.lines.filter(Boolean) : [];
    if (!sectionLines.length) continue;
    if (components.length) components.push({ type: 14 });
    components.push({ type: 10, content: `### ${section.title}\n${sectionLines.join('\n')}` });
  }

  if (lines.length) {
    components.push({ type: 14 });
    components.push({ type: 10, content: lines.filter(Boolean).join('\n') });
  }

  if (footer) {
    components.push({ type: 14 });
    components.push({ type: 10, content: `> ${footer}` });
  }

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: null,
        components,
      },
    ],
  };
}

function formatMatches(matches, mapper) {
  return (matches || []).slice(0, 5).map(mapper);
}

module.exports = {
  visibility: 'public',
  data: new SlashCommandBuilder()
    .setName('tier')
    .setDescription('Devuelve el tier NLW de un nivel de Geometry Dash.')
    .addStringOption((opt) => opt.setName('nivel').setDescription('Nombre del nivel').setRequired(true)),

  async execute(interaction) {
    const query = interaction.options.getString('nivel', true).trim();

    await interaction.deferReply({ flags: MessageFlags.IsComponentsV2 }).catch(() => null);

    const reply = (payload) =>
      interaction.editReply({ ...payload, flags: MessageFlags.IsComponentsV2 }).catch((err) => {
        console.error('[tier] Error en editReply:', err);
      });

    const nlwResult = await fetchNlwByName(query);
    const nlwTier = nlwResult?.match?.tier ? String(nlwResult.match.tier).trim() : null;
    const listWorthyResult = await fetchListWorthyByName(query);

    if (nlwResult?.match && nlwTier && nlwResult.exact) {
      return reply(makeV2Card({
        title: '🎯 Tier del nivel',
        subtitle: `**Nivel:** ${nlwResult.match.name}`,
        sections: [
          {
            title: 'Resultado',
            lines: [
              `NLW Tier: **${nlwTier}**`,
              listWorthyResult?.match ? `List Worthy Tier: **${listWorthyResult.match.tier}**` : 'List Worthy Tier: No detectado',
              'Fuente principal: **NLW API**',
            ],
          },
          ...(nlwResult.matches && nlwResult.matches.length > 1
            ? [{ title: 'Posibles coincidencias', lines: formatMatches(nlwResult.matches, item => item.name) }]
            : []),
        ],
        footer: 'Made by Evosen • GD Uruguay Bot',
      }));
    }

    if (listWorthyResult?.match && listWorthyResult.exact) {
      const lw = listWorthyResult.match;
      return reply(makeV2Card({
        title: '🎯 Tier del nivel',
        subtitle: `**Nivel:** ${lw.name}`,
        sections: [
          {
            title: 'Resultado',
            lines: [
              `List Worthy Tier: **${lw.tier}**`,
              nlwResult?.match ? `NLW Tier: **${nlwTier || 'No disponible'}**` : 'NLW Tier: No detectado',
              'Fuente principal: **List Worthy Sheet**',
            ],
          },
          ...(listWorthyResult.matches && listWorthyResult.matches.length > 1
            ? [{ title: 'Posibles coincidencias', lines: formatMatches(listWorthyResult.matches, item => `${item.name} — ${item.tier}`) }]
            : []),
        ],
        footer: 'Made by Evosen • GD Uruguay Bot',
      }));
    }

    let resolved;
    try {
      resolved = await resolveLevelIdByName(query);
    } catch (err) {
      console.error('Error consultando AREDL:', err);
      return interaction.editReply({ content: '❌ Error al consultar la API de AREDL. Intenta de nuevo más tarde.' }).catch(() => null);
    }

    if (!resolved.levelId) {
      if (resolved.matches?.length) {
        return reply(makeV2Card({
          title: '🔍 Varias coincidencias',
          subtitle: `Encontré varios niveles parecidos a '${query}'`,
          sections: [{
            title: 'Posibles coincidencias',
            lines: resolved.matches.map(level => level.name),
          }],
          footer: 'Escribe el nombre completo del nivel.',
        }));
      }

      return reply(makeV2Card({
        title: '❌ No encontrado',
        subtitle: `No encontré ningún nivel con el nombre '${query}'.`,
      }));
    }

    const levelObj = resolved.matches && resolved.matches[0] ? resolved.matches[0] : null;

    let detailed = levelObj;
    try {
      const resp = await fetch(`${AREDL_API}/api/aredl/levels/${resolved.levelId}`, { headers: { Accept: 'application/json' } });
      if (resp.ok) {
        const jd = await resp.json();
        detailed = Array.isArray(jd) ? jd[0] : jd.data || jd || detailed;
      }
    } catch (e) {
      console.warn('No se pudo obtener detalle por UUID:', e);
    }

    const tier = getTierFromLevel(detailed);
    let nlwTierFromAredl = null;
    try {
      const tagsText = (() => {
        if (!detailed) return '';
        if (Array.isArray(detailed.tags)) return detailed.tags.join(' ').toLowerCase();
        if (typeof detailed.tags === 'string') return detailed.tags.toLowerCase();
        return '';
      })();

      const descText = (detailed.description || '').toLowerCase();

      if (tagsText.includes('relentless') || descText.includes('relentless')) nlwTierFromAredl = 'Relentless';

      if (!nlwTierFromAredl) {
        const combined = `${tagsText} ${descText}`;
        const m = combined.match(/nlw[:\-\s_]*([a-zA-Z]+)/i);
        if (m && m[1]) nlwTierFromAredl = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
      }
    } catch (e) {
      // ignore
    }

    const resultLines = [];
    if (tier != null) {
      resultLines.push(`Tier/dificultad: **${String(tier)}**`);
      resultLines.push('UUID: `' + resolved.levelId + '`');
    } else {
      const available = detailed ? Object.keys(detailed).slice(0, 10) : [];
      resultLines.push('No pude determinar el tier de forma automática.');
      resultLines.push(available.length ? `Campos disponibles: ${available.join(', ')}` : 'No hay campos disponibles en la respuesta.');
    }

    return reply(makeV2Card({
      title: '🎯 AREDL - Tier del nivel',
      subtitle: `**Nivel:** ${resolved.levelName || query}`,
      sections: [
        {
          title: 'Resultado',
          lines: resultLines,
        },
        {
          title: 'Fuentes',
          lines: [
            `NLW Tier: **${nlwTier || nlwTierFromAredl || 'No detectado'}**`,
            `List Worthy Tier: **${listWorthyResult?.match?.tier || 'No detectado'}**`,
          ],
        },
        ...(resolved.matches && resolved.matches.length > 1
          ? [{ title: 'Posibles coincidencias', lines: formatMatches(resolved.matches, m => m.name) }]
          : []),
      ],
      footer: 'Made by Evosen • GD Uruguay Bot',
    }));
  },
};
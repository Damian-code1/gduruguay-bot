'use strict';

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const config = require('../config');

const AREDL_LEVELS_URL = 'https://api.aredl.net/v2/api/aredl/levels';

const LIST_WORTHY_SHEET_ID = '15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8';
const LIST_WORTHY_GID = '0';

const NLW_SHEET_ID = '1YxUE2kkvhT2E6AjnkvTf-o8iu_shSLbuFkEFcZOvieA';
const NLW_GID = '0';

const SHEET_CACHE_TTL_MS = 5 * 60 * 1000;
const AREDL_CACHE_TTL_MS = 5 * 60 * 1000;

const listWorthyCache = { fetchedAt: 0, entries: [] };
const nlwCache        = { fetchedAt: 0, entries: [] };
let aredlCache = { fetchedAt: 0, levels: [] };

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
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
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
  return String(text || '').replace(/\|/g, '').replace(/\uFE0F/g, '').trim();
}

function parseListWorthyEntries(csvText) {
  const lines = String(csvText || '').split(/\r?\n/);
  const entries = [];
  let currentTier = null;
  for (const line of lines) {
    if (!line?.trim()) continue;
    const cells = parseCsvLine(line).map(sanitizeCell);
    const marker = cells[0] || '';
    const tierHeaderCell = cells.find((c) => /\bTier$/i.test(c));
    if (tierHeaderCell) {
      currentTier = tierHeaderCell.replace(/\s*Tier$/i, '').trim();
      continue;
    }
    if (!currentTier || (marker && /^\d+$/.test(marker)) || !marker.includes('▶')) continue;
    const levelName = cells[1] || '';
    if (!levelName) continue;
    entries.push({ name: levelName, tier: currentTier, normalized: normalizeName(levelName) });
  }
  return entries;
}

// Usa la API oficial de Google Sheets con API key en vez del export CSV
// público — esto evita el problema de que un sheet compartido como
// "Comentador" (en vez de "Lector") no sea accesible sin sesión iniciada.
// Trae el sheet completo como un array de filas (array de arrays).
async function fetchSheetRows(sheetId, gid) {
  const apiKey = config.googleSheetsApiKey;
  if (!apiKey) {
    throw new Error('GOOGLE_SHEETS_API_KEY no está configurada en las variables de entorno');
  }

  // Necesitamos el nombre real de la hoja (tab) a partir del gid, ya que
  // la API v4 pide el nombre de la hoja en el range, no el gid numérico.
  const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?key=${apiKey}&fields=sheets.properties`;
  const metaResp = await fetch(metaUrl);
  if (!metaResp.ok) throw new Error(`HTTP ${metaResp.status} (metadata)`);
  const meta = await metaResp.json();
  const sheetMeta = (meta.sheets || []).find(
    (s) => String(s.properties?.sheetId) === String(gid),
  );
  const sheetName = sheetMeta?.properties?.title || 'Sheet1';

  const valuesUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}?key=${apiKey}`;
  const valuesResp = await fetch(valuesUrl);
  if (!valuesResp.ok) throw new Error(`HTTP ${valuesResp.status} (values)`);
  const data = await valuesResp.json();
  return data.values || []; // array de arrays (filas x columnas)
}

// Convierte las filas crudas de la API v4 al mismo formato de "línea CSV"
// que ya consumía parseListWorthyEntries, para no tener que reescribir el
// parser — reusa parseCsvLine reconstruyendo cada fila como línea CSV.
function rowsToCsvLines(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const str = String(cell ?? '');
          return str.includes(',') || str.includes('"')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(','),
    )
    .join('\n');
}

async function getListWorthyEntries() {
  const now = Date.now();
  if (listWorthyCache.entries.length && now - listWorthyCache.fetchedAt < SHEET_CACHE_TTL_MS) {
    return listWorthyCache.entries;
  }
  try {
    const rows = await fetchSheetRows(LIST_WORTHY_SHEET_ID, LIST_WORTHY_GID);
    const csvText = rowsToCsvLines(rows);
    const entries = parseListWorthyEntries(csvText);
    listWorthyCache.fetchedAt = now;
    listWorthyCache.entries = entries;
  } catch (err) {
    console.warn('List Worthy Sheet error:', err.message);
  }
  return listWorthyCache.entries;
}

async function getNlwEntries() {
  const now = Date.now();
  if (nlwCache.entries.length && now - nlwCache.fetchedAt < SHEET_CACHE_TTL_MS) {
    return nlwCache.entries;
  }
  try {
    const rows = await fetchSheetRows(NLW_SHEET_ID, NLW_GID);
    const csvText = rowsToCsvLines(rows);
    const entries = parseListWorthyEntries(csvText);
    nlwCache.fetchedAt = now;
    nlwCache.entries = entries;
  } catch (err) {
    console.warn('NLW Sheet error:', err.message);
  }
  return nlwCache.entries;
}

async function getAredlLevels() {
  const now = Date.now();
  if (aredlCache.levels.length && now - aredlCache.fetchedAt < AREDL_CACHE_TTL_MS) {
    return aredlCache.levels;
  }
  try {
    const resp = await fetch(AREDL_LEVELS_URL, { headers: { Accept: 'application/json' } });
    if (!resp.ok) {
      console.error(`[tier] AREDL HTTP ${resp.status}`);
      return aredlCache.levels;
    }
    const data = await resp.json();
    const levels = Array.isArray(data) ? data : data?.data || [];
    aredlCache = { fetchedAt: now, levels };
    return levels;
  } catch (err) {
    console.error('[tier] getAredlLevels excepción:', err);
    return aredlCache.levels;
  }
}

function matchLevels(levels, query) {
  const q = normalizeName(query);
  const exact = levels.find((l) => normalizeName(l.name) === q);
  if (exact) return { match: exact, matches: [exact], exact: true };
  const partial = levels.filter((l) => normalizeName(l.name).includes(q));
  if (!partial.length) return { match: null, matches: [], exact: false };
  if (partial.length > 1) return { match: null, matches: partial.slice(0, 10), exact: false };
  return { match: partial[0], matches: partial, exact: false };
}

function matchSheetEntry(entries, query) {
  const q = normalizeName(query);
  const exact = entries.find((e) => e.normalized === q);
  if (exact) return { match: exact, exact: true };
  const partial = entries.filter((e) => e.normalized.includes(q));
  if (partial.length === 1) return { match: partial[0], exact: false };
  return { match: null, exact: false };
}

function buildContainer({ title, levelName, lines, footer }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));

  if (levelName) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Nivel:** ${levelName}`));
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(lines.join('\n')));

  if (footer) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`> ${footer}`));
  }
  return container;
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

    let aredlLevels = [], listWorthyEntries = [], nlwEntries = [];
    try {
      [aredlLevels, listWorthyEntries, nlwEntries] = await Promise.all([
        getAredlLevels(),
        getListWorthyEntries(),
        getNlwEntries(),
      ]);
    } catch (err) {
      console.error('[tier] Error cargando fuentes:', err);
    }

    if (!aredlLevels.length) {
      const container = buildContainer({
        title: '⚠️ Servicio no disponible',
        lines: ['No pude obtener la lista de niveles de AREDL en este momento. Probá de nuevo en unos minutos.'],
      });
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((err) => {
        console.error('[tier] Error en editReply:', err);
      });
    }

    const aredlResult = matchLevels(aredlLevels, query);

    if (!aredlResult.match) {
      if (aredlResult.matches.length) {
        const container = buildContainer({
          title: '🔍 Varias coincidencias',
          lines: [`Encontré varios niveles parecidos a **"${query}"**:`, aredlResult.matches.map((l) => l.name).join('\n')],
        });
        return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
      }
      const container = buildContainer({
        title: '❌ No encontrado',
        lines: [`No encontré ningún nivel con el nombre **"${query}"**.`],
      });
      return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 });
    }

    const level = aredlResult.match;

    let nlwTier = null;
    const nlwMatch = matchSheetEntry(nlwEntries, level.name);
    if (nlwMatch.match) nlwTier = nlwMatch.match.tier;
    if (!nlwTier && level.nlw_tier) nlwTier = level.nlw_tier; 

    let listWorthyTier = null;
    const lwMatch = matchSheetEntry(listWorthyEntries, level.name);
    if (lwMatch.match) listWorthyTier = lwMatch.match.tier;

    const lines = [
      `**Posición AREDL:** #${level.position}`,
      `**NLW Tier:** ${nlwTier ? `**${nlwTier}**` : 'No detectado'}`,
      `**List Worthy Tier:** ${listWorthyTier ? `**${listWorthyTier}**` : 'No detectado'}`,
    ];

    const container = buildContainer({
      title: '🎯 Tier del nivel',
      levelName: level.name,
      lines,
      footer: 'Made by Evosen • GD Uruguay Bot',
    });

    return interaction.editReply({ components: [container], flags: MessageFlags.IsComponentsV2 }).catch((err) => {
      console.error('[tier] Error en editReply final:', err);
    });
  },
};
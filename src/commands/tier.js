'use strict';

const { SlashCommandBuilder, EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');
const config = require('../config');

const AREDL_LEVELS_URL = 'https://api.aredl.net/v2/api/aredl/levels';
const LIST_WORTHY_SHEET_ID = '15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8';
const LIST_WORTHY_GID = '0';
const LIST_WORTHY_CACHE_TTL_MS = 5 * 60 * 1000;

const listWorthyCache = { fetchedAt: 0, entries: [] };
let aredlCache = { fetchedAt: 0, levels: [] };
const AREDL_CACHE_TTL_MS = 5 * 60 * 1000;

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

async function getListWorthyEntries() {
  const now = Date.now();
  if (listWorthyCache.entries.length && now - listWorthyCache.fetchedAt < LIST_WORTHY_CACHE_TTL_MS) {
    return listWorthyCache.entries;
  }
  const url = `https://docs.google.com/spreadsheets/d/${LIST_WORTHY_SHEET_ID}/export?format=csv&gid=${LIST_WORTHY_GID}`;
  const resp = await fetch(url, { headers: { Accept: 'text/csv,*/*', 'User-Agent': 'Mozilla/5.0' } });
  if (!resp.ok) return listWorthyCache.entries;
  const csvText = await resp.text();
  const entries = parseListWorthyEntries(csvText);
  listWorthyCache.fetchedAt = now;
  listWorthyCache.entries = entries;
  return entries;
}

async function getAredlLevels() {
  const now = Date.now();
  if (aredlCache.levels.length && now - aredlCache.fetchedAt < AREDL_CACHE_TTL_MS) {
    return aredlCache.levels;
  }
  const resp = await fetch(AREDL_LEVELS_URL, { headers: { Accept: 'application/json' } });
  if (!resp.ok) return aredlCache.levels;
  const data = await resp.json();
  const levels = Array.isArray(data) ? data : data?.data || [];
  aredlCache = { fetchedAt: now, levels };
  return levels;
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

function matchListWorthy(entries, query) {
  const q = normalizeName(query);
  const exact = entries.find((e) => e.normalized === q);
  if (exact) return { match: exact, exact: true };
  const partial = entries.filter((e) => e.normalized.includes(q));
  if (partial.length === 1) return { match: partial[0], exact: false };
  return { match: null, exact: false };
}

function buildContainer({ title, lines, footer }) {
  const container = new ContainerBuilder();
  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${title}`));
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
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

    await interaction.deferReply({ flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2 }).catch(() => null);

    const [aredlLevels, listWorthyEntries] = await Promise.all([
      getAredlLevels(),
      getListWorthyEntries(),
    ]);

    const aredlResult = matchLevels(aredlLevels, query);

    if (!aredlResult.match) {
      if (aredlResult.matches.length) {
        const container = buildContainer({
          title: '🔍 Varias coincidencias',
          lines: [`Encontré varios niveles parecidos a **"${query}"**:`, aredlResult.matches.map((l) => l.name).join('\n')],
        });
        return interaction.editReply({ components: [container] });
      }
      const container = buildContainer({
        title: '❌ No encontrado',
        lines: [`No encontré ningún nivel con el nombre **"${query}"**.`],
      });
      return interaction.editReply({ components: [container] });
    }

    const level = aredlResult.match;
    let nlwTier = level.nlw_tier;
    let source = 'AREDL API';

    if (!nlwTier) {
      const lw = matchListWorthy(listWorthyEntries, level.name);
      if (lw.match) {
        nlwTier = lw.match.tier;
        source = 'List Worthy Sheet';
      }
    }

    const lines = [
      `**Nivel:** ${level.name}`,
      `**Posición AREDL:** #${level.position}`,
      `**NLW Tier:** ${nlwTier ? `**${nlwTier}**` : 'No detectado'}`,
      `**Fuente:** ${nlwTier ? source : 'No disponible en ninguna fuente'}`,
    ];

    const container = buildContainer({
      title: '🎯 Tier del nivel',
      lines,
      footer: 'Made by Evosen • GD Uruguay Bot',
    });

    return interaction.editReply({ components: [container] });
  },
};
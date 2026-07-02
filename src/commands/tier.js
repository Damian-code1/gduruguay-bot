'use strict';

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');

const AREDL_API = 'https://api.aredl.net/v2';
const NLW_API = 'https://nlw.oat.zone';
const LIST_WORTHY_SHEET_ID = '15YvW2rRQKlkNpdFMTaRt9CWefDkng6BSh6xRDXSw9r8';
const LIST_WORTHY_GID = '0';
const LIST_WORTHY_CACHE_TTL_MS = 5 * 60 * 1000;

const listWorthyCache = { fetchedAt: 0, entries: [] };

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

function matchEntries(entries, query, nameGetter) {
  const q = normalizeName(query);
  const exact = entries.find((e) => normalizeName(nameGetter(e)) === q);
  if (exact) return { match: exact, matches: [exact], exact: true };
  const partial = entries.filter((e) => normalizeName(nameGetter(e)).includes(q));
  if (!partial.length) return { match: null, matches: [], exact: false };
  if (partial.length > 1) return { match: null, matches: partial.slice(0, 10), exact: false };
  return { match: partial[0], matches: partial, exact: false };
}

async function fetchListWorthyByName(name) {
  const entries = await getListWorthyEntries().catch(() => []);
  if (!entries.length) return null;
  return matchEntries(entries, name, (e) => e.name);
}

async function fetchNlwByName(name) {
  const resp = await fetch(`${NLW_API}/list?type=all`, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!resp?.ok) return null;
  const list = await resp.json().catch(() => null);
  if (!Array.isArray(list)) return null;
  return matchEntries(list, name, (e) => e.name || '');
}

async function fetchAredlByName(name) {
  const resp = await fetch(`${AREDL_API}/api/aredl/levels`, { headers: { Accept: 'application/json' } }).catch(() => null);
  if (!resp?.ok) return null;
  const data = await resp.json().catch(() => null);
  const levels = Array.isArray(data) ? data : data?.data || [];
  return matchEntries(levels, name, (e) => e.name || '');
}

function getTierFromLevel(level) {
  if (!level) return null;
  const fields = ['tier', 'difficulty_tier', 'difficultyTier', 'difficulty', 'difficulty_name', 'difficulty_tier_name', 'difficultyRating'];
  for (const f of fields) {
    if (level[f] != null) return level[f];
  }
  if (level.difficulty?.tier) return level.difficulty.tier;
  if (level.difficulty?.name) return level.difficulty.name;
  return null;
}

module.exports = {
  visibility: 'public',
  data: new SlashCommandBuilder()
    .setName('tier')
    .setDescription('Devuelve el tier/dificultad de un nivel de Geometry Dash.')
    .addStringOption((opt) => opt.setName('nivel').setDescription('Nombre del nivel').setRequired(true)),

  async execute(interaction) {
    const query = interaction.options.getString('nivel', true).trim();
    await interaction.deferReply({ flags: 32768 | 64 }).catch(() => null);

    const [nlwResult, listWorthyResult, aredlResult] = await Promise.all([
      fetchNlwByName(query),
      fetchListWorthyByName(query),
      fetchAredlByName(query),
    ]);

    const nlwTier = nlwResult?.match?.tier ? String(nlwResult.match.tier).trim() : null;

    if (nlwResult?.match && nlwTier && nlwResult.exact) {
      const embed = new EmbedBuilder()
        .setTitle('🎯 Tier del nivel')
        .setColor(config.colors.primary)
        .setDescription(`**Nivel:** ${nlwResult.match.name}`)
        .addFields(
          { name: 'NLW Tier', value: `**${nlwTier}**`, inline: true },
          { name: 'List Worthy Tier', value: listWorthyResult?.match ? `**${listWorthyResult.match.tier}**` : 'No detectado', inline: true },
          { name: 'Fuente', value: 'NLW API' },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (listWorthyResult?.match && listWorthyResult.exact) {
      const lw = listWorthyResult.match;
      const embed = new EmbedBuilder()
        .setTitle('🎯 Tier del nivel')
        .setColor(config.colors.primary)
        .setDescription(`**Nivel:** ${lw.name}`)
        .addFields(
          { name: 'List Worthy Tier', value: `**${lw.tier}**`, inline: true },
          { name: 'NLW Tier', value: nlwTier ? `**${nlwTier}**` : 'No detectado', inline: true },
          { name: 'Fuente', value: 'List Worthy Sheet' },
        );
      return interaction.editReply({ embeds: [embed] });
    }

    if (!aredlResult?.match) {
      if (aredlResult?.matches?.length) {
        const embed = new EmbedBuilder()
          .setTitle('🔍 Varias coincidencias')
          .setColor(config.colors.warning)
          .setDescription(`Encontré varios niveles parecidos a **"${query}"**:\n${aredlResult.matches.map((l) => l.name).join('\n')}`);
        return interaction.editReply({ embeds: [embed] });
      }
      const embed = new EmbedBuilder()
        .setTitle('❌ No encontrado')
        .setColor(config.colors.danger)
        .setDescription(`No encontré ningún nivel con el nombre **"${query}"**.`);
      return interaction.editReply({ embeds: [embed] });
    }

    const tier = getTierFromLevel(aredlResult.match);
    const embed = new EmbedBuilder()
      .setTitle('🎯 AREDL — Tier del nivel')
      .setColor(config.colors.primary)
      .setDescription(`**Nivel:** ${aredlResult.match.name}`)
      .addFields(
        { name: 'Tier/dificultad', value: tier != null ? `**${tier}**` : 'No detectado' },
        { name: 'NLW Tier', value: nlwTier ? `**${nlwTier}**` : 'No detectado', inline: true },
        { name: 'List Worthy Tier', value: listWorthyResult?.match?.tier ? `**${listWorthyResult.match.tier}**` : 'No detectado', inline: true },
      );
    return interaction.editReply({ embeds: [embed] });
  },
};
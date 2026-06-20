const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const { getRemainingCooldown, setCooldown } = require('../utils/economyStore');
const { cooldownText } = require('../utils/economyHelpers');
const { getAura, addAura, getAuraLeaderboard, removeAuraData } = require('../utils/auraStore');
const { isStaff } = require('../utils/staffRolesStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const AURA_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const AURA_TOP_PAGE_SIZE = 10;
const AURA_TOP_LIMIT = 250;
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2 ?? 32768;
const auraTopSessions = new Map();

// 🌟 NOMBRES ESTÁNDAR DE ESCALAS NUMÉRICAS EN ESPAÑOL
const LARGE_SCALE_NAMES = [
  'millón',
  'billón',
  'trillón',
  'cuatrillón',
  'quintillón',
  'sextillón',
  'septillón',
  'octillón',
  'nonillón',
  'decillón',
  'undecillón',
  'duodecillón',
  'tredecillón',
  'cuatordecillón',
  'quindecillón',
  'sexdecillón',
  'septendecillón',
  'octodecillón',
  'novendecillón',
  'vigintillón',
  'unvigintillón',
  'duovigintillón',
  'tresvigintillón',
  'cuatuorvigintillón',
  'quinvigintillón',
  'sexvigintillón',
  'septenvigintillón',
  'octovigintillón',
  'novemvigintillón',
  'trigintillón',
];

// 🖤 NOMBRES PARA AURA NEGATIVA
const LARGE_SCALE_NAMES_NEGATIVE = [
  'millón',
  'billón',
  'trillón',
  'cuatrillón',
  'quintillón',
  'sextillón',
  'septillón',
  'octillón',
  'nonillón',
  'decillón',
  'undecillón',
  'duodecillón',
  'tredecillón',
  'cuatordecillón',
  'quindecillón',
  'sexdecillón',
  'septendecillón',
  'octodecillón',
  'novendecillón',
  'vigintillón',
  'unvigintillón',
  'duovigintillón',
  'tresvigintillón',
  'cuatuorvigintillón',
  'quinvigintillón',
  'sexvigintillón',
  'septenvigintillón',
  'octovigintillón',
  'novemvigintillón',
  'trigintillón',
];

const AURA_BUCKETS = [
  { weight: 24, label: 'Aura negativa', minText: 'muy baja', roll: () => -Math.round((1 + Math.random() * 9) * 10 ** randomInt(12, 36)) },
  { weight: 20, label: 'Aura baja', minText: 'normalita', roll: () => randomInt(80, 120_000) },
  { weight: 15, label: 'Aura decente', minText: 'decente', roll: () => randomInt(120_000, 120_000_000) },
  { weight: 12, label: 'Aura potente', minText: 'potente', roll: () => randomInt(120_000_000, 120_000_000_000) },
  { weight: 9, label: 'Aura épica', minText: 'épica', roll: () => randomInt(120_000_000_000, 120_000_000_000_000) },
  { weight: 6, label: 'Aura legendaria', minText: 'legendaria', roll: () => randomInt(120_000_000_000_000, 120_000_000_000_000_000) },
  { weight: 3, label: 'Aura cósmica', minText: 'cósmica', roll: () => Math.round((1 + Math.random() * 9) * 10 ** randomInt(18, 42)) },
  { weight: 1, label: 'Aura interdimensional', minText: 'interdimensional', roll: () => Math.round((1 + Math.random() * 9) * 10 ** randomInt(43, 90)) },
];

function createSessionId() {
  return `auratop_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAuraTopSession({ guildId, mode = 'combined' }) {
  const id = createSessionId();
  const session = {
    id,
    guildId,
    mode,
    page: 0,
    perPage: AURA_TOP_PAGE_SIZE,
    totalPages: 1,
    timer: null,
  };

  const refreshTimer = () => {
    if (session.timer) clearTimeout(session.timer);
    session.timer = setTimeout(() => auraTopSessions.delete(id), 10 * 60 * 1000);
    session.timer.unref?.();
  };

  refreshTimer();
  session.refreshTimer = refreshTimer;
  auraTopSessions.set(id, session);
  return session;
}

function getAuraTopSession(id) {
  return auraTopSessions.get(id) || null;
}

function deleteAuraTopSession(id) {
  const session = auraTopSessions.get(id);
  if (session?.timer) clearTimeout(session.timer);
  auraTopSessions.delete(id);
}

function clampPage(page, totalPages) {
  return Math.max(0, Math.min(Math.max(0, totalPages - 1), Number(page) || 0));
}

function fitText(value, width) {
  const text = String(value || '');
  if (text.length <= width) return text;
  if (width <= 1) return text.slice(0, width);
  return `${text.slice(0, width - 1)}…`;
}

function splitAuraTopPage(entries, page, perPage) {
  const start = page * perPage;
  return entries.slice(start, start + perPage);
}

function cleanupAuraEntries(guild, entries) {
  return entries.filter(entry => {
    const exists = guild.members.cache.has(entry.userId);

    if (!exists) {
      removeAuraData(guild.id, entry.userId);
    }

    return exists;
  });
}

function getPositiveAuraEntries(guild) {
  const entries = getAuraLeaderboard(guild.id, AURA_TOP_LIMIT, 'desc')
    .filter(entry => Number(entry.aura) > 0);

  return cleanupAuraEntries(guild, entries);
}

function getNegativeAuraEntries(guild) {
  const entries = getAuraLeaderboard(guild.id, AURA_TOP_LIMIT, 'asc')
    .filter(entry => Number(entry.aura) < 0);

  return cleanupAuraEntries(guild, entries);
}

function randomInt(min, max) {
  const low = Math.floor(min);
  const high = Math.floor(max);
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

function weightedPick(items) {
  const total = items.reduce((acc, item) => acc + item.weight, 0);
  const roll = Math.random() * total;
  let cursor = 0;

  for (const item of items) {
    cursor += item.weight;
    if (roll <= cursor) return item;
  }

  return items[items.length - 1];
}

function rollAuraDelta() {
  const totalWeight = AURA_BUCKETS.reduce((acc, bucket) => acc + bucket.weight, 0);
  const picked = weightedPick(AURA_BUCKETS);
  return {
    delta: picked.roll(),
    bucketLabel: picked.label,
    bucketChance: picked.weight / totalWeight,
    bucketWeight: picked.weight,
    totalWeight,
  };
}

// 🌈 FUNCIÓN DE FORMATO DE AURA CON NOMENCLATURAS COMPLETAS
function formatAura(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  const isNegative = number < 0;

  // Para números pequeños (menos de 1 millón), mostrar normales con "aura"
  if (abs < 1e6) {
    const formatted = new Intl.NumberFormat('es-UY').format(number);
    return `${formatted} aura`;
  }

  // Para números grandes, usar nomenclaturas
  const group = Math.floor(Math.log10(abs) / 3);
  const scaleIndex = group - 2;
  const scaleNames = isNegative ? LARGE_SCALE_NAMES_NEGATIVE : LARGE_SCALE_NAMES;

  if (scaleIndex >= 0 && scaleIndex < scaleNames.length) {
    const scaled = abs / (10 ** (group * 3));
    const formatted = scaled >= 100 ? scaled.toFixed(0) : scaled >= 10 ? scaled.toFixed(1) : scaled.toFixed(2);
    const prefix = number < 0 ? '-' : '';
    return `${prefix}${Number(formatted)} ${scaleNames[scaleIndex]} aura`;
  }

  // Para números aún más grandes que la escala disponible
  const exponent = Math.floor(Math.log10(abs));
  const mantissa = abs / (10 ** exponent);
  const formattedMantissa = mantissa >= 10 ? mantissa.toFixed(1) : mantissa.toFixed(2);
  return `${number < 0 ? '-' : ''}${formattedMantissa} × 10^${exponent} aura`;
}

// 📊 FUNCIÓN PARA MOSTRAR AURA CON NÚMERO EXACTO Y NOMENCLATURA
function formatAuraDetailed(value) {
  const number = Number(value) || 0;
  const abs = Math.abs(number);
  const isNegative = number < 0;

  // Para números pequeños (menos de 1 millón)
  if (abs < 1e6) {
    const formatted = new Intl.NumberFormat('es-UY').format(number);
    return { exact: formatted, nomenclature: 'aura' };
  }

  // Para números grandes
  const group = Math.floor(Math.log10(abs) / 3);
  const scaleIndex = group - 2;
  const scaleNames = isNegative ? LARGE_SCALE_NAMES_NEGATIVE : LARGE_SCALE_NAMES;

  // Número exacto sin formatear (con todos los ceros)
  const exactNumber = Math.abs(number).toFixed(0);
  const prefix = number < 0 ? '-' : '';
  const exactFormatted = `${prefix}${new Intl.NumberFormat('es-UY').format(exactNumber)}`;

  if (scaleIndex >= 0 && scaleIndex < scaleNames.length) {
    const nomenclature = scaleNames[scaleIndex];
    return { exact: exactFormatted, nomenclature };
  }

  // Para números aún más grandes
  const exponent = Math.floor(Math.log10(abs));
  const mantissa = abs / (10 ** exponent);
  const formattedMantissa = mantissa >= 10 ? mantissa.toFixed(1) : mantissa.toFixed(2);
  return { exact: exactFormatted, nomenclature: `× 10^${exponent}` };
}

function getResultTitle(delta) {
  if (delta < 0) return '🧿 Aura drenada';
  if (delta < 250_000) return '✨ Aura humilde';
  if (delta < 250_000_000) return '🌟 Aura en subida';
  if (delta < 250_000_000_000_000) return '🔥 Aura enorme';
  return '🛸 Aura absurda';
}

function formatChance(percent) {
  return `${(percent * 100).toFixed(2)}%`;
}

function buildAuraChanceText(roll) {
  if (!roll) return 'No disponible';
  const exactChance = 1 / Math.max(1, Math.abs(Number(roll.delta) || 1));
  return `Rango: **${roll.bucketLabel}** • Chance de salir este rango: **${formatChance(roll.bucketChance)}** • Chance exacta de este valor: **${exactChance.toExponential(2)}**`;
}

function parseAuraRemovalMode(rawMode) {
  const mode = String(rawMode || 'all').trim().toLowerCase();
  if (!mode || mode === 'all' || mode === 'todo' || mode === 'allura' || mode === 'reset' || mode === 'resetdata') {
    return { type: 'all' };
  }

  if (mode === 'half' || mode === 'medio' || mode === 'mitad') {
    return { type: 'half' };
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(mode)) {
    return { type: 'amount', amount: Math.floor(Math.abs(Number(mode))) };
  }

  return null;
}

function applyAuraRemoval(currentAura, removal) {
  const current = Number(currentAura) || 0;
  const absCurrent = Math.abs(current);

  if (removal?.type === 'all') {
    return { removed: absCurrent, nextAura: 0 };
  }

  const requested = removal?.type === 'half'
    ? Math.floor(absCurrent / 2)
    : Math.floor(Math.abs(Number(removal?.amount) || 0));

  const amount = Math.max(0, requested);
  const nextAura = current >= 0
    ? Math.max(0, current - amount)
    : Math.min(0, current + amount);

  return {
    removed: Math.abs(absCurrent - Math.abs(nextAura)),
    nextAura,
    amount,
  };
}

function makeV2Card({ title, subtitle = '', lines = [], footer = '' }) {
  const components = [{ type: 10, content: title.startsWith('#') ? title : `# ${title}` }];

  if (subtitle) {
    components.push({ type: 14 });
    components.push({ type: 10, content: subtitle });
  }

  if (lines.length) {
    components.push({ type: 14 });
    components.push({ type: 10, content: lines.join('\n') });
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

function sanitizeDisplayName(value) {
  return String(value || '').replace(/```/g, 'ˋˋˋ').replace(/\n/g, ' ').trim();
}

function getAuraName(guild, userId) {
  const member = guild?.members?.cache?.get(userId) || null;
  return sanitizeDisplayName(member?.displayName || member?.user?.username || `<@${userId}>`);
}

// 🎨 FUNCIÓN MEJORADA PARA FORMATEAR ENTRADAS CON EMOJIS DINÁMICOS
function getAuraEmoji(aura) {
  const num = Math.abs(Number(aura) || 0);
  if (num >= 120_000_000_000_000) return '🌟';
  if (num >= 120_000_000_000) return '✨';
  if (num >= 120_000_000) return '💫';
  if (num >= 120_000) return '⭐';
  return '🔷';
}

function formatAuraEntry(guild, entry, index) {
  const emoji = getAuraEmoji(entry.aura);
  return `${index + 1}. ${getAuraName(guild, entry.userId)} — ${emoji} **${formatAura(entry.aura)}**`;
}

function padText(value, width) {
  const text = String(value || '');
  return text + ' '.repeat(Math.max(0, width - text.length));
}

function buildAuraTopTable(guild, best, worst) {
  const leftHeader = 'Más aura positiva';
  const rightHeader = 'Más aura negativa';

  const left = best.map((entry, index) => formatAuraEntry(guild, entry, index));
  const right = worst.map((entry, index) => formatAuraEntry(guild, entry, index));
  const rows = Math.max(left.length, right.length);

  const leftWidth = Math.max(leftHeader.length, ...left.map(line => line.length), 8);
  const rightWidth = Math.max(rightHeader.length, ...right.map(line => line.length), 8);

  const table = [
    `${padText(leftHeader, leftWidth)} │ ${rightHeader}`,
    `${'-'.repeat(leftWidth)}─┼─${'-'.repeat(rightWidth)}`,
  ];

  for (let i = 0; i < rows; i += 1) {
    table.push(`${padText(left[i] || '', leftWidth)} │ ${right[i] || ''}`);
  }

  return `\`\`\`\n${table.join('\n')}\n\`\`\``;
}

function buildAuraTopColumnTable(guild, leftEntries, rightEntries, page, totalPages) {
  const leftHeader = '🏆 Más aura positiva';
  const rightHeader = '🕳️ Más aura negativa';
  const maxCellWidth = 35;

  const leftLines = leftEntries.length
    ? leftEntries.map((entry, index) => {
        const rank = page * AURA_TOP_PAGE_SIZE + index + 1;
        const emoji = getAuraEmoji(entry.aura);
        return fitText(`${String(rank).padStart(2, '0')}. ${fitText(getAuraName(guild, entry.userId), 12)} ${emoji} ${formatAura(entry.aura)}`, maxCellWidth);
      })
    : ['Sin datos.'];

  const rightLines = rightEntries.length
    ? rightEntries.map((entry, index) => {
        const rank = page * AURA_TOP_PAGE_SIZE + index + 1;
        const emoji = getAuraEmoji(entry.aura);
        return fitText(`${String(rank).padStart(2, '0')}. ${fitText(getAuraName(guild, entry.userId), 12)} ${emoji} ${formatAura(entry.aura)}`, maxCellWidth);
      })
    : ['Sin datos.'];

  const leftWidth = Math.min(Math.max(leftHeader.length, ...leftLines.map(line => line.length), 12), maxCellWidth);
  const rightWidth = Math.min(Math.max(rightHeader.length, ...rightLines.map(line => line.length), 12), maxCellWidth);
  const rows = Math.max(leftLines.length, rightLines.length);

  const table = [
    `${fitText(leftHeader, leftWidth)} │ ${rightHeader}`,
    `${'-'.repeat(leftWidth)}─┼─${'-'.repeat(rightWidth)}`,
  ];

  for (let i = 0; i < rows; i += 1) {
    table.push(`${padText(leftLines[i] || '', leftWidth)} │ ${rightLines[i] || ''}`);
  }

  table.push('', `📄 Página ${page + 1}/${totalPages}`);
  return `\`\`\`\n${table.join('\n')}\n\`\`\``;
}

function buildAuraTopButtons(session) {
  const disabled = session.totalPages <= 1;
  const page = session.page;
  const totalPages = session.totalPages;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`aura_top:${session.id}:first`)
      .setLabel('⏮')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId(`aura_top:${session.id}:prev`)
      .setLabel('⬅️ Anterior')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page === 0),
    new ButtonBuilder()
      .setCustomId(`aura_top:${session.id}:next`)
      .setLabel('Siguiente ➡️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`aura_top:${session.id}:last`)
      .setLabel('⏭')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`aura_top:${session.id}:close`)
      .setLabel('✕ Cerrar')
      .setStyle(ButtonStyle.Danger)
  );
}

function buildAuraTopPayload(guild, session) {
  const mode = String(session.mode || 'combined').toLowerCase();
  const positive = getPositiveAuraEntries(guild);
  const negative = getNegativeAuraEntries(guild);

  let embed = new EmbedBuilder().setColor(0x7289da);

  if (mode === 'positive' || mode === 'negative') {
    const entries = mode === 'positive' ? positive : negative;
    session.totalPages = Math.max(1, Math.ceil(entries.length / session.perPage));
    session.page = clampPage(session.page, session.totalPages);

    const pageEntries = splitAuraTopPage(entries, session.page, session.perPage);
    const titleEmoji = mode === 'positive' ? '🏆' : '🕳️';
    const titleText = mode === 'positive' ? 'Aura Top Positivo' : 'Aura Top Negativo';
    const descText = mode === 'positive'
      ? 'Los mortales con mayor aura positiva del servidor.'
      : 'Los seres más malditos del servidor.';

    embed = embed
      .setTitle(`${titleEmoji} ${titleText}`)
      .setDescription(descText)
      .setColor(mode === 'positive' ? 0xffd700 : 0xff1744)
      .addFields({
        name: `${mode === 'positive' ? '✨' : '🧿'} Ranking`,
        value: pageEntries.length
          ? pageEntries.map((entry, index) => {
              const rank = session.page * session.perPage + index + 1;
              const emoji = getAuraEmoji(entry.aura);
              return `**${String(rank).padStart(2, '0')}.**  <@${entry.userId}> ${emoji} **${formatAura(entry.aura)}**`;
            }).join('\n')
          : '```Vacío```',
      })
      .setThumbnail(guild?.iconURL?.({ dynamic: true }))
      .setFooter({ text: `Página ${session.page + 1}/${session.totalPages} • ${guild?.name || 'Servidor desconocido'}` });
  } else {
    session.totalPages = Math.max(1, Math.ceil(Math.max(positive.length, negative.length) / session.perPage));
    session.page = clampPage(session.page, session.totalPages);

    const left = splitAuraTopPage(positive, session.page, session.perPage);
    const right = splitAuraTopPage(negative, session.page, session.perPage);
    
    const leftValue = left.length
      ? left.map((entry, index) => {
          const rank = session.page * session.perPage + index + 1;
          return `${String(rank).padStart(2, '0')}. <@${entry.userId}> — **${formatAura(entry.aura)}**`;
        }).join('\n')
      : 'Vacío.';

    const rightValue = right.length
      ? right.map((entry, index) => {
          const rank = session.page * session.perPage + index + 1;
          return `${String(rank).padStart(2, '0')}. <@${entry.userId}> — **${formatAura(entry.aura)}**`;
        }).join('\n')
      : 'Vacío.';

    embed = embed
      .setTitle('🏆 Aura Top')
      .setDescription('Ranking de aura positiva y negativa del servidor.')
      .setColor(0x5865F2)
      .addFields(
        {
          name: 'Más aura positiva',
          value: leftValue,
          inline: true,
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: true,
        },
        {
          name: 'Más aura negativa',
          value: rightValue,
          inline: true,
        },
      )
      .setFooter({ text: `Página ${session.page + 1}/${session.totalPages} • Positiva a la izquierda • Negativa a la derecha` });
  }

  return {
    embeds: [embed],
    components: [buildAuraTopButtons(session)],
  };
}

async function handleAuraTopInteraction(interaction) {
  const parts = String(interaction.customId || '').split(':');
  if (parts[0] !== 'aura_top' || parts.length < 3) return false;

  const session = getAuraTopSession(parts[1]);
  if (!session) {
    await interaction.reply({ content: '❌ Esta tabla de aura expiró.', ephemeral: true }).catch(() => null);
    return true;
  }

  const action = parts[2];
  if (!interaction.isButton()) return false;

  session.refreshTimer?.();

  if (action === 'close') {
    deleteAuraTopSession(session.id);
    await interaction.deferUpdate().catch(() => null);
    await interaction.message.edit({
      embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle('🏁 Tabla de aura cerrada.').setDescription('Controles desactivados.')],
      components: [],
    }).catch(() => null);
    return true;
  }

  if (action === 'first') session.page = 0;
  else if (action === 'prev') session.page = Math.max(0, session.page - 1);
  else if (action === 'next') session.page = Math.min(session.totalPages - 1, session.page + 1);
  else if (action === 'last') session.page = session.totalPages - 1;
  else return false;

  const payload = buildAuraTopPayload(interaction.guild, session);
  await interaction.deferUpdate().catch(() => null);
  await interaction.message.edit(payload).catch(() => null);
  return true;
}

function buildTopEmbed(guildId, title, entries, color) {
  if (!entries.length) {
    return new EmbedBuilder().setTitle(title).setColor(color).setDescription('Todavía no hay datos de aura en este servidor.');
  }

  const lines = entries.map((entry, index) => `${index + 1}. <@${entry.userId}> — **${formatAura(entry.aura)} aura**`);
  return new EmbedBuilder().setTitle(title).setColor(color).setDescription(lines.join('\n')).setTimestamp();
}

function buildTopColumn(entries, emptyText = 'Sin datos.') {
  if (!entries.length) return emptyText;
  return entries.map((entry, index) => `${index + 1}. <@${entry.userId}> — **${formatAura(entry.aura)} aura**`).join('\n');
}

function buildHelpEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Ayuda de Aura')
    .setColor(0x5865F2)
    .setDescription([
      '`-aura` → Reclama tu aura diaria (24h).',
      '`-aura status` → Ve tu aura actual y cooldown.',
      '`-aura top` → Muestra aura positiva y negativa.',
      '`-aura top positive [n]` → Ranking de aura positiva.',
      '`-aura top negative [n]` → Ranking de aura negativa.',
      '`-aura remove <@user|userId> [half|all|monto]` → Elimina aura de un usuario (staff/admin).',
      '`-aura resetdata <@user|userId>` → Borra toda la data de aura (staff/admin).',
      '`-aura help` → Muestra esta ayuda.',
    ].join('\n'))
    .setTimestamp();
}

async function safeEditOrReply(baseMessage, payload) {
  const edited = await baseMessage.edit(payload).catch(() => null);
  if (edited) return edited;
  return baseMessage.channel.send(payload).catch(() => null);
}

async function animateMessage(messageHandle, frames, delayMs) {
  let current = messageHandle;

  for (const frame of frames) {
    await wait(delayMs);
    const updated = await current.edit(frame).catch(() => null);
    if (!updated) break;
    current = updated;
  }

  return current;
}

module.exports = {
  name: 'aura',
  aliases: ['aur'],
  help: {
    purpose: 'Daily de aura con resultados random (sí, puede salir negativa).',
    category: '🎮 Diversión',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'help' || sub === 'ayuda') {
      return message.reply(makeV2Card({
        title: '📖 Ayuda de Aura',
        subtitle: 'Comandos disponibles del sistema de aura.',
        lines: [
          '`-aura` → Reclama tu aura diaria (24h).',
          '`-aura status` → Ve tu aura actual y cooldown.',
          '`-aura top` → Muestra aura positiva y negativa.',
          '`-aura top positive [n]` → Ranking de aura positiva.',
          '`-aura top negative [n]` → Ranking de aura negativa.',
          '`-aura remove <@user|userId> [half|all|monto]` → Elimina aura de un usuario.',
          '`-aura resetdata <@user|userId>` → Borra toda la data de aura.',
        ],
        footer: 'Made by Evosen • GD Uruguay Bot',
      }));
    }

    if (sub === 'top' || sub === 'leaderboard' || sub === 'lb') {
      const view = String(args?.[1] || '').toLowerCase();
      const session = createAuraTopSession({ guildId, mode: 'combined' });

      if (view === 'positive' || view === 'pos' || view === '+') {
        session.mode = 'positive';
        return message.reply(buildAuraTopPayload(message.guild, session));
      }

      if (view === 'negative' || view === 'neg' || view === '-') {
        session.mode = 'negative';
        return message.reply(buildAuraTopPayload(message.guild, session));
      }

      return message.reply(buildAuraTopPayload(message.guild, session));
    }

    if (sub === 'status' || sub === 'me' || sub === 'info') {
      const current = getAura(guildId, userId);
      const remaining = getRemainingCooldown(guildId, userId, 'aura_daily', AURA_COOLDOWN_MS);
      const auraDetailed = formatAuraDetailed(current.aura);

      return message.reply(makeV2Card({
        title: '🧿 Tu Aura',
        subtitle: `Aura total: **${auraDetailed.exact}**`,
        lines: [
          `Nomenclatura: **${auraDetailed.nomenclature} aura**`,
          '',
          remaining > 0
            ? `Próximo claim en: **${cooldownText(remaining)}**`
            : 'Ya podés usar `-aura` ahora mismo.',
        ],
        footer: 'Made by Evosen • GD Uruguay Bot',
      }));
    }

    if (sub === 'remove' || sub === 'resetdata') {
      const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
      if (!canManage) {
        return message.reply(makeV2Card({
          title: '❌ Sin permisos',
          subtitle: 'Solo staff/admin puede usar este subcomando.',
        }));
      }

      const target = await resolveUserTarget(message, args?.[1]);
      if (!target) {
        return message.reply(makeV2Card({
          title: '❌ Uso inválido',
          subtitle: `Uso: \`-aura remove <@user|userId> [half|all|monto]\` o \`-aura resetdata <@user|userId>\`.`,
        }));
      }

      if (sub === 'resetdata') {
        const removed = removeAuraData(guildId, target.id);
        setCooldown(guildId, target.id, 'aura_daily', 0);

        return message.reply(makeV2Card({
          title: '🧹 Aura reseteada',
          lines: [
            `Usuario: <@${target.id}>`,
            `Datos de aura: **${removed ? 'borrados' : 'no había datos'}**`,
            'Cooldown de aura: **reseteado**',
          ],
          footer: 'Made by Evosen • GD Uruguay Bot',
        }));
      }

      const removal = parseAuraRemovalMode(args?.[2]);
      if (!removal) {
        return message.reply(makeV2Card({
          title: '❌ Uso inválido',
          subtitle: `Uso: \`-aura remove <@user|userId> [half|all|monto]\`.`,
        }));
      }

      const current = getAura(guildId, target.id);
      const applied = applyAuraRemoval(current.aura, removal);

      if (applied.removed <= 0 && removal.type !== 'all') {
        return message.reply(makeV2Card({
          title: 'ℹ️ Sin cambios',
          lines: [
            `Usuario: <@${target.id}>`,
            `Aura actual: **${formatAura(current.aura)}**`,
          ],
          footer: 'No había aura suficiente para remover.',
        }));
      }

      const delta = applied.nextAura - current.aura;
      if (delta !== 0) {
        addAura(guildId, target.id, delta);
      }

      setCooldown(guildId, target.id, 'aura_daily', 0);

      return message.reply(makeV2Card({
        title: '🧹 Aura modificada',
        lines: [
          `Usuario: <@${target.id}>`,
          `Aura actual: **${formatAura(current.aura)}**`,
          `Aura removida: **${formatAura(applied.removed)}**`,
          `Aura restante: **${formatAura(applied.nextAura)}**`,
          'Cooldown de aura: **reseteado**',
        ],
        footer: 'Made by Evosen • GD Uruguay Bot',
      }));
    }

    const remaining = getRemainingCooldown(guildId, userId, 'aura_daily', AURA_COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply(makeV2Card({
        title: '⏳ Aura en cooldown',
        subtitle: `Podés reclamar tu aura de nuevo en **${cooldownText(remaining)}**.`,
      }));
    }

    const basePayload = makeV2Card({
      title: '🌀 Calibrando aura...',
      subtitle: `**${message.author.username}** está sintonizando vibras cósmicas...`,
      footer: 'Made by Evosen • GD Uruguay Bot',
    });

    const resultMsg = await message.reply(basePayload);

    const frames = [
      '🔮 Leyendo vibras del multiverso...',
      '🌌 Reajustando el campo energético...',
      '🧠 Calculando presencia y cringe...',
      '⚡ Compilando aura final...',
    ];

    const animatedMsg = await animateMessage(
      resultMsg,
      frames.map(frame => makeV2Card({
        title: '🌀 Calibrando aura...',
        subtitle: frame,
        footer: 'Made by Evosen • GD Uruguay Bot',
      })),
      700
    );

    const current = getAura(guildId, userId);
    const roll = rollAuraDelta();
    const { delta } = roll;
    const next = addAura(guildId, userId, delta);

    setCooldown(guildId, userId, 'aura_daily', Date.now());

    const resultPayload = makeV2Card({
      title: getResultTitle(delta),
      subtitle: [
        `**${message.author.username}** obtuvo: **${delta >= 0 ? '+' : ''}${formatAura(delta)}**`,
        buildAuraChanceText(roll),
        '',
        `Aura total: **${formatAura(next.aura)}**`,
        current.aura !== next.aura ? `Antes tenías: ${formatAura(current.aura)}` : null,
      ].filter(Boolean).join('\n'),
      footer: 'Made by Evosen • GD Uruguay Bot',
    });

    const finalSent = await safeEditOrReply(animatedMsg || resultMsg, resultPayload);
    if (!finalSent) {
      return message.reply(resultPayload).catch(() => null);
    }

    return finalSent;
  },
  handleAuraTopInteraction,
};
const COLOR_ALIASES = {
  red: '#e74c3c',
  darkred: '#8b0000',
  lightred: '#ff7f7f',
  crimson: '#dc143c',
  pink: '#ff69b4',
  hotpink: '#ff1493',
  lightpink: '#ffb6c1',
  magenta: '#ff00ff',
  fuchsia: '#ff00ff',
  purple: '#9b59b6',
  darkpurple: '#5b2c6f',
  lightpurple: '#c39bd3',
  violet: '#8e44ad',
  lavender: '#e6e6fa',
  indigo: '#4b0082',
  blue: '#3498db',
  darkblue: '#1f3a93',
  lightblue: '#85c1e9',
  skyblue: '#87ceeb',
  cyan: '#00ffff',
  aqua: '#00ffff',
  teal: '#16a085',
  turquoise: '#40e0d0',
  green: '#2ecc71',
  darkgreen: '#1e8449',
  lightgreen: '#7dcea0',
  lime: '#00ff00',
  olive: '#808000',
  mint: '#98ff98',
  yellow: '#f1c40f',
  gold: '#ffd700',
  orange: '#f39c12',
  darkorange: '#d35400',
  lightorange: '#f8c471',
  brown: '#8e6e53',
  beige: '#f5f5dc',
  white: '#ffffff',
  silver: '#bdc3c7',
  gray: '#95a5a6',
  grey: '#95a5a6',
  darkgray: '#616a6b',
  darkgrey: '#616a6b',
  lightgray: '#d5dbdb',
  lightgrey: '#d5dbdb',
  black: '#2c3e50',
  navy: '#000080',
  maroon: '#800000',
};

const PHRASE_ALIASES = {
  'dark red': 'darkred',
  'light red': 'lightred',
  'dark purple': 'darkpurple',
  'light purple': 'lightpurple',
  'dark blue': 'darkblue',
  'light blue': 'lightblue',
  'sky blue': 'skyblue',
  'dark green': 'darkgreen',
  'light green': 'lightgreen',
  'dark orange': 'darkorange',
  'light orange': 'lightorange',
  'dark gray': 'darkgray',
  'dark grey': 'darkgrey',
  'light gray': 'lightgray',
  'light grey': 'lightgrey',
};

function normalizeColorKey(input) {
  return String(input || '')
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

function compactKey(input) {
  return normalizeColorKey(input).replace(/\s+/g, '');
}

function toHexFromRgbValues(r, g, b) {
  const rr = Math.max(0, Math.min(255, Number(r) || 0));
  const gg = Math.max(0, Math.min(255, Number(g) || 0));
  const bb = Math.max(0, Math.min(255, Number(b) || 0));
  return `#${[rr, gg, bb].map(value => value.toString(16).padStart(2, '0')).join('')}`;
}

function parseDirectColor(input) {
  const raw = String(input || '').trim();

  const hexMatch = raw.match(/^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/);
  if (hexMatch) {
    const clean = hexMatch[1].length === 3
      ? hexMatch[1].split('').map(char => `${char}${char}`).join('')
      : hexMatch[1];
    return `#${clean.toLowerCase()}`;
  }

  const rgbMatch = raw.match(/^rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i);
  if (rgbMatch) {
    return toHexFromRgbValues(rgbMatch[1], rgbMatch[2], rgbMatch[3]);
  }

  return null;
}

function levenshtein(a, b) {
  const left = String(a || '');
  const right = String(b || '');
  const matrix = Array.from({ length: left.length + 1 }, () => Array(right.length + 1).fill(0));

  for (let i = 0; i <= left.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= right.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= left.length; i++) {
    for (let j = 1; j <= right.length; j++) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[left.length][right.length];
}

function resolveNamedColor(input) {
  const normalized = normalizeColorKey(input);
  if (!normalized) return null;

  const phraseKey = PHRASE_ALIASES[normalized] || normalized;
  const compact = compactKey(phraseKey);

  if (COLOR_ALIASES[compact]) {
    return { hex: COLOR_ALIASES[compact], name: compact, fuzzy: false };
  }

  const allNames = Object.keys(COLOR_ALIASES);
  let best = null;

  for (const candidate of allNames) {
    const distance = levenshtein(compact, candidate);
    const partialBoost = candidate.includes(compact) || compact.includes(candidate) ? -1 : 0;
    const score = distance + partialBoost;

    if (!best || score < best.score) {
      best = { candidate, score };
    }
  }

  if (!best) return null;

  const maxAllowed = Math.max(2, Math.floor(best.candidate.length * 0.45));
  if (best.score > maxAllowed) return null;

  return { hex: COLOR_ALIASES[best.candidate], name: best.candidate, fuzzy: true };
}

function resolveRoleColor(input) {
  const direct = parseDirectColor(input);
  if (direct) {
    return { ok: true, hex: direct, source: 'direct' };
  }

  const named = resolveNamedColor(input);
  if (named) {
    return { ok: true, hex: named.hex, source: named.fuzzy ? 'fuzzy-name' : 'name', matchedName: named.name };
  }

  return { ok: false, hex: null, source: null };
}

module.exports = {
  resolveRoleColor,
};

'use strict';


// Catálogo fijo de departamentos de Uruguay + alias conocidos para fuzzy matching.
const DEPARTMENTS = [
  { name: 'Montevideo', aliases: ['mdvd', 'mvd', 'mont', 'montevido'] },
  { name: 'Canelones', aliases: ['canelone', 'canel', 'can'] },
  { name: 'San José', aliases: ['sanjose', 'san jose', 'sj'] },
  { name: 'Maldonado', aliases: ['maldonao', 'maldo'] },
  { name: 'Rocha', aliases: ['rcha', 'roccha'] },
  { name: 'Lavalleja', aliases: ['lavallelelja', 'lavalja', 'laval'] },
  { name: 'Florida', aliases: ['floridaa', 'flor'] },
  { name: 'Durazno', aliases: ['durazno', 'durazo'] },
  { name: 'Flores', aliases: ['flores', 'flore'] },
  { name: 'Colonia', aliases: ['colonia', 'colon'] },
  { name: 'Soriano', aliases: ['soriano'] },
  { name: 'Río Negro', aliases: ['rio negro', 'rionegro', 'rn'] },
  { name: 'Paysandú', aliases: ['paysandu', 'paysandú', 'paysa'] },
  { name: 'Salto', aliases: ['salto', 'slt'] },
  { name: 'Artigas', aliases: ['artigas', 'artig'] },
  { name: 'Rivera', aliases: ['rivera', 'rv'] },
  { name: 'Tacuarembó', aliases: ['tacuarembo', 'tacuarembó', 'tacua', 'tac'] },
  { name: 'Cerro Largo', aliases: ['cerro largo', 'cerrolargo', 'cl'] },
  { name: 'Treinta y Tres', aliases: ['treinta y tres', 'treintaytres', 'tt'] },
];

const FUZZY_THRESHOLD = 2; 

function normalize(text) {
  return String(text || '').toLowerCase().trim();
}

/** Distancia de Levenshtein clásica (programación dinámica). */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }

  return dp[m][n];
}

/**
 * Busca un departamento por nombre exacto, alias exacto, o similitud (fuzzy).
 * @param {string} input
 * @returns {{name: string, aliases: string[]} | null}
 */
function findDepartment(input) {
  const normalizedInput = normalize(input);
  if (!normalizedInput) return null;

  // Match exacto contra el mensaje completo.
  const exactMatch = DEPARTMENTS.find((dept) => normalize(dept.name) === normalizedInput);
  if (exactMatch) return exactMatch;

  for (const dept of DEPARTMENTS) {
    if (dept.aliases.some((alias) => normalize(alias) === normalizedInput)) return dept;
  }

  // Match exacto de alguna palabra del mensaje (ej. "Yo soy de Montevideo").
  const words = normalizedInput.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const wordExact = DEPARTMENTS.find((dept) => normalize(dept.name) === word);
    if (wordExact) return wordExact;
    for (const dept of DEPARTMENTS) {
      if (dept.aliases.some((alias) => normalize(alias) === word)) return dept;
    }
  }

  // Fuzzy matching por distancia de Levenshtein — igual criterio que la
  // versión anterior que funcionaba: máximo 2 caracteres de diferencia,
  // probado contra el mensaje completo y contra cada palabra por separado.
  const candidates = [normalizedInput, ...words].filter((c) => c.length >= 3);
  if (!candidates.length) return null;

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    for (const dept of DEPARTMENTS) {
      const nameDistance = levenshteinDistance(candidate, normalize(dept.name));
      if (nameDistance < bestDistance && nameDistance <= FUZZY_THRESHOLD) {
        bestMatch = dept;
        bestDistance = nameDistance;
      }

      for (const alias of dept.aliases) {
        const aliasDistance = levenshteinDistance(candidate, normalize(alias));
        if (aliasDistance < bestDistance && aliasDistance <= FUZZY_THRESHOLD) {
          bestMatch = dept;
          bestDistance = aliasDistance;
        }
      }
    }
  }

  return bestMatch;
}

function getAllDepartments() {
  return DEPARTMENTS.map((d) => d.name);
}

// ---------------------------------------------------------------------
// Canal de escucha — sigue en MySQL porque es 1 solo valor por server,
// simple y liviano. Lo único que se guarda es el ID del canal.
// ---------------------------------------------------------------------

const { query } = require('./database');

async function getDepartmentChannel(guildId) {
  const [rows] = await query('SELECT channel_id FROM department_channel WHERE guild_id = ?', [guildId]);
  return rows[0]?.channel_id || null;
}

async function setDepartmentChannel(guildId, channelId) {
  await query(
    `INSERT INTO department_channel (guild_id, channel_id) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE channel_id = VALUES(channel_id)`,
    [guildId, channelId],
  );
}

async function clearDepartmentChannel(guildId) {
  await query('DELETE FROM department_channel WHERE guild_id = ?', [guildId]);
}

module.exports = {
  DEPARTMENTS,
  findDepartment,
  getAllDepartments,
  getDepartmentChannel,
  setDepartmentChannel,
  clearDepartmentChannel,
};

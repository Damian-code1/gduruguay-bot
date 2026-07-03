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

// Palabras cortas comunes que NO deben disparar fuzzy match aunque estén a
// poca distancia de un departamento chico (ej. "tt", "sj", "rn" son alias
// legítimos, pero texto casual corto no debería matchear por accidente).
const MIN_LEN_FOR_FUZZY = 4;

/**
 * Busca un departamento por nombre exacto, alias exacto, o por tipeo
 * levemente incorrecto (fuzzy matching con distancia de Levenshtein).
 * El fuzzy solo aplica a palabras de al menos MIN_LEN_FOR_FUZZY caracteres,
 * para no disparar con mensajes cortos random ("xdd", "tt", "sj").
 * @param {string} input
 * @returns {{name: string, aliases: string[]} | null}
 */
function findDepartment(input) {
  const normalizedInput = normalize(input);
  if (!normalizedInput) return null;

  // 1. Match exacto contra el mensaje completo (nombre o alias).
  const exactMatch = DEPARTMENTS.find((dept) => normalize(dept.name) === normalizedInput);
  if (exactMatch) return exactMatch;

  for (const dept of DEPARTMENTS) {
    if (dept.aliases.some((alias) => normalize(alias) === normalizedInput)) return dept;
  }

  // 2. Match exacto de alguna palabra del mensaje completo (ej. "Yo soy de Montevideo").
  const words = normalizedInput.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    for (const word of words) {
      const wordExact = DEPARTMENTS.find((dept) => normalize(dept.name) === word);
      if (wordExact) return wordExact;
      for (const dept of DEPARTMENTS) {
        if (dept.aliases.some((alias) => normalize(alias) === word)) return dept;
      }
    }
  }

  // 3. Fuzzy match: tolera errores de tipeo leves ("soarino" -> "soriano").
  // Solo se evalúa contra el mensaje completo o palabras sueltas de
  // longitud razonable, comparando contra el nombre principal de cada
  // departamento (no contra alias cortos, para evitar falsos positivos).
  const candidates = words.length > 1 ? [normalizedInput, ...words] : [normalizedInput];
  let bestMatch = null;
  let bestDistance = Infinity;

  for (const candidate of candidates) {
    if (candidate.length < MIN_LEN_FOR_FUZZY) continue;
    for (const dept of DEPARTMENTS) {
      const deptNameNorm = normalize(dept.name);
      const distance = levenshteinDistance(candidate, deptNameNorm);
      // El umbral escala levemente con la longitud del nombre para no ser
      // ni muy estricto en nombres largos ni muy permisivo en cortos.
      const threshold = Math.min(FUZZY_THRESHOLD + Math.floor(deptNameNorm.length / 6), 3);
      if (distance <= threshold && distance < bestDistance) {
        bestDistance = distance;
        bestMatch = dept;
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

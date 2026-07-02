'use strict';

const { query } = require('./database');

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

const FUZZY_SIMILARITY_MIN = 0.9; 

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(a, b);
  return 1 - dist / maxLen;
}

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

  // Match exacto contra el mensaje completo (comportamiento original).
  const exactMatch = DEPARTMENTS.find((dept) => normalize(dept.name) === normalizedInput);
  if (exactMatch) return exactMatch;

  for (const dept of DEPARTMENTS) {
    if (dept.aliases.some((alias) => normalize(alias) === normalizedInput)) return dept;
  }

  // Match exacto de alguna PALABRA del mensaje (ej. "Yo soy de Montevideo").
  const words = normalizedInput.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const wordExact = DEPARTMENTS.find((dept) => normalize(dept.name) === word);
    if (wordExact) return wordExact;
    for (const dept of DEPARTMENTS) {
      if (dept.aliases.some((alias) => normalize(alias) === word)) return dept;
    }
  }

  // Fuzzy: probar el mensaje completo Y cada palabra individual por separado,
  // así "Montevido" (typo) matchea aunque esté dentro de una frase.
  const candidates = [normalizedInput, ...words].filter((c) => c.length >= 3);
  if (!candidates.length) return null;

  let bestMatch = null;
  let bestSimilarity = 0;

  for (const candidate of candidates) {
    for (const dept of DEPARTMENTS) {
      const nameSim = similarity(candidate, normalize(dept.name));
      if (nameSim > bestSimilarity && nameSim >= FUZZY_SIMILARITY_MIN) {
        bestMatch = dept;
        bestSimilarity = nameSim;
      }

      for (const alias of dept.aliases) {
        const aliasSim = similarity(candidate, normalize(alias));
        if (aliasSim > bestSimilarity && aliasSim >= FUZZY_SIMILARITY_MIN) {
          bestMatch = dept;
          bestSimilarity = aliasSim;
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
// Persistencia (MySQL) — rol asignado a cada departamento, por servidor
// ---------------------------------------------------------------------

async function getDepartmentRoles(guildId) {
  const [rows] = await query('SELECT department_name, role_id FROM department_roles WHERE guild_id = ?', [guildId]);
  const map = {};
  for (const row of rows) map[row.department_name] = row.role_id;
  return map;
}

async function getDepartmentRole(guildId, departmentName) {
  const [rows] = await query(
    'SELECT role_id FROM department_roles WHERE guild_id = ? AND department_name = ?',
    [guildId, departmentName],
  );
  return rows[0]?.role_id || null;
}

async function setDepartmentRole(guildId, departmentName, roleId) {
  await query(
    `INSERT INTO department_roles (guild_id, department_name, role_id) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)`,
    [guildId, departmentName, roleId],
  );
}

async function removeDepartmentRole(guildId, departmentName) {
  const [result] = await query(
    'DELETE FROM department_roles WHERE guild_id = ? AND department_name = ?',
    [guildId, departmentName],
  );
  return result.affectedRows > 0;
}

/** Devuelve el listado de todos los role_id configurados como departamento (para poder removerlos al cambiar). */
async function getAllConfiguredRoleIds(guildId) {
  const roles = await getDepartmentRoles(guildId);
  return Object.values(roles).filter(Boolean);
}

// ---------------------------------------------------------------------
// Persistencia (MySQL) — canal de escucha para auto-detección
// ---------------------------------------------------------------------

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
  getDepartmentRoles,
  getDepartmentRole,
  setDepartmentRole,
  removeDepartmentRole,
  getAllConfiguredRoleIds,
  getDepartmentChannel,
  setDepartmentChannel,
  clearDepartmentChannel,
};

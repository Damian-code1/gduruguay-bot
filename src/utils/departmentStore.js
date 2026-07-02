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
 * Busca un departamento por nombre EXACTO o alias EXACTO únicamente.
 * Sin fuzzy matching libre: mensajes cortos random ("xdd", "que paso",
 * "tt" sin querer decir Treinta y Tres) no deben disparar una asignación
 * de rol por accidente. El fuzzy matching se reserva solo para la
 * búsqueda del ROL en Discord (que puede tener emojis/prefijos), no para
 * interpretar qué quiso decir el usuario.
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

  // Match exacto de alguna palabra del mensaje completo (ej. "Yo soy de Montevideo"),
  // pero SOLO si el mensaje tiene más de 1 palabra — si el usuario escribió
  // una sola palabra corta ("tt", "mont") ya se comparó arriba como
  // normalizedInput completo, así que llegar acá con 1 sola palabra
  // significa que no matcheó y no debe forzarse nada más.
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

  return null;
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

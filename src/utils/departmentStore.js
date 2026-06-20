const fs = require('fs');
const path = require('path');

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
  { name: 'Soriano', aliases: ['soriano', 'soriano'] },
  { name: 'Río Negro', aliases: ['rio negro', 'rionegro', 'rn'] },
  { name: 'Paysandú', aliases: ['paysandu', 'paysandú', 'paysa'] },
  { name: 'Salto', aliases: ['salto', 'slt'] },
  { name: 'Artigas', aliases: ['artigas', 'artig'] },
  { name: 'Rivera', aliases: ['rivera', 'rv'] },
  { name: 'Tacuarembó', aliases: ['tacuarembo', 'tacuarembó', 'tacua', 'tac'] },
  { name: 'Cerro Largo', aliases: ['cerro largo', 'cerrolargo', 'cl'] },
  { name: 'Treinta y Tres', aliases: ['treinta y tres', 'treintaytres', 'tt'] },
];

// Crear un mapa de ID de roles si no existe
const departementRolesPath = path.join(__dirname, '../department-roles.json');

function getDepartmentRoles() {
  if (fs.existsSync(departementRolesPath)) {
    return JSON.parse(fs.readFileSync(departementRolesPath, 'utf8'));
  }
  return {};
}

function saveDepartmentRoles(roles) {
  fs.writeFileSync(departementRolesPath, JSON.stringify(roles, null, 2));
}

// Levenshtein distance para fuzzy matching
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

// Buscar departamento con fuzzy matching
function findDepartment(input) {
  const normalizedInput = input.toLowerCase().trim();
  
  // Búsqueda exacta primero
  const exactMatch = DEPARTMENTS.find(
    dept => dept.name.toLowerCase() === normalizedInput
  );
  if (exactMatch) return exactMatch;

  // Búsqueda en aliases
  for (const dept of DEPARTMENTS) {
    if (dept.aliases.some(alias => alias.toLowerCase() === normalizedInput)) {
      return dept;
    }
  }

  // Búsqueda de similitud (fuzzy matching)
  let bestMatch = null;
  let bestDistance = Infinity;
  const threshold = 2; // Máximo 2 caracteres de diferencia

  for (const dept of DEPARTMENTS) {
    // Comparar con el nombre del departamento
    const nameDistance = levenshteinDistance(normalizedInput, dept.name.toLowerCase());
    if (nameDistance < bestDistance && nameDistance <= threshold) {
      bestMatch = dept;
      bestDistance = nameDistance;
    }

    // Comparar con aliases
    for (const alias of dept.aliases) {
      const aliasDistance = levenshteinDistance(normalizedInput, alias.toLowerCase());
      if (aliasDistance < bestDistance && aliasDistance <= threshold) {
        bestMatch = dept;
        bestDistance = aliasDistance;
      }
    }
  }

  return bestMatch;
}

// Obtener todos los departamentos
function getAllDepartments() {
  return DEPARTMENTS.map(d => d.name);
}

// Registrar rol de departamento
function setDepartmentRole(departmentName, roleId) {
  const roles = getDepartmentRoles();
  roles[departmentName] = roleId;
  saveDepartmentRoles(roles);
}

// Obtener rol de departamento
function getDepartmentRole(departmentName) {
  const roles = getDepartmentRoles();
  return roles[departmentName];
}

module.exports = {
  findDepartment,
  getAllDepartments,
  setDepartmentRole,
  getDepartmentRole,
  getDepartmentRoles,
  saveDepartmentRoles,
};

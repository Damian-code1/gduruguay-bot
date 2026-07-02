'use strict';

const { DEPARTMENTS } = require('./departmentStore');
const { similarity } = require('./roleFuzzyMatch');

// Versión más agresiva que cleanRoleName: además de sacar símbolos al
// inicio, quita CUALQUIER carácter no alfanumérico al principio del string
// carácter por carácter (cubre emojis compuestos de 2+ code points, que a
// veces la regex \W no elimina de una sola pasada), y también recorta
// espacios/símbolos sueltos en el medio causados por el emoji separado
// del texto (ej. "➤ Montevideo" -> "Montevideo").
function stripLeadingSymbols(name) {
  let s = String(name || '').trim();
  // Sacar caracteres no alfanuméricos del inicio, uno por uno, hasta
  // llegar a una letra o número (soporta emojis de 1 o 2 code points).
  while (s.length && !/[\p{L}\p{N}]/u.test(s[0])) {
    s = s.slice(1);
  }
  return s.trim().toLowerCase();
}

function cleanRoleName(name) {
  return stripLeadingSymbols(name);
}

// Nombres "limpios" de departamentos (sin emojis/símbolos) para reconocer
// después si un rol cualquiera del server corresponde a un departamento —
// se usa para saber cuál era el "departamento anterior" del miembro y
// removerlo antes de asignar el nuevo, sin importar qué prefijo/emoji tenga
// el rol en el servidor (ej. "➤ Montevideo", "📍Montevideo", etc.)
const DEPARTMENT_NAMES_CLEAN = new Set(DEPARTMENTS.map((d) => cleanRoleName(d.name)));

// Umbral mínimo de similitud fuzzy para aceptar un rol como "el departamento X".
// Mismo criterio que roleFuzzyMatch (findBestRoleMatch) para que ambos sistemas
// se comporten igual ante roles con emojis, mayúsculas raras, tildes, etc.
const MATCH_THRESHOLD = 0.6;

/**
 * Busca el rol del servidor que corresponde a un departamento dado, tolerando
 * que el rol tenga prefijos/emojis (ej. "➤ Montevideo", "🏙️ Montevideo").
 * Prioridad: 1) nombre limpio exacto  2) nombre limpio contiene al departamento
 * 3) similitud fuzzy alta.
 */
function findExistingDepartmentRole(guild, departmentName) {
  const targetClean = cleanRoleName(departmentName);
  if (!targetClean) return null;

  // 1) Exacto tras limpiar emojis/símbolos
  const exact = guild.roles.cache.find((r) => cleanRoleName(r.name) === targetClean);
  if (exact) return exact;

  // 2) El nombre limpio del rol contiene el nombre del departamento
  //    (cubre casos como "Departamento Montevideo" o "Montevideo 🏙️")
  const substring = guild.roles.cache.find((r) => {
    const clean = cleanRoleName(r.name);
    return clean.includes(targetClean) || targetClean.includes(clean);
  });
  if (substring) return substring;

  // 3) Fuzzy — igual que findBestRoleMatch pero comparando solo contra el
  //    nombre del departamento buscado (no contra input libre de usuario)
  let best = null;
  let bestScore = 0;
  for (const role of guild.roles.cache.values()) {
    const score = similarity(cleanRoleName(role.name), targetClean);
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }

  return bestScore >= MATCH_THRESHOLD ? best : null;
}

/**
 * Determina si un rol que ya tiene el miembro corresponde a ALGÚN
 * departamento (para saber cuál remover al cambiar de departamento),
 * usando el mismo criterio tolerante a emojis/prefijos.
 */
function roleMatchesAnyDepartment(role) {
  const clean = cleanRoleName(role.name);
  if (!clean) return false;
  if (DEPARTMENT_NAMES_CLEAN.has(clean)) return true;

  for (const deptClean of DEPARTMENT_NAMES_CLEAN) {
    if (clean.includes(deptClean) || deptClean.includes(clean)) return true;
    if (similarity(clean, deptClean) >= MATCH_THRESHOLD) return true;
  }
  return false;
}

async function assignDepartmentToMember(member, departmentName) {
  const role = findExistingDepartmentRole(member.guild, departmentName);

  if (!role) {
    return { ok: false, reason: 'role_missing' };
  }

  const botMember = member.guild.members.me;

  if (member.id === member.guild.ownerId) {
    return { ok: false, reason: 'is_owner' };
  }

  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return { ok: false, reason: 'hierarchy' };
  }

  if (!member.manageable) {
    return { ok: false, reason: 'member_hierarchy' };
  }

  if (member.roles.cache.has(role.id)) {
    return { ok: true, roleId: role.id, previousRoleId: null, alreadyHad: true };
  }

  const previousRole = member.roles.cache.find(
    (r) => r.id !== role.id && roleMatchesAnyDepartment(r),
  );

  if (previousRole) {
    await member.roles.remove(previousRole.id, 'Cambio de departamento').catch(() => null);
  }

  await member.roles.add(role.id, `Departamento asignado: ${departmentName}`);

  return { ok: true, roleId: role.id, previousRoleId: previousRole?.id || null, alreadyHad: false };
}

module.exports = { assignDepartmentToMember, findExistingDepartmentRole };
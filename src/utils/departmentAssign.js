'use strict';

const { DEPARTMENTS } = require('./departmentStore');
// Quita CUALQUIER carácter no alfanumérico del inicio del nombre del rol,
// uno por uno, hasta llegar a la primera letra o número real. Cubre
// emojis de 1 o 2 code points y cualquier símbolo/espacio suelto que
// Discord permita al inicio de un nombre de rol (ej. "➤ Montevideo",
// "🏙️Montevideo" -> "montevideo").
function stripLeadingSymbols(name) {
  let s = String(name || '').trim();
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


/**
 * Busca el rol del servidor que corresponde a un departamento dado, tolerando
 * ÚNICAMENTE que el rol tenga un prefijo/emoji antes del nombre (ej.
 * "➤ Montevideo" -> matchea "Montevideo"). El departamentName que llega acá
 * ya viene confirmado exactamente por findDepartment, así que no hace falta
 * (ni conviene) usar fuzzy matching acá — solo ignorar el emoji del rol.
 */
function findExistingDepartmentRole(guild, departmentName) {
  const targetClean = cleanRoleName(departmentName);
  if (!targetClean) return null;

  // Nombre exacto tras quitarle el emoji/prefijo al rol de Discord
  return guild.roles.cache.find((r) => cleanRoleName(r.name) === targetClean) || null;
}

/**
 * Determina si un rol que ya tiene el miembro corresponde EXACTAMENTE a
 * algún departamento (ignorando solo el emoji/prefijo del rol), para saber
 * cuál remover al cambiar de departamento.
 */
function roleMatchesAnyDepartment(role) {
  const clean = cleanRoleName(role.name);
  if (!clean) return false;
  return DEPARTMENT_NAMES_CLEAN.has(clean);
}

async function assignDepartmentToMember(member, departmentName) {
  const role = findExistingDepartmentRole(member.guild, departmentName);

  if (!role) {
    return { ok: false, reason: 'role_missing' };
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

  try {
    await member.roles.add(role.id, `Departamento asignado: ${departmentName}`);
  } catch (err) {
    if (err?.code === 50013) {
      return { ok: false, reason: 'hierarchy' };
    }
    throw err;
  }

  return { ok: true, roleId: role.id, previousRoleId: previousRole?.id || null, alreadyHad: false };
}

module.exports = { assignDepartmentToMember, findExistingDepartmentRole };
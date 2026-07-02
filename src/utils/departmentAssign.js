'use strict';

const { DEPARTMENTS } = require('./departmentStore');

/** Nombres de todos los departamentos, en minúscula, para poder identificar
 *  rápidamente si un rol del servidor es "de departamento". */
const DEPARTMENT_NAMES_LOWER = new Set(DEPARTMENTS.map((d) => d.name.toLowerCase()));

/**
 * Busca en los roles YA EXISTENTES del servidor uno cuyo nombre coincida
 * exactamente (case-insensitive) con el nombre del departamento.
 * No usa base de datos: el admin simplemente debe tener un rol creado en
 * el server con el mismo nombre que el departamento (ej. rol "Montevideo").
 */
function findExistingDepartmentRole(guild, departmentName) {
  const target = departmentName.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === target) || null;
}

/**
 * Asigna el rol de un departamento a un miembro, removiendo cualquier otro
 * rol de departamento que ya tuviera (solo puede tener 1 a la vez).
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} departmentName - nombre del departamento (ver departmentStore.DEPARTMENTS)
 * @returns {Promise<{ok: true, roleId: string, previousRoleId: string|null, alreadyHad?: boolean} | {ok: false, reason: string}>}
 */
async function assignDepartmentToMember(member, departmentName) {
  const role = findExistingDepartmentRole(member.guild, departmentName);

  if (!role) {
    return { ok: false, reason: 'role_missing' };
  }

  const botMember = member.guild.members.me;

  // El owner del server es intocable para cualquier bot — restricción de Discord.
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

  // Buscar si el miembro ya tiene otro rol de departamento (por nombre) y sacarlo.
  const previousRole = member.roles.cache.find(
    (r) => r.id !== role.id && DEPARTMENT_NAMES_LOWER.has(r.name.toLowerCase()),
  );

  if (previousRole) {
    await member.roles.remove(previousRole.id, 'Cambio de departamento').catch(() => null);
  }

  await member.roles.add(role.id, `Departamento asignado: ${departmentName}`);

  return { ok: true, roleId: role.id, previousRoleId: previousRole?.id || null, alreadyHad: false };
}

module.exports = { assignDepartmentToMember };

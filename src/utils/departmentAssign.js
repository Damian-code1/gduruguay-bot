'use strict';

const { getDepartmentRole, getAllConfiguredRoleIds } = require('./departmentStore');

/**
 * Asigna el rol de un departamento a un miembro, removiendo cualquier otro
 * rol de departamento que ya tuviera (solo puede tener 1 a la vez).
 *
 * @param {import('discord.js').GuildMember} member
 * @param {string} departmentName - nombre normalizado del departamento (ver departmentStore.DEPARTMENTS)
 * @returns {Promise<{ok: true, roleId: string, previousRoleId: string|null} | {ok: false, reason: string}>}
 */
async function assignDepartmentToMember(member, departmentName) {
  const guildId = member.guild.id;
  const roleId = await getDepartmentRole(guildId, departmentName);

  if (!roleId) {
    return { ok: false, reason: 'not_configured' };
  }

  const role = member.guild.roles.cache.get(roleId) || (await member.guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { ok: false, reason: 'role_missing' };
  }

  if (!member.manageable && !member.roles.cache.has(role.id)) {
    return { ok: false, reason: 'not_manageable' };
  }

  const botMember = member.guild.members.me;
  if (botMember.roles.highest.comparePositionTo(role) <= 0) {
    return { ok: false, reason: 'hierarchy' };
  }

  // Ya lo tiene: nada que hacer.
  if (member.roles.cache.has(role.id)) {
    return { ok: true, roleId: role.id, previousRoleId: null, alreadyHad: true };
  }

  // Remueve cualquier otro rol de departamento que tenga configurado, para que solo tenga 1 a la vez.
  const allDeptRoleIds = await getAllConfiguredRoleIds(guildId);
  const previousRoleId = allDeptRoleIds.find((id) => id !== role.id && member.roles.cache.has(id)) || null;

  if (previousRoleId) {
    await member.roles.remove(previousRoleId, 'Cambio de departamento').catch(() => null);
  }

  await member.roles.add(role.id, `Departamento asignado: ${departmentName}`);

  return { ok: true, roleId: role.id, previousRoleId, alreadyHad: false };
}

module.exports = { assignDepartmentToMember };

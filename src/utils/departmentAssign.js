'use strict';

const { DEPARTMENTS } = require('./departmentStore');

const DEPARTMENT_NAMES_LOWER = new Set(DEPARTMENTS.map((d) => d.name.toLowerCase()));

function findExistingDepartmentRole(guild, departmentName) {
  const target = departmentName.toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === target) || null;
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
    (r) => r.id !== role.id && DEPARTMENT_NAMES_LOWER.has(r.name.toLowerCase()),
  );

  if (previousRole) {
    await member.roles.remove(previousRole.id, 'Cambio de departamento').catch(() => null);
  }

  await member.roles.add(role.id, `Departamento asignado: ${departmentName}`);

  return { ok: true, roleId: role.id, previousRoleId: previousRole?.id || null, alreadyHad: false };
}

module.exports = { assignDepartmentToMember };
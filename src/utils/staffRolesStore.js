'use strict';

const { query } = require('./database');

/** @returns {Promise<string[]>} */
async function getStaffRoles(guildId) {
  const [rows] = await query('SELECT role_id FROM staff_roles WHERE guild_id = ?', [guildId]);
  return rows.map((r) => r.role_id);
}

async function setStaffRoles(guildId, roleIds) {
  await query('DELETE FROM staff_roles WHERE guild_id = ?', [guildId]);
  for (const roleId of roleIds) {
    await query('INSERT IGNORE INTO staff_roles (guild_id, role_id) VALUES (?, ?)', [guildId, roleId]);
  }
  return getStaffRoles(guildId);
}

async function addStaffRoles(guildId, roleIds) {
  for (const roleId of roleIds) {
    await query('INSERT IGNORE INTO staff_roles (guild_id, role_id) VALUES (?, ?)', [guildId, roleId]);
  }
  return getStaffRoles(guildId);
}

async function removeStaffRoles(guildId, roleIds) {
  if (!roleIds.length) return getStaffRoles(guildId);
  const placeholders = roleIds.map(() => '?').join(',');
  await query(`DELETE FROM staff_roles WHERE guild_id = ? AND role_id IN (${placeholders})`, [guildId, ...roleIds]);
  return getStaffRoles(guildId);
}

async function clearStaffRoles(guildId) {
  await query('DELETE FROM staff_roles WHERE guild_id = ?', [guildId]);
  return [];
}

/**
 * Determina si un GuildMember es staff (Administrator o tiene un rol de staff configurado).
 * @param {import('discord.js').GuildMember} member
 */
async function isStaff(member) {
  if (!member?.roles?.cache) return false;
  if (member.permissions?.has('Administrator')) return true;

  const staffRoleIds = await getStaffRoles(member.guild.id);
  if (!staffRoleIds.length) return false;

  return member.roles.cache.some((role) => staffRoleIds.includes(role.id));
}

module.exports = {
  getStaffRoles,
  setStaffRoles,
  addStaffRoles,
  removeStaffRoles,
  clearStaffRoles,
  isStaff,
};

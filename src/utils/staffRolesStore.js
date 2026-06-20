const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../staff-roles.json');

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(storePath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function setStaffRoles(guildId, roleIds) {
  const data = readData();
  data[guildId] = roleIds;
  writeData(data);
  return roleIds;
}

function addStaffRole(guildId, roleId) {
  const data = readData();
  if (!data[guildId]) data[guildId] = [];
  if (!data[guildId].includes(roleId)) {
    data[guildId].push(roleId);
  }
  writeData(data);
  return data[guildId];
}

function removeStaffRole(guildId, roleId) {
  const data = readData();
  if (!data[guildId]) return [];
  data[guildId] = data[guildId].filter(id => id !== roleId);
  writeData(data);
  return data[guildId];
}

function getStaffRoles(guildId) {
  const data = readData();
  return data[guildId] || [];
}

function clearStaffRoles(guildId) {
  const data = readData();
  const had = Boolean(data[guildId]);
  if (had) {
    delete data[guildId];
    writeData(data);
  }
  return had;
}

function isStaff(member, guildId) {
  const staffRoleIds = getStaffRoles(guildId);
  if (!staffRoleIds.length) return false;
  return member.roles.cache.some(role => staffRoleIds.includes(role.id));
}

module.exports = {
  setStaffRoles,
  addStaffRole,
  removeStaffRole,
  getStaffRoles,
  clearStaffRoles,
  isStaff,
};

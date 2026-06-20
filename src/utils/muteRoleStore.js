const fs = require('fs');
const path = require('path');
const { ChannelType } = require('discord.js');

const muteRolesPath = path.join(__dirname, '../mute-roles.json');

function ensureFile() {
  if (!fs.existsSync(muteRolesPath)) {
    fs.writeFileSync(muteRolesPath, JSON.stringify({}, null, 2));
  }
}

function readData() {
  ensureFile();
  return JSON.parse(fs.readFileSync(muteRolesPath, 'utf8'));
}

function writeData(data) {
  fs.writeFileSync(muteRolesPath, JSON.stringify(data, null, 2));
}

function getMuteRoleId(guildId) {
  const data = readData();
  return data[guildId] || null;
}

function setMuteRoleId(guildId, roleId) {
  const data = readData();
  data[guildId] = roleId;
  writeData(data);
  return roleId;
}

function clearMuteRoleId(guildId) {
  const data = readData();
  const had = Boolean(data[guildId]);
  if (had) {
    delete data[guildId];
    writeData(data);
  }
  return had;
}

function getMuteOverwritesForChannel(channel) {
  if (!channel || channel.isThread?.()) return null;

  const textOverwrites = {
    SendMessages: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    SendMessagesInThreads: false,
    AddReactions: false,
    UseApplicationCommands: false,
    UseExternalApps: false,
    AttachFiles: false,
    EmbedLinks: false,
    Speak: false,
    Connect: false,
    Stream: false,
    UseVAD: false,
  };

  const voiceOverwrites = {
    Connect: false,
    Speak: false,
    Stream: false,
    UseVAD: false,
  };

  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) {
    return voiceOverwrites;
  }

  return textOverwrites;
}

async function applyMuteRoleToChannel(channel, roleId, reason = 'Mute role sync') {
  if (!channel?.permissionOverwrites?.edit || !roleId) return false;
  const overwrites = getMuteOverwritesForChannel(channel);
  if (!overwrites) return false;

  try {
    await channel.permissionOverwrites.edit(roleId, overwrites, { reason });
    return true;
  } catch {
    return false;
  }
}

async function applyMuteRoleToGuildChannels(guild, roleId, reason = 'Mute role sync') {
  if (!guild?.channels?.cache) return 0;

  let applied = 0;
  for (const channel of guild.channels.cache.values()) {
    const ok = await applyMuteRoleToChannel(channel, roleId, reason).catch(() => false);
    if (ok) applied += 1;
  }
  return applied;
}

function getMuteRolesByName(guild, roleName = 'Muted') {
  if (!guild?.roles?.cache) return [];

  return [...guild.roles.cache.values()].filter(role => role?.name === roleName);
}

async function removeDuplicateMuteRoles(guild, canonicalRoleId, roleName = 'Muted') {
  const roles = getMuteRolesByName(guild, roleName).filter(role => role.id !== canonicalRoleId);
  const results = [];

  for (const role of roles) {
    try {
      await role.delete('Duplicate mute role cleanup');
      results.push({ id: role.id, name: role.name, deleted: true });
    } catch (error) {
      results.push({ id: role.id, name: role.name, deleted: false, error: error?.message || 'Unknown error' });
    }
  }

  return results;
}

async function syncMuteRoleAcrossGuildChannels(guild, roleId, reason = 'Mute role sync') {
  if (!guild?.channels?.cache) {
    return { synced: 0, failed: 0 };
  }

  let synced = 0;
  let failed = 0;

  for (const channel of guild.channels.cache.values()) {
    const ok = await applyMuteRoleToChannel(channel, roleId, reason).catch(() => false);
    if (ok) synced += 1;
    else failed += 1;
  }

  return { synced, failed };
}

async function ensureMuteRoleConfiguration(guild, {
  createIfMissing = true,
  roleName = 'Muted',
  syncReason = 'Mute role sync',
  createReason = 'Mute role created',
  cleanupDuplicates = true,
  syncChannels = true,
} = {}) {
  if (!guild) {
    return {
      role: null,
      created: false,
      adopted: false,
      duplicatesFound: 0,
      duplicatesDeleted: 0,
      duplicatesFailed: 0,
      channelsSynced: 0,
      channelsFailed: 0,
    };
  }

  const storedRoleId = getMuteRoleId(guild.id);
  let role = storedRoleId ? guild.roles.cache.get(storedRoleId) : null;
  const rolesByName = getMuteRolesByName(guild, roleName);
  let created = false;
  let adopted = false;

  if (!role && rolesByName.length > 0) {
    role = [...rolesByName].sort((a, b) => {
      const ageDiff = (a.createdTimestamp || 0) - (b.createdTimestamp || 0);
      return ageDiff !== 0 ? ageDiff : a.id.localeCompare(b.id);
    })[0];
    setMuteRoleId(guild.id, role.id);
    adopted = true;
  }

  if (!role && createIfMissing) {
    role = await guild.roles.create({
      name: roleName,
      reason: createReason,
    });
    setMuteRoleId(guild.id, role.id);
    created = true;
  }

  if (!role) {
    return {
      role: null,
      created: false,
      adopted: false,
      duplicatesFound: rolesByName.length,
      duplicatesDeleted: 0,
      duplicatesFailed: 0,
      channelsSynced: 0,
      channelsFailed: 0,
    };
  }

  const duplicateResults = cleanupDuplicates
    ? await removeDuplicateMuteRoles(guild, role.id, roleName)
    : [];

  const channels = syncChannels
    ? await syncMuteRoleAcrossGuildChannels(guild, role.id, syncReason)
    : { synced: 0, failed: 0 };

  return {
    role,
    created,
    adopted,
    duplicatesFound: cleanupDuplicates ? rolesByName.filter(r => r.id !== role.id).length : 0,
    duplicatesDeleted: duplicateResults.filter(r => r.deleted).length,
    duplicatesFailed: duplicateResults.filter(r => !r.deleted).length,
    channelsSynced: channels.synced,
    channelsFailed: channels.failed,
  };
}

module.exports = {
  getMuteRoleId,
  setMuteRoleId,
  clearMuteRoleId,
  getMuteOverwritesForChannel,
  applyMuteRoleToChannel,
  applyMuteRoleToGuildChannels,
  getMuteRolesByName,
  removeDuplicateMuteRoles,
  syncMuteRoleAcrossGuildChannels,
  ensureMuteRoleConfiguration,
};

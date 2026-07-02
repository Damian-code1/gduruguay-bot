'use strict';

const { PermissionsBitField, ChannelType } = require('discord.js');
const { query } = require('./database');

const MUTE_ROLE_NAME = 'Muted';

const DENY_PERMISSIONS = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.AddReactions,
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.Stream,
  PermissionsBitField.Flags.Connect,
];

async function getMuteRoleId(guildId) {
  const [rows] = await query('SELECT role_id FROM mute_roles WHERE guild_id = ?', [guildId]);
  return rows[0]?.role_id || null;
}

async function setMuteRoleId(guildId, roleId) {
  await query(
    'INSERT INTO mute_roles (guild_id, role_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE role_id = VALUES(role_id)',
    [guildId, roleId],
  );
}

async function syncMuteRoleChannels(guild, role) {
  let ok = 0;
  let failed = 0;

  const channels = guild.channels.cache.filter(
    (c) => c.type === ChannelType.GuildText || c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildAnnouncement,
  );

  for (const channel of channels.values()) {
    try {
      await channel.permissionOverwrites.edit(role, {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        AddReactions: false,
        Speak: false,
        Stream: false,
        Connect: false,
      });
      ok += 1;
    } catch {
      failed += 1;
    }
  }

  return { ok, failed };
}

/**
 * Garantiza que exista un rol de mute válido, opcionalmente creándolo y sincronizando canales.
 * @param {import('discord.js').Guild} guild
 * @param {{createIfMissing?: boolean, syncChannels?: boolean, reason?: string}} options
 */
async function ensureMuteRole(guild, options = {}) {
  const { createIfMissing = false, syncChannels = false, reason = 'Mute role sync' } = options;

  let role = null;
  const storedId = await getMuteRoleId(guild.id);
  if (storedId) {
    role = guild.roles.cache.get(storedId) || (await guild.roles.fetch(storedId).catch(() => null));
  }

  let created = false;

  if (!role) {
    // Buscar por nombre por si existe pero no está guardado
    role = guild.roles.cache.find((r) => r.name === MUTE_ROLE_NAME) || null;
    if (role) {
      await setMuteRoleId(guild.id, role.id);
    }
  }

  if (!role && createIfMissing) {
    role = await guild.roles.create({
      name: MUTE_ROLE_NAME,
      color: 'Grey',
      permissions: [],
      reason,
    });
    await setMuteRoleId(guild.id, role.id);
    created = true;
  }

  let channelsSynced = 0;
  let channelsFailed = 0;

  if (role && (created || syncChannels)) {
    const result = await syncMuteRoleChannels(guild, role);
    channelsSynced = result.ok;
    channelsFailed = result.failed;
  }

  return { role, created, channelsSynced, channelsFailed };
}

module.exports = { ensureMuteRole, getMuteRoleId, setMuteRoleId, MUTE_ROLE_NAME };

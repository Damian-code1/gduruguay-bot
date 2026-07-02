'use strict';

const { ActivityType } = require('discord.js');
const config = require('../config');

/**
 * Cuenta miembros humanos (sin bots, sin contar al propio bot) de un guild.
 * @param {import('discord.js').Guild} guild
 */
async function countHumanMembers(guild) {
  const members = await guild.members.fetch();
  return members.filter((m) => !m.user.bot).size;
}

/**
 * Actualiza el presence del bot mostrando "Viendo a N miembros" (solo humanos).
 * @param {import('discord.js').Client} client
 */
async function updatePresence(client) {
  try {
    const guild = client.guilds.cache.get(config.guildId) || client.guilds.cache.first();
    if (!guild) return;

    const humanCount = await countHumanMembers(guild);

    client.user.setPresence({
      activities: [{ name: `${humanCount} miembros`, type: ActivityType.Watching }],
      status: 'online',
    });
  } catch (err) {
    console.error('Error actualizando presence:', err);
  }
}

module.exports = { updatePresence, countHumanMembers };

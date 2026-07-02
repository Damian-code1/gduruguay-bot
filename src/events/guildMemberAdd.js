'use strict';

const { getAutorole } = require('../utils/autoroleStore');
const { updatePresence } = require('../utils/presence');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    try {
      if (!member.user.bot) {
        const roleId = await getAutorole(member.guild.id);
        if (roleId) {
          const role = member.guild.roles.cache.get(roleId);
          if (role) await member.roles.add(role, 'Autorole').catch(() => null);
        }
      }
      await updatePresence(member.client);
    } catch (err) {
      console.error('Error en guildMemberAdd:', err);
    }
  },
};

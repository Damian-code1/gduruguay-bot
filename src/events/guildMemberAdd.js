'use strict';

const { getAutorole } = require('../utils/autoroleStore');
const { updatePresence } = require('../utils/presence');
const { findUsedInviteCode, incrementInviteCount, refreshInviteCache } = require('../utils/inviteStore');

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

        const used = await findUsedInviteCode(member.guild);
        if (used?.inviterId) {
          await incrementInviteCount(member.guild.id, used.inviterId);
        }
        await refreshInviteCache(member.guild);
      }
      await updatePresence(member.client);
    } catch (err) {
      console.error('Error en guildMemberAdd:', err);
    }
  },
};

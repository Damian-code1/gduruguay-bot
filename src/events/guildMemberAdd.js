const { getAutorole } = require('../utils/autoroleStore');
const { handleGiveawayMemberJoin } = require('../utils/giveawayService');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    handleGiveawayMemberJoin(member).catch(() => null);

    const roleId = getAutorole(member.guild.id);
    if (!roleId) return;

    const role = member.guild.roles.cache.get(roleId);
    if (!role) return;

    await member.roles.add(role).catch(() => null);
  },
};

const { handleGiveawayPrefixCommand } = require('../utils/giveawayService');

module.exports = {
  name: 'giveaway',
  aliases: ['gw'],
  help: {
    purpose: 'Sistema de sorteos.',
    category: '🎁 Sorteos',
    aliases: ['gw'],
    adminOnly: true,
    usage: [
      '-gw panel',
      '-gw create [#canal] <duración> <premio>',
      '-gw create [#canal] <duración> <premio> --messages <n>',
      '-gw create [#canal] <duración> <premio> --invites <n>',
      '-gw create [#canal] <duración> <premio> --winners <n>',
      '-gw create [#canal] <duración> <premio> --thumb <url>',
      '-gw preview [url]',
      '-gw thumbnail set <url>',
      '-gw thumbnail clear',
      '-gw stats <id> [@usuario|me]',
      '-gw reroll <id>',
      '-gw stop <id>',
    ].join('\n'),
  },
  async execute(message, args) {
    if (!message.guild) return;
    return handleGiveawayPrefixCommand(message, args);
  },
};

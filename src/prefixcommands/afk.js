const { setAfk } = require('../utils/afkStore');

function buildAfkNickname(nickname) {
  const base = String(nickname || '').replace(/^\[AFK\]\s*/i, '').trim();
  return base ? `[AFK] ${base}` : '[AFK]';
}

module.exports = {
  name: 'afk',
  help: {
    purpose: 'Te marca como AFK hasta que vuelvas a escribir.',
    category: '📊 Información',
  },
  async execute(message, args) {
    const reason = args.join(' ').trim() || 'AFK';
    const currentNickname = message.member?.nickname || message.author.username;
    const afkNickname = buildAfkNickname(currentNickname);

    await setAfk(message.guild.id, message.author.id, {
      reason,
      since: Date.now(),
      username: message.author.username,
      previousNickname: message.member?.nickname || null,
    });

    if (message.member?.manageable) {
      await message.member.setNickname(afkNickname).catch(() => null);
    }

    return message.reply(`💤 Te marqué como AFK: **${reason}**`);
  },
};

const { addSnipe } = require('../utils/snipeStore');
const { buildMessageDeleteLog } = require('../utils/messageAuditLog');

const LOG_CHANNEL_ID = '1496348718558089216';

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild) return;
    if (message.author?.bot) return;

    const guild = message.guild;
    const channel = message.channel || (guild.channels.cache.get(message.channelId) ?? null);

    if (!message.partial) {
      addSnipe(message);
    }

    if (!channel?.isTextBased?.()) return;

    const logChannel =
      guild.channels.cache.get(LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));
    if (!logChannel?.isTextBased?.()) return;

    const member = message.author?.id
      ? (guild.members.cache.get(message.author.id) || await guild.members.fetch(message.author.id).catch(() => null))
      : null;

    const payload = buildMessageDeleteLog({
      guild,
      channel,
      message,
      member,
    });

    await logChannel.send(payload).catch(() => null);
  },
};

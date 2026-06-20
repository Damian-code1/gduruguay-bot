const { buildMessageUpdateLog, hasMeaningfulMessageChanges } = require('../utils/messageAuditLog');

const LOG_CHANNEL_ID = '1496348718558089216';

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    const message = newMessage || oldMessage;
    if (!message?.guild) return;
    if (message.author?.bot) return;

    const guild = message.guild;
    const channel = message.channel || (guild.channels.cache.get(message.channelId) ?? null);
    if (!channel?.isTextBased?.()) return;

    const oldResolved = oldMessage?.partial ? await oldMessage.fetch().catch(() => oldMessage) : oldMessage;
    const newResolved = newMessage?.partial ? await newMessage.fetch().catch(() => newMessage) : newMessage;

    if (!hasMeaningfulMessageChanges(oldResolved || oldMessage, newResolved || newMessage)) return;

    const logChannel =
      guild.channels.cache.get(LOG_CHANNEL_ID) ||
      (await guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));
    if (!logChannel?.isTextBased?.()) return;

    const authorId = newResolved?.author?.id || oldResolved?.author?.id;
    const member = authorId
      ? (guild.members.cache.get(authorId) || await guild.members.fetch(authorId).catch(() => null))
      : null;

    const payload = buildMessageUpdateLog({
      guild,
      channel,
      oldMessage: oldResolved || oldMessage,
      newMessage: newResolved || newMessage,
      member,
    });

    await logChannel.send(payload).catch(() => null);
  },
};
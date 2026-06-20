const { EmbedBuilder } = require('discord.js');

async function sendModerationDm(user, payload = {}) {
  if (!user?.send) return false;

  const fields = [
    ...(Array.isArray(payload.fields) ? payload.fields : []),
    payload.moderator ? { name: 'Moderador', value: payload.moderator, inline: true } : null,
    payload.guild ? { name: 'Servidor', value: payload.guild, inline: true } : null,
  ].filter(Boolean);

  const embed = new EmbedBuilder()
    .setColor(payload.color || 0x5865F2)
    .setTitle(payload.title || '📣 Aviso del servidor')
    .setDescription(payload.description || 'Se realizó una acción de moderación en tu cuenta.')
    .addFields(fields)
    .setTimestamp();

  await user.send({
    embeds: [embed],
    allowedMentions: { parse: [] },
  });

  return true;
}

module.exports = {
  sendModerationDm,
};

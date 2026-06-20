function resolveRoleTarget(message, raw) {
  const text = String(raw || '').trim();
  if (!text || !message?.guild) return null;

  const mentioned = message.mentions?.roles?.first?.();
  if (mentioned) return mentioned;

  const mentionMatch = text.match(/^<@&(\d{17,20})>$/);
  if (mentionMatch) {
    return message.guild.roles.cache.get(mentionMatch[1]) || null;
  }

  if (/^\d{17,20}$/.test(text)) {
    return message.guild.roles.cache.get(text) || null;
  }

  return message.guild.roles.cache.find(role => role.name.toLowerCase() === text.toLowerCase()) || null;
}

module.exports = {
  resolveRoleTarget,
};

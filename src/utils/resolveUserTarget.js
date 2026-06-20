async function resolveUserTarget(message, rawTarget) {
  if (!rawTarget) return null;

  const input = String(rawTarget).trim();
  if (!input) return null;

  const mentionMatch = input.match(/^<@!?(\d{15,25})>$/);
  const targetId = mentionMatch?.[1] || ( /^\d{15,25}$/.test(input) ? input : null );
  if (!targetId) return null;

  const user = message.client.users.cache.get(targetId) || await message.client.users.fetch(targetId).catch(() => null);
  if (!user) return null;

  const member = message.guild?.members?.cache?.get(targetId)
    || await message.guild?.members?.fetch(targetId).catch(() => null)
    || null;

  return {
    user,
    member,
    id: user.id,
    username: user.username,
    tag: user.tag || user.username,
    inputType: mentionMatch ? 'mention' : 'id',
  };
}

module.exports = {
  resolveUserTarget,
};
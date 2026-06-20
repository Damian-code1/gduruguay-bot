async function resolveMemberTarget(message, rawTarget) {
  if (!rawTarget) return null;

  const input = String(rawTarget).trim();
  if (!input) return null;

  const mentionMatch = input.match(/^<@!?(\d{17,20})>$/);
  const targetId = mentionMatch?.[1] || input;

  const mentionedMember = message.mentions.members.first();
  if (mentionedMember) {
    return {
      member: mentionedMember,
      user: mentionedMember.user,
      id: mentionedMember.id,
      inputType: 'mention',
    };
  }

  const normalizedName = targetId.replace(/^@+/, '').trim().toLowerCase();
  if (normalizedName) {
    const exactMember = message.guild.members.cache.find(member => {
      const username = String(member.user?.username || '').toLowerCase();
      const displayName = String(member.displayName || '').toLowerCase();
      const tag = String(member.user?.tag || '').toLowerCase();
      return username === normalizedName || displayName === normalizedName || tag === normalizedName;
    });

    if (exactMember) {
      return {
        member: exactMember,
        user: exactMember.user,
        id: exactMember.id,
        inputType: 'name-exact',
      };
    }

    const partialMember = message.guild.members.cache.find(member => {
      const username = String(member.user?.username || '').toLowerCase();
      const displayName = String(member.displayName || '').toLowerCase();
      return username.includes(normalizedName) || displayName.includes(normalizedName);
    });

    if (partialMember) {
      return {
        member: partialMember,
        user: partialMember.user,
        id: partialMember.id,
        inputType: 'name-partial',
      };
    }
  }

  if (!/^\d{17,20}$/.test(targetId)) return null;

  const cachedMember = message.guild.members.cache.get(targetId);
  if (cachedMember) {
    return {
      member: cachedMember,
      user: cachedMember.user,
      id: cachedMember.id,
      inputType: 'id-cached',
    };
  }

  const fetchedMember = await message.guild.members.fetch(targetId).catch(() => null);
  if (fetchedMember) {
    return {
      member: fetchedMember,
      user: fetchedMember.user,
      id: fetchedMember.id,
      inputType: 'id-fetched',
    };
  }

  const fetchedUser = await message.client.users.fetch(targetId).catch(() => null);
  if (fetchedUser) {
    return {
      member: null,
      user: fetchedUser,
      id: fetchedUser.id,
      inputType: 'id-user-only',
    };
  }

  return null;
}

module.exports = {
  resolveMemberTarget,
};

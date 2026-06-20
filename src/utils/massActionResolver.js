async function resolveTargetToken(message, token) {
  const input = String(token || '').trim().replace(/^['"`]+|['"`]+$/g, '');
  if (!input) return null;

    const mentionMatch = input.match(/^<@!?(\d{17,20})>$/);
  const id = mentionMatch?.[1] || (/^\d{17,20}$/.test(input) ? input : null);

  if (id) {
    const cachedMember = message.guild.members.cache.get(id);
    if (cachedMember) {
      return {
        member: cachedMember,
        user: cachedMember.user,
        id: cachedMember.id,
        inputType: 'id-cached',
      };
    }

    const fetchedMember = await message.guild.members.fetch(id).catch(() => null);
    if (fetchedMember) {
      return {
        member: fetchedMember,
        user: fetchedMember.user,
        id: fetchedMember.id,
        inputType: 'id-fetched',
      };
    }

    const fetchedUser = await message.client.users.fetch(id).catch(() => null);
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

  const normalized = input.replace(/^@+/, '').trim().toLowerCase();
  if (!normalized) return null;

  const exactMember = message.guild.members.cache.find(member => {
    const username = String(member.user?.username || '').toLowerCase();
    const displayName = String(member.displayName || '').toLowerCase();
    const tag = String(member.user?.tag || '').toLowerCase();
    return username === normalized || displayName === normalized || tag === normalized;
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
    const tag = String(member.user?.tag || '').toLowerCase();
    return username.includes(normalized) || displayName.includes(normalized) || tag.includes(normalized);
  });
  if (partialMember) {
    return {
      member: partialMember,
      user: partialMember.user,
      id: partialMember.id,
      inputType: 'name-partial',
    };
  }

  return null;
}

async function resolveMassTargets(message, targetText) {
  const tokens = String(targetText || '')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const seen = new Set();
  const resolved = [];
  const unresolved = [];

  for (const token of tokens) {
    const result = await resolveTargetToken(message, token);
    if (!result) {
      unresolved.push(token);
      continue;
    }

    if (seen.has(result.id)) continue;
    seen.add(result.id);
    resolved.push(result);
  }

  return { resolved, unresolved };
}

async function resolveMassTargetsAndRest(message, inputText) {
  const tokens = String(inputText || '')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(Boolean);

  const resolved = [];
  const seen = new Set();
  let splitIndex = 0;

  for (const token of tokens) {
    const result = await resolveTargetToken(message, token);
    if (!result) break;

    if (!seen.has(result.id)) {
      seen.add(result.id);
      resolved.push(result);
    }

    splitIndex += 1;
  }

  return {
    targets: resolved,
    remainder: tokens.slice(splitIndex).join(' ').trim(),
  };
}

module.exports = {
  resolveTargetToken,
  resolveMassTargets,
  resolveMassTargetsAndRest,
};

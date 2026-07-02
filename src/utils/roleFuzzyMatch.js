'use strict';

function cleanRoleName(name) {
  return String(name)
    .trim()
    .replace(/^[^\w\s]+/g, '')
    .trim()
    .toLowerCase();
}

function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

function similarity(a, b) {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function findBestRoleMatch(guild, rawInput) {
  const text = String(rawInput || '').trim();
  if (!text || !guild) return null;

  const mentionMatch = text.match(/^<@&(\d{17,20})>$/);
  if (mentionMatch) {
    return guild.roles.cache.get(mentionMatch[1]) || null;
  }
  if (/^\d{17,20}$/.test(text)) {
    return guild.roles.cache.get(text) || null;
  }

  const cleanInput = cleanRoleName(text);
  if (!cleanInput) return null;

  const exact = guild.roles.cache.find((r) => cleanRoleName(r.name) === cleanInput);
  if (exact) return exact;

  const substring = guild.roles.cache.find((r) => cleanRoleName(r.name).includes(cleanInput));
  if (substring) return substring;

  let best = null;
  let bestScore = 0;
  for (const role of guild.roles.cache.values()) {
    const score = similarity(cleanRoleName(role.name), cleanInput);
    if (score > bestScore) {
      bestScore = score;
      best = role;
    }
  }

  return bestScore >= 0.45 ? best : null;
}

function searchRolesForAutocomplete(guild, query) {
  if (!guild) return [];
  const clean = cleanRoleName(query || '');
  const roles = guild.roles.cache.filter((r) => r.id !== guild.id).map((r) => r);

  if (!clean) {
    return roles
      .sort((a, b) => b.position - a.position)
      .slice(0, 25);
  }

  return roles
    .map((r) => ({ role: r, score: similarity(cleanRoleName(r.name), clean), includes: cleanRoleName(r.name).includes(clean) }))
    .filter((r) => r.includes || r.score >= 0.35)
    .sort((a, b) => (b.includes - a.includes) || (b.score - a.score))
    .slice(0, 25)
    .map((r) => r.role);
}

module.exports = { findBestRoleMatch, searchRolesForAutocomplete, cleanRoleName, similarity };
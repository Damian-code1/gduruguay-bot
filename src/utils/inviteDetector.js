// Regex para detectar invites de Discord
// Detecta: discord.gg/..., discord.com/invite/..., etc
const DISCORD_INVITE_REGEX = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord\.com\/invite|dsc\.gg)\/\S+/gi;
const DISCORD_URL_REGEX = /https?:\/\/(www\.)?discord(\.com|\.gg)\S+/gi;

function hasDiscordInvite(text) {
  return DISCORD_INVITE_REGEX.test(text);
}

function findAllInvites(text) {
  return text.match(DISCORD_INVITE_REGEX) || [];
}

function removeInvites(text) {
  return text.replace(DISCORD_INVITE_REGEX, '[LINK REMOVIDO]');
}

module.exports = {
  hasDiscordInvite,
  findAllInvites,
  removeInvites,
  DISCORD_INVITE_REGEX,
};

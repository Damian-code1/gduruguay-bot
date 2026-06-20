const raidDetection = new Map();
const RAID_THRESHOLD = 3; // 3 mensajes con links
const RAID_TIME_WINDOW = 5000; // en 5 segundos
const BAN_COOLDOWN = 60000; // esperar 1 minuto entre bans automáticos

// Detecta si un string contiene links de Discord
function hasDiscordLink(content) {
  const discordInviteRegex = /(discord\.gg\/|discordapp\.com\/invite\/|discord\.com\/invite\/)(\w+)/gi;
  return discordInviteRegex.test(content);
}

function recordMessage(userId, guildId, messageContent = '') {
  const key = `${guildId}:${userId}`;
  
  if (!raidDetection.has(key)) {
    raidDetection.set(key, []);
  }
  
  const timestamps = raidDetection.get(key);
  const now = Date.now();
  
  // Solo registrar si el mensaje contiene un link de Discord
  if (!hasDiscordLink(messageContent)) {
    return 0;
  }
  
  // Limpiar mensajes antiguos
  const recent = timestamps.filter(t => now - t < RAID_TIME_WINDOW);
  recent.push(now);
  
  raidDetection.set(key, recent);
  
  return recent.length;
}

function isRaiding(userId, guildId) {
  const key = `${guildId}:${userId}`;
  const timestamps = raidDetection.get(key) || [];
  const now = Date.now();
  
  const recent = timestamps.filter(t => now - t < RAID_TIME_WINDOW);
  return recent.length >= RAID_THRESHOLD;
}

function resetUser(userId, guildId) {
  const key = `${guildId}:${userId}`;
  raidDetection.delete(key);
}

module.exports = {
  recordMessage,
  isRaiding,
  resetUser,
  RAID_THRESHOLD,
  RAID_TIME_WINDOW,
  BAN_COOLDOWN,
};

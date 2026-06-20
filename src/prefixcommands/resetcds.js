const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const TESTER_USER_ID = '1407737422732853331';
const COOLDOWNS_PATH = path.join(__dirname, '../economy-cooldowns.json');
const ROBBERY_PATH = path.join(__dirname, '../economy-robbery.json');

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback = {}) {
  ensureFile(filePath, fallback);
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function clearRoboCooldowns(guildId, userId) {
  const all = readJson(COOLDOWNS_PATH, {});
  const guildData = all[guildId];
  if (!guildData?.[userId]) return 0;

  const keys = ['rob_cmd', 'forcerob_cmd'];
  let removed = 0;
  for (const key of keys) {
    if (key in guildData[userId]) {
      delete guildData[userId][key];
      removed += 1;
    }
  }

  if (Object.keys(guildData[userId]).length === 0) {
    delete guildData[userId];
  }
  if (Object.keys(guildData).length === 0) {
    delete all[guildId];
  }

  writeJson(COOLDOWNS_PATH, all);
  return removed;
}

function clearAllCooldowns(guildId, userId) {
  const all = readJson(COOLDOWNS_PATH, {});
  const guildData = all[guildId];
  if (!guildData?.[userId]) return 0;

  const removed = Object.keys(guildData[userId]).length;
  delete guildData[userId];

  if (Object.keys(guildData).length === 0) {
    delete all[guildId];
  }

  writeJson(COOLDOWNS_PATH, all);
  return removed;
}

function clearRoboHistory(guildId, userId) {
  const all = readJson(ROBBERY_PATH, {});
  const guildData = all[guildId];
  if (!guildData) return { removedHistory: 0, removedVictim: false };

  let removedHistory = 0;
  for (const key of Object.keys(guildData)) {
    if (key === 'victims') continue;
    const [thiefId, victimId] = key.split(':');
    if (thiefId === userId || victimId === userId) {
      delete guildData[key];
      removedHistory += 1;
    }
  }

  let removedVictim = false;
  if (guildData.victims?.[userId]) {
    delete guildData.victims[userId];
    removedVictim = true;
  }

  if (guildData.victims && Object.keys(guildData.victims).length === 0) {
    delete guildData.victims;
  }

  if (Object.keys(guildData).length === 0) {
    delete all[guildId];
  } else {
    all[guildId] = guildData;
  }

  writeJson(ROBBERY_PATH, all);
  return { removedHistory, removedVictim };
}

function clearAllRobberyState(guildId) {
  const all = readJson(ROBBERY_PATH, {});
  const guildData = all[guildId];
  if (!guildData) return { removedHistory: 0, removedVictims: 0 };

  const removedHistory = Object.keys(guildData).filter(key => key !== 'victims').length;
  const removedVictims = Object.keys(guildData.victims || {}).length;

  delete all[guildId];
  writeJson(ROBBERY_PATH, all);

  return { removedHistory, removedVictims };
}

module.exports = {
  name: 'resetcds',
  aliases: ['forceresetcds'],
  help: {
    purpose: 'Resetea cooldowns de robo para testing. Solo para un usuario autorizado.',
    category: '🧪 Testing',
    adminOnly: true,
    hiddenInCmds: true,
  },
  async execute(message) {
    if (message.author.id !== TESTER_USER_ID) {
      return message.reply('❌ Este comando no está autorizado para tu cuenta.');
    }

    const guildId = message.guild.id;
    const removedCooldowns = clearAllCooldowns(guildId, message.author.id);
    const robbery = clearAllRobberyState(guildId);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🧹 Reset completo de robo')
          .setColor(0x2ECC71)
          .setDescription([
            `Usuario autorizado: <@${message.author.id}>`,
            `Cooldowns borrados: **${removedCooldowns}**`,
            `Robos borrados del servidor: **${robbery.removedHistory}**`,
            `Locks de víctimas borrados: **${robbery.removedVictims}**`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
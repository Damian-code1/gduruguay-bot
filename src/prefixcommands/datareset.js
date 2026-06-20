const fs = require('fs');
const path = require('path');
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, getUserBalance } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');

const USERS_PATH = path.join(__dirname, '../economy-users.json');
const COOLDOWNS_PATH = path.join(__dirname, '../economy-cooldowns.json');
const LOANS_PATH = path.join(__dirname, '../economy-loans.json');
const ROBBERY_PATH = path.join(__dirname, '../economy-robbery.json');
const PASSIVE_PATH = path.join(__dirname, '../passive-income.json');
const GRANT_LOGS_PATH = path.join(__dirname, '../grantcoins-logs.json');
const REMOVE_LOGS_PATH = path.join(__dirname, '../removecoins-logs.json');

function ensureFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
}

function readJson(filePath, fallback = {}) {
  ensureFile(filePath, fallback);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function parseTarget(args, message) {
  const mention = message.mentions.users.first();
  if (mention) return mention;

  const raw = String(args[0] || '').trim();
  if (!raw) return null;
  const idMatch = raw.match(/^<?@!?([0-9]{15,25})>?$/) || raw.match(/^([0-9]{15,25})$/);
  if (!idMatch) return null;

  return { id: idMatch[1], bot: false, tag: idMatch[1] };
}

function clearGuildUserRecord(filePath, guildId, userId) {
  const all = readJson(filePath, {});
  const guildData = all[guildId];
  if (!guildData || !guildData[userId]) return false;

  delete guildData[userId];
  if (Object.keys(guildData).length === 0) {
    delete all[guildId];
  } else {
    all[guildId] = guildData;
  }

  writeJson(filePath, all);
  return true;
}

function clearUserCooldowns(guildId, userId) {
  const all = readJson(COOLDOWNS_PATH, {});
  const guildData = all[guildId];
  if (!guildData || !guildData[userId]) return 0;

  const removedKeys = Object.keys(guildData[userId]);
  delete guildData[userId];
  if (Object.keys(guildData).length === 0) {
    delete all[guildId];
  } else {
    all[guildId] = guildData;
  }

  writeJson(COOLDOWNS_PATH, all);
  return removedKeys.length;
}

function clearUserLoans(guildId, userId) {
  const all = readJson(LOANS_PATH, {});
  const guildData = all[guildId];
  if (!guildData?.users?.[userId]) return false;

  delete guildData.users[userId];
  if (Object.keys(guildData.users).length === 0) {
    delete all[guildId];
  } else {
    all[guildId] = guildData;
  }

  writeJson(LOANS_PATH, all);
  return true;
}

function clearRobberyRecords(guildId, userId) {
  const all = readJson(ROBBERY_PATH, {});
  const guildData = all[guildId];
  if (!guildData) return { removedEntries: 0, removedVictim: false };

  let removedEntries = 0;
  for (const key of Object.keys(guildData)) {
    if (key === 'victims') continue;
    const [thiefId, victimId] = key.split(':');
    if (thiefId === userId || victimId === userId) {
      delete guildData[key];
      removedEntries += 1;
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
  return { removedEntries, removedVictim };
}

function clearLogEntries(filePath, guildId, userId) {
  const all = readJson(filePath, {});
  const guildLogs = Array.isArray(all[guildId]) ? all[guildId] : [];
  if (!guildLogs.length) return 0;

  const filtered = guildLogs.filter(entry => String(entry?.targetId || '') !== userId);
  const removed = guildLogs.length - filtered.length;

  if (filtered.length > 0) {
    all[guildId] = filtered;
  } else {
    delete all[guildId];
  }

  writeJson(filePath, all);
  return removed;
}

function clearPassiveUser(guildId, userId) {
  const all = readJson(PASSIVE_PATH, {});
  const guildData = all[guildId];
  if (!guildData?.users?.[userId]) return false;

  delete guildData.users[userId];
  all[guildId] = guildData;
  writeJson(PASSIVE_PATH, all);
  return true;
}

module.exports = {
  name: 'datareset',
  aliases: ['dr', 'resetdata'],
  help: {
    purpose: 'Borra toda la economía de un usuario en el servidor.',
    category: '💰 Economía',
    adminOnly: true,
  },
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Este comando es solo para administradores.');
    }

    const target = parseTarget(args, message);
    const confirm = ['confirm', 'confirma', 'si', 'sí', 'yes', 'ok'].includes(String(args.slice(1).join(' ')).toLowerCase()) ||
      ['confirm', 'confirma', 'si', 'sí', 'yes', 'ok'].includes(String(args[1] || '').toLowerCase());

    if (!target || target.user?.bot) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso inválido')
            .setColor(0xED4245)
            .setDescription('Uso: `-datareset @usuario confirm`'),
        ],
      });
    }

    const config = getGuildConfig(message.guild.id);
    const balance = getUserBalance(message.guild.id, target.id);

    if (!confirm) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⚠️ Confirmación requerida')
            .setColor(0xF1C40F)
            .setDescription([
              `Esto borrará toda la economía de <@${target.id}> en este servidor.`,
              '',
              `Wallet: ${formatCurrency(balance.wallet, config)}`,
              `Banco: ${formatCurrency(balance.bank, config)}`,
              '',
              'Si estás seguro, ejecutá el comando otra vez con `confirm` al final.',
            ].join('\n')),
        ],
      });
    }

    const wallet = balance.wallet;
    const bank = balance.bank;

    const removedUserRecord = clearGuildUserRecord(USERS_PATH, message.guild.id, target.id);
    const removedCooldowns = clearUserCooldowns(message.guild.id, target.id);
    const removedLoan = clearUserLoans(message.guild.id, target.id);
    const robbery = clearRobberyRecords(message.guild.id, target.id);
    const removedPassive = clearPassiveUser(message.guild.id, target.id);
    const removedGrantLogs = clearLogEntries(GRANT_LOGS_PATH, message.guild.id, target.id);
    const removedRemoveLogs = clearLogEntries(REMOVE_LOGS_PATH, message.guild.id, target.id);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🧨 Data reset ejecutado')
          .setColor(0xED4245)
          .setDescription([
            `Se eliminó la economía de <@${target.id}>.`,
            '',
            `💰 Eliminado: ${formatCurrency(wallet, config)} en mano y ${formatCurrency(bank, config)} en banco.`,
            `⏳ Cooldowns borrados: **${removedCooldowns}**`,
            `🏦 Préstamos borrados: **${removedLoan ? 'sí' : 'no'}**`,
            `🕵️ Robos borrados: **${robbery.removedEntries}** | víctima: **${robbery.removedVictim ? 'sí' : 'no'}**`,
            `📈 Pasivo borrado: **${removedPassive ? 'sí' : 'no'}**`,
            `🧾 Logs borrados: grant **${removedGrantLogs}** / remove **${removedRemoveLogs}**`,
            `🗑️ Registro de usuario borrado: **${removedUserRecord ? 'sí' : 'no'}**`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getLeaderboard, getGuildConfig } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { getSeasonState, lockEconomySeason } = require('../utils/economySeasonStore');

const OWNER_ID = '1407737422732853331';

const USERS_PATH = path.join(__dirname, '../economy-users.json');
const COOLDOWNS_PATH = path.join(__dirname, '../economy-cooldowns.json');
const LOANS_PATH = path.join(__dirname, '../economy-loans.json');
const ROBBERY_PATH = path.join(__dirname, '../economy-robbery.json');
const ROBBERY_LOGS_PATH = path.join(__dirname, '../economy-robbery-logs.json');
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

function clearObjectGuildKey(filePath, guildId) {
  const all = readJson(filePath, {});
  if (!all[guildId]) return false;
  delete all[guildId];
  writeJson(filePath, all);
  return true;
}

function clearArrayGuildEntries(filePath, guildId) {
  const all = readJson(filePath, []);
  if (!Array.isArray(all)) return 0;
  const filtered = all.filter(entry => String(entry?.guildId || '') !== guildId);
  const removed = all.length - filtered.length;
  if (removed > 0) writeJson(filePath, filtered);
  return removed;
}

function getTopActivityUserId(users) {
  return Object.entries(users)
    .map(([userId, data]) => ({
      userId,
      activity: (Number(data?.totalEarned) || 0) + (Number(data?.totalSpent) || 0),
    }))
    .sort((a, b) => b.activity - a.activity)
    .find(entry => entry.activity > 0)?.userId || null;
}

function clearGuildEconomyData(guildId) {
  const users = readJson(USERS_PATH, {});
  const cooldowns = readJson(COOLDOWNS_PATH, {});
  const loans = readJson(LOANS_PATH, {});
  const robbery = readJson(ROBBERY_PATH, {});
  const passive = readJson(PASSIVE_PATH, {});
  const robberyLogs = readJson(ROBBERY_LOGS_PATH, []);

  const hadUsers = Boolean(users[guildId]);
  const hadCooldowns = Boolean(cooldowns[guildId]);
  const hadLoans = Boolean(loans[guildId]);
  const hadRobbery = Boolean(robbery[guildId]);
  const hadPassive = Boolean(passive[guildId]);

  delete users[guildId];
  delete cooldowns[guildId];
  delete loans[guildId];
  delete robbery[guildId];
  delete passive[guildId];

  const filteredRobberyLogs = Array.isArray(robberyLogs)
    ? robberyLogs.filter(entry => String(entry?.guildId || '') !== guildId)
    : [];

  writeJson(USERS_PATH, users);
  writeJson(COOLDOWNS_PATH, cooldowns);
  writeJson(LOANS_PATH, loans);
  writeJson(ROBBERY_PATH, robbery);
  writeJson(PASSIVE_PATH, passive);
  writeJson(ROBBERY_LOGS_PATH, filteredRobberyLogs);

  return {
    hadUsers,
    hadCooldowns,
    hadLoans,
    hadRobbery,
    hadPassive,
    removedRobberyLogs: Math.max(0, (Array.isArray(robberyLogs) ? robberyLogs.length : 0) - filteredRobberyLogs.length),
    removedGrantLogs: clearObjectGuildKey(GRANT_LOGS_PATH, guildId) ? 1 : 0,
    removedRemoveLogs: clearObjectGuildKey(REMOVE_LOGS_PATH, guildId) ? 1 : 0,
    removedOverrideLogs: clearArrayGuildEntries(PASSIVE_PATH, guildId),
  };
}

async function ensureSeasonRoles(guild, seasonNumber) {
  const top10Name = `Top 10 - Season ${seasonNumber}`;
  const top1Name = `Top 1 - Season ${seasonNumber}`;

  const findOrCreate = async (name, color) => {
    const existing = guild.roles.cache.find(role => role.name === name) || await guild.roles.fetch().then(() => guild.roles.cache.find(role => role.name === name)).catch(() => null);
    if (existing) return existing;

    return guild.roles.create({
      name,
      color,
      mentionable: false,
      hoist: true,
      reason: `Season role created for ${name}`,
    });
  };

  const top10Role = await findOrCreate(top10Name, 0xF1C40F);
  const top1Role = await findOrCreate(top1Name, 0xE67E22);

  return { top10Role, top1Role };
}

async function awardSeasonRoles(guild, seasonNumber, ranking, topActivityUserId) {
  const results = { assigned: 0, skipped: 0, errors: 0 };
  if (!ranking.length) return results;

  let top10Role = null;
  let top1Role = null;

  try {
    ({ top10Role, top1Role } = await ensureSeasonRoles(guild, seasonNumber));
  } catch (error) {
    results.errors += 1;
    console.error('Error creando roles de season:', error);
  }

  if (!top10Role) return results;

  for (let index = 0; index < Math.min(10, ranking.length); index += 1) {
    const entry = ranking[index];
    const member = await guild.members.fetch(entry.userId).catch(() => null);
    if (!member) {
      results.skipped += 1;
      continue;
    }

    try {
      await member.roles.add(top10Role, `Season ${seasonNumber} top 10 reward`).catch(() => null);
      results.assigned += 1;
    } catch (error) {
      results.errors += 1;
      console.error('Error asignando rol de season:', error);
    }
  }

  if (top1Role && topActivityUserId) {
    const top1Member = await guild.members.fetch(topActivityUserId).catch(() => null);
    if (top1Member) {
      try {
        await top1Member.roles.add(top1Role, `Season ${seasonNumber} top 1 reward by activity`).catch(() => null);
        results.assigned += 1;
      } catch (error) {
        results.errors += 1;
        console.error('Error asignando rol Top 1 de season:', error);
      }
    } else {
      results.skipped += 1;
    }
  }

  return results;
}

module.exports = {
  name: 'resetseason',
  aliases: ['rs', 'seasonreset'],
  help: {
    purpose: 'Cierra la season, resetea la economía del servidor y bloquea los comandos económicos.',
    category: '💰 Economía',
    adminOnly: true,
  },
  async execute(message) {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Solo el dueño del bot puede usar este comando.');
    }

    if (!message.guild) {
      return message.reply('❌ Este comando solo se puede usar en un servidor.');
    }

    const guildId = message.guild.id;
    const seasonState = getSeasonState(guildId);
    const rawUsers = readJson(USERS_PATH, {});
    const guildUsers = rawUsers[guildId] || {};
    const ranking = getLeaderboard(guildId, 10, 0);
    const topActivityUserId = getTopActivityUserId(guildUsers);
    const seasonNumber = seasonState.seasonNumber;
    const config = getGuildConfig(guildId);

    const resetResult = clearGuildEconomyData(guildId);
    const lockedState = lockEconomySeason(guildId, {
      by: message.author.id,
      at: Date.now(),
      reason: `Reset de season ${seasonNumber}`,
    });

    const roleResult = await awardSeasonRoles(message.guild, seasonNumber, ranking, topActivityUserId);
    const topEntries = ranking.slice(0, 10);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle(`🧨 Season ${seasonNumber} reseteada`)
          .setColor(0xED4245)
          .setDescription([
            'Se borró la economía del servidor y quedaron desactivados los comandos de economía.',
            `Season actual: **${lockedState.seasonNumber}** • Estado: **cerrada**`,
            '',
            `🧹 Usuarios borrados: **${resetResult.hadUsers ? 'sí' : 'no'}**`,
            `⏳ Cooldowns borrados: **${resetResult.hadCooldowns ? 'sí' : 'no'}**`,
            `🏦 Préstamos borrados: **${resetResult.hadLoans ? 'sí' : 'no'}**`,
            `🕵️ Robos borrados: **${resetResult.hadRobbery ? 'sí' : 'no'}**`,
            `📈 Pasivo borrado: **${resetResult.hadPassive ? 'sí' : 'no'}**`,
            `🧾 Logs de grant/remove borrados: **${resetResult.removedGrantLogs + resetResult.removedRemoveLogs}**`,
            `🏅 Roles de season: **${roleResult.assigned}** asignados, **${roleResult.skipped}** omitidos, **${roleResult.errors}** errores`,
          ].join('\n'))
          .addFields(
            {
              name: 'Top 10 de la season',
              value: topEntries.length
                ? topEntries.map((entry, index) => `${index === 0 ? '🥇' : `#${index + 1}`} <@${entry.userId}> — ${formatCurrency(entry.total, config)}`).join('\n')
                : 'No había usuarios para rankear.',
              inline: false,
            },
            {
              name: 'Top 1 por actividad',
              value: topActivityUserId ? `<@${topActivityUserId}>` : 'No había actividad suficiente.',
              inline: false,
            },
          )
          .setTimestamp(),
      ],
    });
  },
};

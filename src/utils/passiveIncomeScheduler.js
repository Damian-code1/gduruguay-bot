const {
  getGuildPassiveConfig,
  getTrackedPassiveUserIds,
  tryGrantPassiveIncome,
} = require('./passiveIncomeStore');

let scheduler = null;
const TICK_MS = 60_000;

async function runPassiveTick(client) {
  const now = Date.now();

  for (const guild of client.guilds.cache.values()) {
    const config = getGuildPassiveConfig(guild.id);
    const roleRewards = config.roleRewards || {};
    const roleIds = Object.keys(roleRewards);
    if (!roleIds.length) continue;

    const candidateIds = new Set(getTrackedPassiveUserIds(guild.id));

    for (const roleId of roleIds) {
      const role = guild.roles.cache.get(roleId);
      if (!role) continue;
      for (const memberId of role.members.keys()) {
        candidateIds.add(memberId);
      }
    }

    for (const userId of candidateIds) {
      const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
      if (!member || member.user?.bot) continue;
      tryGrantPassiveIncome(guild.id, member, now);
    }
  }
}

function startPassiveIncomeScheduler(client) {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }

  runPassiveTick(client).catch(error => {
    console.error('Error en passive income tick inicial:', error);
  });

  scheduler = setInterval(() => {
    runPassiveTick(client).catch(error => {
      console.error('Error en passive income tick:', error);
    });
  }, TICK_MS);
}

module.exports = {
  startPassiveIncomeScheduler,
};

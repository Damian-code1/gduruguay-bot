const { initializeRecurringReminders } = require('../utils/remindmeScheduler');
const { startPassiveIncomeScheduler } = require('../utils/passiveIncomeScheduler');
const { startBirthdayScheduler } = require('../utils/birthdayScheduler');
const { initializeTempBanScheduler } = require('../utils/tempBanScheduler');
const { resumeGiveaways } = require('../utils/giveawayService');
const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    initializeRecurringReminders(client);
    startPassiveIncomeScheduler(client);
    startBirthdayScheduler(client);
    initializeTempBanScheduler(client);
    resumeGiveaways(client).catch(error => {
      console.warn('[ready] giveaway resume failed', error);
    });
    // Iniciar recommender de AniList si está habilitado
    try {
      const { init: initAnilistRecommender } = require('../utils/anilistRecommender');
      initAnilistRecommender(client);
    } catch (e) {
      console.warn('[ready] anilistRecommender init failed', e);
    }
    console.log(`Bot listo: ${client.user.tag}`);

    // Contamos humanos reales del servidor completo.
    // Esto requiere traer los miembros de cada guild para evitar errores de caché.
    const guildCounts = [];
    for (const guild of client.guilds.cache.values()) {
      try {
        await guild.members.fetch();
        guildCounts.push(guild.members.cache.filter(member => !member.user?.bot).size);
      } catch {
        guildCounts.push(Math.max(0, (guild.memberCount || 0) - guild.members.cache.filter(member => member.user?.bot).size));
      }
    }
    const totalMembers = guildCounts.reduce((acc, count) => acc + count, 0);
    
    client.user.setPresence({
      activities: [{ name: `👤${totalMembers} miembros · GD Uruguay`, type: ActivityType.Watching }],
      status: 'online'
    });
    console.log(`Presencia actualizada: ${totalMembers} miembros`);
  }
};
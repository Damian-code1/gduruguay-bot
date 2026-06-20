const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, addToWallet, getRemainingCooldown, setCooldown, getUserBalance, randomInt, setDailyProgress } = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { getWealthMultiplier, scaleRewardForEconomy, BASE_REWARD_BUFF } = require('../utils/economyScaling');

module.exports = {
  name: 'daily',
  aliases: ['d'],
  help: {
    purpose: 'Reclama tu recompensa diaria de economía.',
    category: '💰 Economía',
  },
  async execute(message) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = getGuildConfig(guildId);
    const balance = getUserBalance(guildId, userId);

    const remaining = getRemainingCooldown(guildId, userId, 'daily', config.dailyCooldownMs);
    if (remaining > 0) {
      const embed = new EmbedBuilder()
        .setTitle('⏳ Daily en cooldown')
        .setColor(0xE67E22)
        .setDescription(`Podés reclamar de nuevo en **${cooldownText(remaining)}**.`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const lastDailyAt = Number(balance.lastDailyAt) || 0;
    const oneDay = 86_400_000;
    const streakWindow = oneDay * 2;
    const currentStreak = (Date.now() - lastDailyAt) <= streakWindow && lastDailyAt > 0
      ? (Number(balance.dailyStreak) || 0) + 1
      : 1;

    const rawStreakBonus = Math.min(2500, currentStreak * randomInt(120, 220));
    const rawTotalReward = config.dailyReward + rawStreakBonus;
    const totalReward = scaleRewardForEconomy(rawTotalReward, balance.total);
    const streakBonus = Math.floor((rawStreakBonus / Math.max(1, rawTotalReward)) * totalReward);
    const baseDaily = Math.max(0, totalReward - streakBonus);

    addToWallet(guildId, userId, totalReward);
    setDailyProgress(guildId, userId, currentStreak, Date.now());

    setCooldown(guildId, userId, 'daily', Date.now());

    const embed = new EmbedBuilder()
      .setTitle('🎁 Daily reclamado')
      .setColor(0x2ECC71)
      .setDescription(`Ganaste ${formatCurrency(totalReward, config)}.`)
      .addFields(
        { name: 'Base', value: formatCurrency(baseDaily, config), inline: true },
        { name: 'Bonus racha', value: formatCurrency(streakBonus, config), inline: true },
        { name: 'Racha', value: `${currentStreak} día(s)`, inline: true },
        { name: 'Escalado economía', value: `x${BASE_REWARD_BUFF} base • patrimonio x${getWealthMultiplier(balance.total)}`, inline: false },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

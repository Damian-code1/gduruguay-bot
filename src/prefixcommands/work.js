const { EmbedBuilder } = require('discord.js');
const {
  getGuildConfig,
  addToWallet,
  getRemainingCooldown,
  setCooldown,
  randomInt,
  getIncomeBonusForMember,
  getUserBalance,
} = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { getWealthMultiplier, scaleRewardForEconomy, BASE_REWARD_BUFF } = require('../utils/economyScaling');

const GD_LEVELS = [
  'TON 618 (Unnerfed)',
  'Aeternus',
  'Bloodbath',
  'Slaughterhouse',
  'Tidal Wave',
  'Cataclysm',
  'Sonic Wave',
  'Nine Circles',
  'The Nightmare',
  'Sakupen Circles',
  'Kenos',
  'Acheron',
  'Kyouki',
  'Firework',
  'Zodiac',
  'Stereo Madness',
];

function buildRandomRunEvent() {
  const level = GD_LEVELS[randomInt(0, GD_LEVELS.length - 1)];
  const completion = Math.random() < 0.3;

  if (completion) {
    const start = randomInt(12, 88);
    return `hiciste ${start}-100 en ${level}`;
  }

  const start = randomInt(1, 92);
  const minEnd = Math.min(99, start + 6);
  const maxEnd = Math.min(99, start + 35);
  const end = randomInt(minEnd, maxEnd);
  return `hiciste ${start}-${end} en ${level}`;
}

module.exports = {
  name: 'work',
  aliases: ['w'],
  help: {
    purpose: 'Trabaja para ganar monedas.',
    category: '💰 Economía',
  },
  async execute(message) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = getGuildConfig(guildId);

    const remaining = getRemainingCooldown(guildId, userId, 'work', config.workCooldownMs);
    if (remaining > 0) {
      const embed = new EmbedBuilder()
        .setTitle('🛠️ Work en cooldown')
        .setColor(0xE67E22)
        .setDescription(`Podés volver a trabajar en **${cooldownText(remaining)}**.`)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const currentBalance = getUserBalance(guildId, userId);
    const rawBaseAmount = randomInt(config.workRewardMin, config.workRewardMax);
    const baseAmount = scaleRewardForEconomy(rawBaseAmount, currentBalance.total);
    const incomeBonus = getIncomeBonusForMember(guildId, message.member);
    const bonusAmount = incomeBonus.percent > 0 ? Math.floor(baseAmount * (incomeBonus.percent / 100)) : 0;
    const amount = baseAmount + bonusAmount;
    const job = buildRandomRunEvent();

    addToWallet(guildId, userId, amount);
    setCooldown(guildId, userId, 'work', Date.now());

    const embed = new EmbedBuilder()
      .setTitle('🛠️ Trabajo completado')
      .setColor(0x3498DB)
      .setDescription([
        `Hoy **${job}** y cobraste ${formatCurrency(amount, config)}.`,
        `Escalado economía: x${BASE_REWARD_BUFF} base • patrimonio x${getWealthMultiplier(currentBalance.total)}.`,
        bonusAmount > 0 ? `Bonus por roles shop (+${incomeBonus.percent}%): ${formatCurrency(bonusAmount, config)}.` : null,
      ].filter(Boolean).join('\n'))
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

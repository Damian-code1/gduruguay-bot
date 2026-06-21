const { EmbedBuilder } = require('discord.js');
const {
  getGuildConfig,
  getRemainingCooldown,
  setCooldown,
  randomInt,
  addToWallet,
  removeFromWallet,
  getUserBalance,
  getIncomeBonusForMember,
} = require('../utils/economyStore');
const { getIncomeAction, listIncomeActions } = require('../utils/incomeActions');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { getWealthMultiplier, scaleRewardForEconomy, BASE_REWARD_BUFF } = require('../utils/economyScaling');

const incomeResetTimers = new Map();

async function scheduleIncomeResetPing(message, guildId, userId) {
  const methods = listIncomeActions();
  let maxRemaining = 0;

  for (const item of methods) {
    const remaining = await getRemainingCooldown(guildId, userId, `income_${item.key}`, item.cooldownMs);
    if (remaining > maxRemaining) {
      maxRemaining = remaining;
    }
  }

  const timerKey = `${guildId}:${userId}`;
  const previousTimer = incomeResetTimers.get(timerKey);
  if (previousTimer) {
    clearTimeout(previousTimer);
    incomeResetTimers.delete(timerKey);
  }

  if (maxRemaining <= 0) {
    return;
  }

  const channelId = message.channel.id;
  const timer = setTimeout(async () => {
    incomeResetTimers.delete(timerKey);

    let latestRemaining = 0;
    for (const item of methods) {
      const r = await getRemainingCooldown(guildId, userId, `income_${item.key}`, item.cooldownMs);
      latestRemaining = Math.max(latestRemaining, r);
    }

    if (latestRemaining > 0) {
      return;
    }

    const channel = message.client.channels.cache.get(channelId)
      || await message.client.channels.fetch(channelId).catch(() => null);

    if (!channel?.isTextBased?.()) {
      return;
    }

    await channel.send(`<@${userId}> ✅ Ya se resetearon todos tus cooldowns de income.`).catch(() => null);
  }, maxRemaining + 750);

  incomeResetTimers.set(timerKey, timer);
}

module.exports = {
  name: 'income',
  aliases: ['inc'],
  help: {
    purpose: '10 formas de generar ingresos con riesgo de pérdida.',
    category: '💰 Economía',
    hiddenInCmds: true,
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = await getGuildConfig(guildId);

    const method = String(args[0] || 'list').toLowerCase();

    if (method === 'list' || method === 'help' || method === 'ayuda') {
      const methods = listIncomeActions();
      const lines = methods.map(item => `• \`-${item.key}\` — ${item.label} (cd ${Math.floor(item.cooldownMs / 60000)}m)`);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('💸 Métodos de ingreso (riesgo/recompensa)')
            .setColor(0x5865F2)
            .setDescription(lines.join('\n'))
            .setFooter({ text: 'Uso: -crime, -hunt, -fish... o -income <metodo|all>' }),
        ],
      });
    }

    if (method === 'all' || method === 'todos' || method === 'todo') {
      const methods = listIncomeActions();
      const lines = [];
      let totalWon = 0;
      let totalLost = 0;
      let totalBonusApplied = 0;
      let totalEconomyBuff = 0;
      let played = 0;
      let inCooldown = 0;
      const incomeBonus = await getIncomeBonusForMember(guildId, message.member);

      for (const item of methods) {
        const cooldownKey = `income_${item.key}`;
        const remaining = await getRemainingCooldown(guildId, userId, cooldownKey, item.cooldownMs);

        if (remaining > 0) {
          inCooldown += 1;
          lines.push(`⏳ **${item.label}** — cooldown: ${cooldownText(remaining)}`);
          continue;
        }

        await setCooldown(guildId, userId, cooldownKey, Date.now());

        const success = Math.random() < item.successChance;
        let amount = 0;

        if (success) {
          const current = await getUserBalance(guildId, userId);
          const rawBaseAmount = randomInt(item.rewardMin, item.rewardMax);
          const baseAmount = scaleRewardForEconomy(rawBaseAmount, current.total);
          const bonusAmount = incomeBonus.percent > 0 ? Math.floor(baseAmount * (incomeBonus.percent / 100)) : 0;
          amount = baseAmount + bonusAmount;
          await addToWallet(guildId, userId, amount);
          totalWon += amount;
          totalBonusApplied += bonusAmount;
          totalEconomyBuff += Math.max(0, baseAmount - rawBaseAmount);
          lines.push(
            bonusAmount > 0
              ? `✅ **${item.label}** — +${formatCurrency(amount, config)} (base ${formatCurrency(baseAmount, config)} + bonus ${formatCurrency(bonusAmount, config)})`
              : `✅ **${item.label}** — +${formatCurrency(amount, config)}`
          );
        } else {
          const candidate = randomInt(item.lossMin, item.lossMax);
          const current = await getUserBalance(guildId, userId);
          amount = Math.min(candidate, current.wallet);

          if (amount > 0) {
            await removeFromWallet(guildId, userId, amount);
            totalLost += amount;
            lines.push(`❌ **${item.label}** — -${formatCurrency(amount, config)}`);
          } else {
            lines.push(`❌ **${item.label}** — no perdiste nada (sin saldo en mano)`);
          }
        }

        played += 1;
      }

      const net = totalWon - totalLost;
      const wealthNow = (await getUserBalance(guildId, userId)).total;
      const summaryLines = [
        `Métodos jugados: **${played}/${methods.length}**`,
        incomeBonus.percent > 0
          ? `Bonus por roles shop: **+${incomeBonus.percent}%** (${incomeBonus.roles.length} rol(es))`
          : 'Bonus por roles shop: **+0%**',
        `Escalado por economía: **x${BASE_REWARD_BUFF} base** + multiplicador por patrimonio (actual: **x${getWealthMultiplier(wealthNow)}**)`,
        inCooldown > 0 ? `En cooldown: **${inCooldown}**` : null,
        totalWon > 0 ? `Ganado total: ${formatCurrency(totalWon, config)}` : `Ganado total: ${formatCurrency(0, config)}`,
        totalEconomyBuff > 0 ? `Buff economía aplicado: ${formatCurrency(totalEconomyBuff, config)}` : null,
        totalBonusApplied > 0 ? `Bonus aplicado total: ${formatCurrency(totalBonusApplied, config)}` : null,
        totalLost > 0 ? `Perdido total: ${formatCurrency(totalLost, config)}` : `Perdido total: ${formatCurrency(0, config)}`,
        net >= 0
          ? `Balance neto: **+${formatCurrency(net, config)}**`
          : `Balance neto: **-${formatCurrency(Math.abs(net), config)}**`,
      ].filter(Boolean);

      const embed = new EmbedBuilder()
        .setTitle('💸 Income All')
        .setColor(net >= 0 ? 0x2ECC71 : 0xED4245)
        .setDescription([...summaryLines, '', ...lines].join('\n'))
        .setFooter({ text: 'Comando masivo: -income all / -workall / -all' })
        .setTimestamp();

      await scheduleIncomeResetPing(message, guildId, userId);
      return message.reply({ embeds: [embed] });
    }

    const action = getIncomeAction(method);
    if (!action) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Método inválido').setColor(0xED4245).setDescription('Usa `-list` o `-income list` para ver los métodos disponibles. También podés usar `-income all`.')],
      });
    }

    const cooldownKey = `income_${method}`;
    const remaining = await getRemainingCooldown(guildId, userId, cooldownKey, action.cooldownMs);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ En cooldown')
            .setColor(0xE67E22)
            .setDescription(`Podés volver a usar **${method}** en **${cooldownText(remaining)}**.`),
        ],
      });
    }

    await setCooldown(guildId, userId, cooldownKey, Date.now());

    const success = Math.random() < action.successChance;
    let amount = 0;
    let baseReward = 0;
    let rawBaseReward = 0;
    let bonusReward = 0;
    const incomeBonus = await getIncomeBonusForMember(guildId, message.member);

    if (success) {
      const current = await getUserBalance(guildId, userId);
      rawBaseReward = randomInt(action.rewardMin, action.rewardMax);
      baseReward = scaleRewardForEconomy(rawBaseReward, current.total);
      bonusReward = incomeBonus.percent > 0 ? Math.floor(baseReward * (incomeBonus.percent / 100)) : 0;
      amount = baseReward + bonusReward;
      await addToWallet(guildId, userId, amount);
    } else {
      const candidate = randomInt(action.lossMin, action.lossMax);
      const current = await getUserBalance(guildId, userId);
      amount = Math.min(candidate, current.wallet);
      if (amount > 0) {
        await removeFromWallet(guildId, userId, amount);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(success ? `✅ ${action.label}` : `❌ ${action.label}`)
      .setColor(success ? 0x2ECC71 : 0xED4245)
      .setDescription([
        success ? action.successText : action.failText,
        '',
        success
          ? `Ganaste ${formatCurrency(amount, config)}.`
          : amount > 0
            ? `Perdiste ${formatCurrency(amount, config)}.`
            : 'No perdiste nada porque no tenías saldo en mano.',
        success ? `Escalado economía: x${BASE_REWARD_BUFF} base, patrimonio actual x${getWealthMultiplier((await getUserBalance(guildId, userId)).total)}.` : null,
        success ? `Buff economía aplicado: ${formatCurrency(Math.max(0, baseReward - rawBaseReward), config)}.` : null,
        success && bonusReward > 0
          ? `Bonus rol shop: +${incomeBonus.percent}% (${formatCurrency(bonusReward, config)} extra)`
          : null,
      ].join('\n'))
      .setFooter({ text: `Método: ${method}` })
      .setTimestamp();

    await scheduleIncomeResetPing(message, guildId, userId);

    return message.reply({ embeds: [embed] });
  },
};

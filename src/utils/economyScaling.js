const BASE_REWARD_BUFF = 40;

function getWealthMultiplier(totalBalance) {
  const total = Math.max(0, Number(totalBalance) || 0);

  if (total < 1_000_000) return 1;
  if (total < 10_000_000) return 1.15;
  if (total < 100_000_000) return 1.35;
  if (total < 1_000_000_000) return 1.7;
  if (total < 10_000_000_000) return 2.2;
  if (total < 100_000_000_000) return 2.9;
  return 3.8;
}

function scaleRewardForEconomy(baseAmount, totalBalance) {
  const base = Math.max(0, Number(baseAmount) || 0);
  const wealthMultiplier = getWealthMultiplier(totalBalance);
  return Math.max(1, Math.floor(base * BASE_REWARD_BUFF * wealthMultiplier));
}

module.exports = {
  BASE_REWARD_BUFF,
  getWealthMultiplier,
  scaleRewardForEconomy,
};

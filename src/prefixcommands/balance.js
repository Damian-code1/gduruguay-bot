const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getUserBalance, getIncomeBonusForMember } = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { getPassiveStatus } = require('../utils/passiveIncomeStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

module.exports = {
  name: 'balance',
  aliases: ['bal'],
  help: {
    purpose: 'Muestra tu saldo o el de otro usuario.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const resolved = await resolveUserTarget(message, args[0]);
    const target = resolved?.user || message.author;
    const targetMember = resolved?.member || await message.guild.members.fetch(target.id).catch(() => null);
    const config = getGuildConfig(message.guild.id);
    const balance = getUserBalance(message.guild.id, target.id);
    const passiveStatus = targetMember ? getPassiveStatus(message.guild.id, targetMember) : null;
    const incomeBonus = targetMember ? getIncomeBonusForMember(message.guild.id, targetMember) : { percent: 0, roles: [] };

    const fields = [
      { name: 'En mano', value: formatCurrency(balance.wallet, config), inline: true },
      { name: 'Banco', value: formatCurrency(balance.bank, config), inline: true },
      { name: 'Total', value: formatCurrency(balance.total, config), inline: true },
    ];

    if (passiveStatus?.perInterval > 0) {
      fields.push({
        name: 'Passive income',
        value: `${formatCurrency(passiveStatus.perInterval, config)} cada ${cooldownText(passiveStatus.intervalMs)}`,
        inline: false,
      });
    }

    fields.push({
      name: 'Bonus income (shop)',
      value: `+${incomeBonus.percent || 0}% (${incomeBonus.roles?.length || 0} rol(es))`,
      inline: false,
    });

    fields.push({
      name: 'Estadísticas',
      value: [
        `Ganado: ${formatCurrency(balance.totalEarned, config)}`,
        `Gastado: ${formatCurrency(balance.totalSpent, config)}`,
        `Pasivo acumulado: ${formatCurrency(passiveStatus?.totalEarned || 0, config)}`,
      ].join('\n'),
      inline: false,
    });

    const embed = new EmbedBuilder()
      .setTitle('💰 Balance')
      .setColor(0xF1C40F)
      .setDescription(`Cuenta de <@${target.id}>`)
      .addFields(fields)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

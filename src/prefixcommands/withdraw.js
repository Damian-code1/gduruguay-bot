const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getUserBalance, withdrawFromBank } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');

function parseAmountInput(raw, bank) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;

  if (value === 'all' || value === 'todo') return bank;
  if (value === 'half' || value === 'mitad') return Math.floor(bank / 2);

  const num = Number(value.replace(/[,_\s]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

module.exports = {
  name: 'withdraw',
  aliases: ['wd'],
  help: {
    purpose: 'Retira monedas del banco a tu saldo en mano.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = getGuildConfig(guildId);
    const balance = getUserBalance(guildId, userId);

    if (balance.bank <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏦 Banco vacío')
            .setColor(0xED4245)
            .setDescription('No tenés monedas en el banco para retirar.'),
        ],
      });
    }

    const parsedAmount = parseAmountInput(args.join(' '), balance.bank);
    if (!parsedAmount) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso inválido')
            .setColor(0xED4245)
            .setDescription('Uso: `-withdraw <monto|all|half>`\nAtajo: `-wd <monto|all|half>`'),
        ],
      });
    }

    if (parsedAmount > balance.bank) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Fondos insuficientes')
            .setColor(0xED4245)
            .setDescription('No tenés suficiente saldo en el banco para ese retiro.'),
        ],
      });
    }

    const withdrawn = withdrawFromBank(guildId, userId, parsedAmount);
    const after = getUserBalance(guildId, userId);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🏦 Retiro completado')
          .setColor(0x2ECC71)
          .setDescription(`Retiraste ${formatCurrency(withdrawn, config)} del banco.`)
          .addFields(
            { name: 'Retirado ahora', value: formatCurrency(withdrawn, config), inline: true },
            { name: 'En mano', value: formatCurrency(after.wallet, config), inline: true },
            { name: 'Banco', value: formatCurrency(after.bank, config), inline: true },
            { name: 'Total', value: formatCurrency(after.total, config), inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

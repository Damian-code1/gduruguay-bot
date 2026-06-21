const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getUserBalance, depositToBank } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');

function parseAmountInput(raw, wallet) {
  const value = String(raw || '').trim().toLowerCase();
  if (!value) return null;

  if (value === 'all' || value === 'todo') return wallet;
  if (value === 'half' || value === 'mitad') return Math.floor(wallet / 2);

  const num = Number(value.replace(/[,\s]/g, ''));
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.floor(num);
}

module.exports = {
  name: 'deposit',
  aliases: ['dep', 'bank'],
  help: {
    purpose: 'Guarda monedas en el banco para protegerlas de robos.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = await getGuildConfig(guildId);
    const balance = await getUserBalance(guildId, userId);

    if (balance.wallet <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏦 Sin saldo en mano')
            .setColor(0xED4245)
            .setDescription('No tenés monedas en mano para depositar.'),
        ],
      });
    }

    const parsedAmount = parseAmountInput(args.join(' '), balance.wallet);
    if (!parsedAmount) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso inválido')
            .setColor(0xED4245)
            .setDescription('Uso: `-deposit <monto|all|half>`\nEjemplo: `-deposit all`'),
        ],
      });
    }

    if (parsedAmount > balance.wallet) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Fondos insuficientes')
            .setColor(0xED4245)
            .setDescription('No tenés suficiente saldo en mano para ese depósito.'),
        ],
      });
    }

    const deposited = await depositToBank(guildId, userId, parsedAmount);
    const after = await getUserBalance(guildId, userId);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🏦 Depósito completado')
          .setColor(0x2ECC71)
          .setDescription(`Depositaste ${formatCurrency(deposited, config)} en el banco.`)
          .addFields(
            { name: 'Depositado ahora', value: formatCurrency(deposited, config), inline: true },
            { name: 'En mano', value: formatCurrency(after.wallet, config), inline: true },
            { name: 'Banco', value: formatCurrency(after.bank, config), inline: true },
            { name: 'Total', value: formatCurrency(after.total, config), inline: true },
          )
          .setTimestamp(),
      ],
    });
  },
};

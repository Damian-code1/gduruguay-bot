const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getUserBalance, transferWallet } = require('../utils/economyStore');
const { formatCurrency, parseAmountInput } = require('../utils/economyHelpers');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

module.exports = {
  name: 'pay',
  help: {
    purpose: 'Transfiere monedas a otro usuario.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const target = await resolveUserTarget(message, args[0]);
    if (!target || target.user.bot || target.id === message.author.id) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-pay @usuario|userId <cantidad|all|half>`')],
      });
    }

    const config = getGuildConfig(message.guild.id);
    const balance = getUserBalance(message.guild.id, message.author.id);
    const amount = parseAmountInput(args.slice(1).join(' '), balance.wallet);

    if (!amount || amount <= 0) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Cantidad inválida').setColor(0xED4245).setDescription('Ejemplos: `-pay @user 500`, `-pay @user all`, `-pay @user half`')],
      });
    }

    const transferred = transferWallet(message.guild.id, message.author.id, target.id, amount);
    if (!transferred) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Fondos insuficientes').setColor(0xED4245).setDescription('No tenés suficiente saldo para esa transferencia.')],
      });
    }

    const embed = new EmbedBuilder()
      .setTitle('💸 Transferencia realizada')
      .setColor(0x2ECC71)
      .setDescription(`Transferiste ${formatCurrency(amount, config)} a <@${target.id}>.`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

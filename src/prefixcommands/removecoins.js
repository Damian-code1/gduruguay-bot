const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, getUserBalance, removeFromWallet } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { addRemoveCoinsLog } = require('../utils/removeCoinsLogStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

module.exports = {
  name: 'removecoins',
  aliases: ['rc'],
  help: {
    purpose: 'Remueve monedas de un usuario (deja registro en logs). Alias: -rc | Logs: -rclog',
    category: '💰 Economía',
    adminOnly: true,
  },
  async execute(message, args) {
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isAdmin) {
      return message.reply('❌ Este comando es solo para administradores.');
    }

    const target = await resolveUserTarget(message, args[0]);
    const amountRaw = target ? args[1] : args[0];
    const amount = Number(String(amountRaw || '').replace(/[,_\s]/g, ''));

    if (!target || !Number.isFinite(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso inválido')
            .setColor(0xED4245)
            .setDescription('Uso: `-removecoins @usuario|userId <monto>`'),
        ],
      });
    }

    const balance = getUserBalance(message.guild.id, target.id);
    if (balance.wallet < amount) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Fondos insuficientes')
            .setColor(0xED4245)
            .setDescription(`${target} solo tiene ${formatCurrency(balance.wallet, getGuildConfig(message.guild.id))}`),
        ],
      });
    }

    removeFromWallet(message.guild.id, target.id, amount);
    addRemoveCoinsLog(message.guild.id, {
      at: Date.now(),
      staffId: message.author.id,
      staffTag: message.author.tag,
      targetId: target.id,
      targetTag: target.user?.tag || target.user?.username || '',
      amount,
      reason: 'Removido por admin',
    });

    const config = getGuildConfig(message.guild.id);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🗑️ Monedas removidas')
          .setColor(0xED4245)
          .setDescription(`Se removieron ${formatCurrency(amount, config)} de <@${target.id}> y se registró en logs.`)
          .setTimestamp(),
      ],
    });
  },
};

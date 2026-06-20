const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, addToWallet } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { addGrantCoinsLog } = require('../utils/grantCoinsLogStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

module.exports = {
  name: 'grantcoins',
  aliases: ['gc'],
  help: {
    purpose: 'Compensa monedas a un usuario cuando hay fallas del bot (actualiza estadísticas). Alias: -gc | Logs: -gclog',
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
            .setDescription('Uso: `-grantcoins @usuario|userId <monto>`'),
        ],
      });
    }

    addToWallet(message.guild.id, target.id, amount);
    addGrantCoinsLog(message.guild.id, {
      at: Date.now(),
      staffId: message.author.id,
      staffTag: message.author.tag,
      targetId: target.id,
      targetTag: target.user?.tag || target.user?.username || '',
      amount,
    });

    const config = getGuildConfig(message.guild.id);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🛠️ Compensación aplicada')
          .setColor(0x5865F2)
          .setDescription(`Se acreditaron ${formatCurrency(amount, config)} a <@${target.id}> y se actualizaron estadísticas.`)
          .setTimestamp(),
      ],
    });
  },
};

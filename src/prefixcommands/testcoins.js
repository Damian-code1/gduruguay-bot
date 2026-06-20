const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, addToWalletNoStats, setWalletNoStats } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'testcoins',
  aliases: ['tcoins'],
  help: {
    purpose: 'Comando interno de test para dar monedas sin afectar estadísticas.',
    category: '💰 Economía',
    adminOnly: true,
    hiddenInCmds: true,
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isAdmin) {
      return message.reply('Este comando es solo para administradores.');
    }

    const mentioned = message.mentions.members.first();
    const target = mentioned || message.member;

    const action = String(args[0] || '').toLowerCase();
    if (action === 'reset') {
      const resetTarget = message.mentions.members.first() || message.member;
      const allowedResetTarget = resetTarget.id === message.author.id || isStaff(resetTarget, guildId);

      if (!allowedResetTarget) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Objetivo no permitido')
              .setColor(0xED4245)
              .setDescription('Solo podés resetearte a vos mismo o a miembros staff.'),
          ],
        });
      }

      setWalletNoStats(guildId, resetTarget.id, 0);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🧪 Testcoins reset')
            .setColor(0x5865F2)
            .setDescription(`Se reseteó la billetera de <@${resetTarget.id}> a **0** sin tocar estadísticas.`)
            .setTimestamp(),
        ],
      });
    }

    const amountArg = mentioned ? args[1] : args[0];
    const amount = Number(String(amountArg || '').replace(/[,_\s]/g, ''));

    if (!Number.isFinite(amount) || amount <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso inválido')
            .setColor(0xED4245)
            .setDescription('Uso: `-testcoins <monto>`\n`-testcoins @staff <monto>`\n`-testcoins reset`\n`-testcoins reset @staff`'),
        ],
      });
    }

    const allowedTarget = target.id === message.author.id || isStaff(target, guildId);
    if (!allowedTarget) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Objetivo no permitido')
            .setColor(0xED4245)
            .setDescription('Solo podés darte monedas a vos mismo o a miembros staff.'),
        ],
      });
    }

    addToWalletNoStats(guildId, target.id, amount);

    const config = getGuildConfig(guildId);
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🧪 Monedas de test entregadas')
          .setColor(0x5865F2)
          .setDescription(`Se acreditaron ${formatCurrency(amount, config)} a <@${target.id}> sin tocar estadísticas.`)
          .setTimestamp(),
      ],
    });
  },
};

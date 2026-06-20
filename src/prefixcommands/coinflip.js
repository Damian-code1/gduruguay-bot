const { EmbedBuilder } = require('discord.js');
const {
  getGuildConfig,
  getUserBalance,
  addToWallet,
  removeFromWallet,
  getRemainingCooldown,
  setCooldown,
} = require('../utils/economyStore');
const { formatCurrency, parseAmountInput, cooldownText } = require('../utils/economyHelpers');

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SPECIAL_USER_ID = '1407737422732853331';
const SPECIAL_WIN_CHANCE = 0.9;
const COINFLIP_COOLDOWN_MS = 10 * 60 * 1000;

module.exports = {
  name: 'coinflip',
  help: {
    purpose: 'Apuesta monedas en cara o cruz con animación.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const sideRaw = String(args[0] || '').toLowerCase();
    const chosen = ['cara', 'heads', 'h'].includes(sideRaw) ? 'cara' : ['cruz', 'tails', 't'].includes(sideRaw) ? 'cruz' : null;

    if (!chosen) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('📖 Uso: -coinflip').setColor(0x5865F2).setDescription('`-coinflip <cara|cruz> <cantidad|all|half>`\nEjemplo: `-coinflip cara 5000`')],
      });
    }

    const config = getGuildConfig(message.guild.id);
    const remaining = getRemainingCooldown(message.guild.id, message.author.id, 'coinflip_cmd', COINFLIP_COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Coinflip en cooldown')
            .setColor(0xE67E22)
            .setDescription(`Podés volver a usar \`-coinflip\` en **${cooldownText(remaining)}**.`),
        ],
      });
    }

    const balance = getUserBalance(message.guild.id, message.author.id);
    const amount = parseAmountInput(args.slice(1).join(' '), balance.wallet);

    if (!amount || amount <= 0) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Cantidad inválida').setColor(0xED4245).setDescription('Ejemplos: `-coinflip cara 1000`, `-coinflip cruz all`')],
      });
    }

    if (balance.wallet < amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Fondos insuficientes').setColor(0xED4245).setDescription('No tienes suficiente saldo para esa apuesta.')],
      });
    }

    setCooldown(message.guild.id, message.author.id, 'coinflip_cmd', Date.now());

    const anim = new EmbedBuilder()
      .setTitle('🪙 Coinflip')
      .setColor(0xF1C40F)
      .setDescription([
        `Apuesta: ${formatCurrency(amount, config)}`,
        `Elegiste: **${chosen.toUpperCase()}**`,
        '',
        'Lanzando moneda... ⏳',
      ].join('\n'))
      .setTimestamp();

    const flipMessage = await message.reply({ embeds: [anim] });

    await sleep(850);
    await flipMessage.edit({
      embeds: [
        EmbedBuilder.from(anim).setDescription([
          `Apuesta: ${formatCurrency(amount, config)}`,
          `Elegiste: **${chosen.toUpperCase()}**`,
          '',
          '🪙 Lanzando la moneda...',
        ].join('\n')),
      ],
    }).catch(() => null);

    await sleep(650);

    const hasSpecialOdds = message.author.id === SPECIAL_USER_ID;
    const win = hasSpecialOdds ? Math.random() < SPECIAL_WIN_CHANCE : Math.random() < 0.5;
    const result = win
      ? chosen
      : chosen === 'cara'
        ? 'cruz'
        : 'cara';
    const beforeWallet = getUserBalance(message.guild.id, message.author.id).wallet;

    if (win) {
      addToWallet(message.guild.id, message.author.id, amount);
    } else {
      removeFromWallet(message.guild.id, message.author.id, amount);
    }

    const afterWallet = getUserBalance(message.guild.id, message.author.id).wallet;
    const realDelta = afterWallet - beforeWallet;
    const movementText = realDelta === 0
      ? 'Sin cambios reales (tu saldo cambió por otra acción al mismo tiempo).'
      : realDelta > 0
        ? `Ganancia real: ${formatCurrency(realDelta, config)}`
        : `Pérdida real: ${formatCurrency(Math.abs(realDelta), config)}`;

    const finalEmbed = new EmbedBuilder()
      .setTitle(win ? '🎉 ¡Ganaste!' : '💥 Perdiste')
      .setColor(win ? 0x2ECC71 : 0xED4245)
      .setDescription([
        `Resultado: **${result.toUpperCase()}**`,
        `Tu elección: **${chosen.toUpperCase()}**`,
        '',
        movementText,
      ].join('\n'))
      .setTimestamp();

    const edited = await flipMessage.edit({ embeds: [finalEmbed] }).catch(() => null);
    if (!edited) {
      return message.reply({ embeds: [finalEmbed] });
    }
    return null;
  },
};

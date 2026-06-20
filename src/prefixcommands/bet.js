const { EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');
const { getGuildConfig, getUserBalance, addToWallet, removeFromWallet, randomInt } = require('../utils/economyStore');
const { formatCurrency, parseAmountInput } = require('../utils/economyHelpers');
const { createGame, getGameState, setGameState, deleteGameState, calculateHand, dealerPlay, determineWinner } = require('../utils/blackjackGame');

function parseBetAmount(raw, balance) {
  const parsed = parseAmountInput(raw, balance);
  if (!parsed || parsed <= 0) return null;
  return parsed;
}

function rollSlots() {
  const symbols = ['🍒', '🍋', '🔔', '💎', '7️⃣'];
  return [
    symbols[randomInt(0, symbols.length - 1)],
    symbols[randomInt(0, symbols.length - 1)],
    symbols[randomInt(0, symbols.length - 1)],
  ];
}

function rouletteColor(num) {
  if (num === 0) return 'green';
  const red = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  return red.has(num) ? 'red' : 'black';
}

function getBonusMultiplier() {
  const roll = Math.random();
  if (roll < 0.12) return 2;
  if (roll < 0.135) return 3;
  if (roll < 0.14) return 4;
  return 1;
}

function applyHouseEdge(won) {
  if (won !== true) return won;
  const houseEdgeRoll = Math.random();
  return houseEdgeRoll < 0.22 ? false : true;
}

function rpsLabel(choice) {
  const labels = {
    rock: 'piedra',
    paper: 'papel',
    scissors: 'tijeras',
  };
  return labels[choice] || choice;
}

module.exports = {
  name: 'bet',
  help: {
    purpose: 'Apuestas avanzadas: dice, roulette, slots, highlow, oddoreven, rps, blackjack.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    let game = String(args[0] || '').toLowerCase();
    // Alias para blackjack
    if (game === 'bj') game = 'blackjack';
    
    const config = getGuildConfig(message.guild.id);
    const balance = getUserBalance(message.guild.id, message.author.id);

    if (!game || game === 'help' || game === 'list') {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🎰 Juegos de apuesta')
            .setColor(0x5865F2)
            .setDescription([
              '`-bet dice <monto> <1-6>`',
              '`-bet roulette <monto> <red|black|green|0-36>`',
              '`-bet slots <monto>`',
              '`-bet highlow <monto> <high|low>`',
              '`-bet oddoreven <monto> <odd|even>`',
              '`-bet rps <monto>`',
              '`-bet blackjack <monto|all|half>` o `-bet bj <monto|all|half>`',
            ].join('\n')),
        ],
      });
    }

    if (game === 'rps' && !args[1]) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Uso')
            .setColor(0xED4245)
            .setDescription('`-bet rps <monto>`'),
        ],
      });
    }

    const amount = parseBetAmount(args[1], balance.wallet);
    if (!amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Monto inválido').setColor(0xED4245).setDescription('Poné un monto válido (también sirve `all` o `half`).')],
      });
    }

    if (balance.wallet < amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Fondos insuficientes').setColor(0xED4245).setDescription('No tienes suficiente saldo para esa apuesta.')],
      });
    }

    let won = false;
    let title = '🎲 Resultado de apuesta';
    let details = '';
    let winReward = amount;
    let lossPenalty = amount;
    let bonusMultiplier = 1;

    if (game === 'dice') {
      const chosen = Number(args[2]);
      if (!Number.isInteger(chosen) || chosen < 1 || chosen > 6) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('❌ Uso').setColor(0xED4245).setDescription('`-bet dice <monto> <1-6>`')] });
      }
      const roll = randomInt(1, 6);
      won = roll === chosen;
      winReward = amount * 4;
      details = `Elegiste **${chosen}**, salió **${roll}**.`;
      title = '🎲 Dice';
    } else if (game === 'roulette') {
      const pickRaw = String(args[2] || '').toLowerCase();
      const resultNum = randomInt(0, 36);
      const resultColor = rouletteColor(resultNum);

      if (!pickRaw) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('❌ Uso').setColor(0xED4245).setDescription('`-bet roulette <monto> <red|black|green|0-36>`')] });
      }

      if (['red', 'black', 'green'].includes(pickRaw)) {
        won = pickRaw === resultColor;
        winReward = pickRaw === 'green' ? amount * 14 : amount;
      } else {
        const pickNum = Number(pickRaw);
        if (!Number.isInteger(pickNum) || pickNum < 0 || pickNum > 36) {
          return message.reply({ embeds: [new EmbedBuilder().setTitle('❌ Opción inválida').setColor(0xED4245).setDescription('Usa color o número 0-36.')] });
        }
        won = pickNum === resultNum;
        winReward = amount * 20;
      }

      details = `Salió **${resultNum} (${resultColor})**.`;
      title = '🎡 Roulette';
    } else if (game === 'slots') {
      const [a, b, c] = rollSlots();
      const line = `${a} ${b} ${c}`;
      if (a === b && b === c) {
        won = true;
        winReward = amount * (a === '7️⃣' ? 8 : 5);
      } else {
        won = false;
      }
      details = `Resultado: ${line}`;
      title = '🎰 Slots';
    } else if (game === 'highlow') {
      const pick = String(args[2] || '').toLowerCase();
      if (!['high', 'low'].includes(pick)) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('❌ Uso').setColor(0xED4245).setDescription('`-bet highlow <monto> <high|low>`')] });
      }
      const num = randomInt(1, 100);
      const category = num > 50 ? 'high' : num < 50 ? 'low' : 'neutral';
      won = (pick === 'high' && num > 50) || (pick === 'low' && num < 50);
      winReward = Math.floor(amount * 1.2);
      const categoryLabel = category === 'high' ? '🔴 ALTO (51-100)' : category === 'low' ? '🔵 BAJO (1-49)' : '⚪ NEUTRO (50)';
      const yourPick = pick === 'high' ? '🔴 ALTO' : '🔵 BAJO';
      details = `Tu apuesta: ${yourPick}\nResultado: **${num}** → ${categoryLabel}\n${won ? '✅ ¡Acertaste!' : '❌ Fallaste.'}`;
      title = '📈 HighLow';
    } else if (game === 'oddoreven') {
      const pick = String(args[2] || '').toLowerCase();
      if (!['odd', 'even'].includes(pick)) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('❌ Uso').setColor(0xED4245).setDescription('`-bet oddoreven <monto> <odd|even>`')] });
      }
      const num = randomInt(1, 20);
      const parity = num % 2 === 0 ? 'even' : 'odd';
      won = pick === parity;
      winReward = amount;
      details = `Salió **${num} (${parity})**.`;
      title = '➗ OddOrEven';
    } else if (game === 'rps') {
      const options = ['rock', 'paper', 'scissors'];
      const choiceEmoji = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️',
      };
      const choiceLabel = {
        rock: 'Piedra',
        paper: 'Papel',
        scissors: 'Tijeras',
      };
      const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };

      const promptEmbed = new EmbedBuilder()
        .setTitle('✂️ Piedra, Papel o Tijeras')
        .setColor(0x5865F2)
        .setDescription([
          `Apuesta: ${formatCurrency(amount, config)}`,
          'Elegí tu jugada con los botones.',
        ].join('\n'))
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rps_rock_${message.author.id}`).setLabel('Piedra').setEmoji(choiceEmoji.rock).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_paper_${message.author.id}`).setLabel('Papel').setEmoji(choiceEmoji.paper).setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rps_scissors_${message.author.id}`).setLabel('Tijeras').setEmoji(choiceEmoji.scissors).setStyle(ButtonStyle.Primary),
      );

      const promptMessage = await message.reply({ embeds: [promptEmbed], components: [row] });

      const finishRps = async (playerChoice, interaction = null) => {
        const botChoice = options[randomInt(0, options.length - 1)];
        const choiceText = `${choiceEmoji[playerChoice]} **${choiceLabel[playerChoice]}**`;
        const botText = `${choiceEmoji[botChoice]} **${choiceLabel[botChoice]}**`;

        if (playerChoice === botChoice) {
          won = null;
          winReward = 0;
          lossPenalty = 0;
        } else if (beats[playerChoice] === botChoice) {
          won = true;
          winReward = amount;
        } else {
          won = false;
          lossPenalty = amount;
        }

        const beforeWallet = getUserBalance(message.guild.id, message.author.id).wallet;
        let movedAmount = 0;

        if (won === true) {
          bonusMultiplier = getBonusMultiplier();
          const reward = Math.floor(winReward * bonusMultiplier);
          addToWallet(message.guild.id, message.author.id, reward);
        }
        if (won === false) {
          removeFromWallet(message.guild.id, message.author.id, lossPenalty);
        }

        const afterWallet = getUserBalance(message.guild.id, message.author.id).wallet;
        movedAmount = afterWallet - beforeWallet;

        const status = won === null ? '🤝 Empate' : won ? '✅ Ganaste' : '❌ Perdiste';
        const movement = movedAmount === 0
          ? 'Sin cambios reales'
          : movedAmount > 0
            ? `+ ${formatCurrency(movedAmount, config)}`
            : `- ${formatCurrency(Math.abs(movedAmount), config)}`;
        const bonusText = won === true && bonusMultiplier > 1
          ? `\nBonus multiplicador: **x${bonusMultiplier}**`
          : '';

        const finalEmbed = new EmbedBuilder()
          .setTitle('✂️ Piedra, Papel o Tijeras')
          .setColor(won === null ? 0x5865F2 : won ? 0x2ECC71 : 0xED4245)
          .setDescription([
            status,
            `Tu jugada: ${choiceText}`,
            `Bot: ${botText}`,
            '',
            `Movimiento: ${movement}${bonusText}`,
          ].join('\n'))
          .setTimestamp();

        if (interaction) {
          await interaction.update({ embeds: [finalEmbed], components: [] }).catch(() => null);
        } else {
          await promptMessage.edit({ embeds: [finalEmbed], components: [] }).catch(() => null);
        }
      };

      const collector = promptMessage.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id && i.customId.startsWith('rps_'),
        time: 30_000,
      });

      collector.on('collect', async interaction => {
        const choice = interaction.customId.includes('rock')
          ? 'rock'
          : interaction.customId.includes('paper')
            ? 'paper'
            : 'scissors';

        await finishRps(choice, interaction);
        collector.stop('resolved');
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          promptMessage.edit({
            embeds: [
              EmbedBuilder.from(promptEmbed)
                .setColor(0xE67E22)
                .setDescription([
                  `Apuesta: ${formatCurrency(amount, config)}`,
                  'Se acabó el tiempo para elegir jugada.',
                ].join('\n')),
            ],
            components: [],
          }).catch(() => null);
        }
      });

      return;
    } else if (game === 'blackjack') {
      const existing = getGameState(message.author.id);
      if (existing && !existing.gameOver) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Partida en curso')
              .setColor(0xED4245)
              .setDescription('Ya tenés una partida de Blackjack activa. Terminála antes de iniciar otra.'),
          ],
        });
      }

      const gameState = createGame(message.author.id);
      setGameState(message.author.id, gameState);

      const playerTotal = calculateHand(gameState.playerCards);
      const embed = new EmbedBuilder()
        .setTitle('🃏 Blackjack')
        .setColor(0x5865F2)
        .setDescription([
          '**Tu mano:**',
          `${gameState.playerCards.join(' ')} — Total: **${playerTotal}**`,
          '',
          '**Mano del dealer:**',
          `${gameState.dealerCards[0]} ? — Total: **?**`,
        ].join('\n'))
        .setFooter({ text: `Apuesta: ${amount.toLocaleString()}` });

      const hitBtn = new ButtonBuilder()
        .setCustomId(`bj_hit_${message.author.id}`)
        .setLabel('Hit (Pedir carta)')
        .setStyle(ButtonStyle.Primary);

      const standBtn = new ButtonBuilder()
        .setCustomId(`bj_stand_${message.author.id}`)
        .setLabel('Stand (Plantarse)')
        .setStyle(ButtonStyle.Success);

      const row = new ActionRowBuilder().addComponents(hitBtn, standBtn);

      const msg = await message.reply({ embeds: [embed], components: [row] });

        const settleBlackjack = async (state, winner, interaction = null) => {
          if (state.settled) return;
          state.settled = true;

          if (winner !== 'player_bust') {
            dealerPlay(state);
            winner = determineWinner(state);
          }

          state.result = winner;
          state.gameOver = true;

          const playerTotal = calculateHand(state.playerCards);
          const dealerTotal = calculateHand(state.dealerCards);

          const resultMsg = {
            player_bust: '❌ ¡BUST! Te pasaste de 21 y perdiste',
            dealer_bust: '✅ ¡El dealer pasó de 21!',
            player_win: '✅ ¡Ganaste! Tu mano fue mejor',
            dealer_win: '❌ El dealer ganó',
            push: '🤝 Empate',
          }[winner];

          const statusColor = winner === 'player_bust' || winner === 'dealer_win'
            ? 0xED4245
            : winner === 'push'
              ? 0x5865F2
              : 0x2ECC71;

          const finalEmbed = new EmbedBuilder()
            .setTitle('🃏 Blackjack - Resultado')
            .setColor(statusColor)
            .setDescription([
              `**${resultMsg}**`,
              '',
              '**Tu mano:**',
              `${state.playerCards.join(' ')} — Total: **${playerTotal}**`,
              '',
              '**Mano del dealer:**',
              `${state.dealerCards.join(' ')} — Total: **${dealerTotal}**`,
            ].join('\n'))
            .setFooter({ text: `Apuesta: ${amount.toLocaleString()}` });

          if (interaction) {
            await interaction.update({ embeds: [finalEmbed], components: [] }).catch(() => null);
          } else {
            await msg.edit({ embeds: [finalEmbed], components: [] }).catch(() => null);
          }

          if (winner === 'player_win' || winner === 'dealer_bust') {
            won = true;
            winReward = Math.floor(amount * 1.5);
          } else if (winner === 'push') {
            won = null;
            winReward = 0;
            lossPenalty = 0;
          } else {
            won = false;
            lossPenalty = amount;
          }

          const beforeWallet = getUserBalance(message.guild.id, message.author.id).wallet;
          let movedAmount = 0;

          if (won === true) {
            bonusMultiplier = getBonusMultiplier();
            const reward = Math.floor(winReward * bonusMultiplier);
            addToWallet(message.guild.id, message.author.id, reward);
          }
          if (won === false) {
            removeFromWallet(message.guild.id, message.author.id, lossPenalty);
          }

          const afterWallet = getUserBalance(message.guild.id, message.author.id).wallet;
          movedAmount = afterWallet - beforeWallet;

          const status = won === null ? '🤝 Empate' : won ? '✅ Ganaste' : '❌ Perdiste';
          const movement = movedAmount === 0
            ? 'Sin cambios'
            : movedAmount > 0
              ? `+ ${formatCurrency(movedAmount, config)}`
              : `- ${formatCurrency(Math.abs(movedAmount), config)}`;
          const bonusText = won === true && bonusMultiplier > 1
            ? `\nBonus multiplicador: **x${bonusMultiplier}**`
            : '';

          const resultEmbed = new EmbedBuilder()
            .setTitle('🃏 Blackjack - Resultado Final')
            .setColor(won === null ? 0x5865F2 : won ? 0x2ECC71 : 0xED4245)
            .setDescription([status, `Movimiento: ${movement}${bonusText}`].join('\n'))
            .setTimestamp();

          await message.channel.send({ embeds: [resultEmbed] });
          deleteGameState(message.author.id);
        };

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 60000,
      });

      collector.on('collect', async (interaction) => {
        const state = getGameState(message.author.id);
        if (!state) return;

        if (interaction.customId === `bj_hit_${message.author.id}`) {
          state.playerCards.push(state.deck.pop());
          const newTotal = calculateHand(state.playerCards);

          if (newTotal > 21) {
            state.gameOver = true;
            state.result = 'player_bust';
            collector.stop('bust');
          }

          setGameState(message.author.id, state);

          const updateEmbed = new EmbedBuilder()
            .setTitle('🃏 Blackjack')
            .setColor(newTotal > 21 ? 0xED4245 : 0x5865F2)
            .setDescription([
              '**Tu mano:**',
              `${state.playerCards.join(' ')} — Total: **${newTotal}**${newTotal > 21 ? ' ❌ BUST!' : ''}`,
              '',
              '**Mano del dealer:**',
              `${state.dealerCards[0]} ? — Total: **?**`,
            ].join('\n'))
            .setFooter({ text: `Apuesta: ${amount.toLocaleString()}` });

          await interaction.update({ embeds: [updateEmbed] });

          if (newTotal > 21) {
            await settleBlackjack(state, 'player_bust');
            return;
          }
        } else if (interaction.customId === `bj_stand_${message.author.id}`) {
          collector.stop('stand');
          await settleBlackjack(state, null, interaction);
          return;
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time' && !getGameState(message.author.id)?.gameOver) {
          msg.edit({ components: [] }).catch(() => {});
          deleteGameState(message.author.id);
        }
      });

      return;
    } else {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Juego inválido').setColor(0xED4245).setDescription('Usa `-bet list` para ver juegos.')],
      });
    }

    if (game !== 'rps') {
      won = applyHouseEdge(won);
    }
    const beforeWallet = getUserBalance(message.guild.id, message.author.id).wallet;
    let movedAmount = 0;

    if (won === true) {
      bonusMultiplier = getBonusMultiplier();
      const reward = Math.floor(winReward * bonusMultiplier);
      addToWallet(message.guild.id, message.author.id, reward);
    }
    if (won === false) {
      removeFromWallet(message.guild.id, message.author.id, lossPenalty);
    }

    const afterWallet = getUserBalance(message.guild.id, message.author.id).wallet;
    movedAmount = afterWallet - beforeWallet;

    const status = won === null ? '🤝 Empate' : won ? '✅ Ganaste' : '❌ Perdiste';
    const movement = movedAmount === 0
      ? 'Sin cambios reales'
      : movedAmount > 0
        ? `+ ${formatCurrency(movedAmount, config)}`
        : `- ${formatCurrency(Math.abs(movedAmount), config)}`;
    const bonusText = won === true && bonusMultiplier > 1
      ? `\nBonus multiplicador: **x${bonusMultiplier}**`
      : '';

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(won === null ? 0x5865F2 : won ? 0x2ECC71 : 0xED4245)
      .setDescription([status, details, '', `Movimiento: ${movement}${bonusText}`].join('\n'))
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

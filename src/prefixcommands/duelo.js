const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getUserBalance, addToWallet, removeFromWallet, randomInt } = require('../utils/economyStore');
const { formatCurrency, parseAmountInput } = require('../utils/economyHelpers');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const pendingInvites = new Map();
const activeDuels = new Map();

const ACCEPT_TIMEOUT_MS = 30_000;
const ROUND_TIME_MS = 8_500;
const ROUNDS_TO_WIN = 4;

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCode(input) {
  return String(input || '').toUpperCase().replace(/\s+/g, '');
}

function normalizeMath(input) {
  return String(input || '').replace(/\s+/g, '');
}

function normalizeSequence(input) {
  const value = String(input || '').replace(/[\u200d\ufe0e\ufe0f]/g, '');

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
    return [...segmenter.segment(value)]
      .map(part => part.segment)
      .filter(part => !/^\s+$/.test(part))
      .join('');
  }

  return Array.from(value).filter(part => !/^\s+$/.test(part)).join('');
}

function reverseText(text) {
  return String(text || '').split('').reverse().join('');
}

function lockKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function isBusy(guildId, userId) {
  return pendingInvites.has(lockKey(guildId, userId)) || activeDuels.has(lockKey(guildId, userId));
}

function setBusyPair(guildId, userA, userB, mapRef, value = true) {
  mapRef.set(lockKey(guildId, userA), value);
  mapRef.set(lockKey(guildId, userB), value);
}

function clearBusyPair(guildId, userA, userB, mapRef) {
  mapRef.delete(lockKey(guildId, userA));
  mapRef.delete(lockKey(guildId, userB));
}

function generateCodeChallenge() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 7; i++) {
    code += chars[randomInt(0, chars.length - 1)];
  }
  const expected = reverseText(code);
  return {
    title: '🧩 Código Críptico',
    text: `Escribí este código **al revés**:\n\`${code}\``,
    answer: normalizeCode(expected),
    normalize: input => normalizeCode(input),
  };
}

function generateMathChallenge() {
  const friendlyA = [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75];
  const friendlyB = [5, 10, 15, 20, 25, 30, 35, 40];
  const friendlyC = [2, 3, 4, 5, 6, 8, 10];
  const friendlyD = [5, 10, 15, 20, 25];

  const a = friendlyA[randomInt(0, friendlyA.length - 1)];
  const b = friendlyB[randomInt(0, friendlyB.length - 1)];
  const c = friendlyC[randomInt(0, friendlyC.length - 1)];
  const d = friendlyD[randomInt(0, friendlyD.length - 1)];
  const answer = ((a + b) * c) - d;

  return {
    title: '🧠 Cálculo Express',
    text: `Resuelve en segundos:\n**((${a} + ${b}) × ${c}) - ${d}**`,
    answer: normalizeMath(String(answer)),
    normalize: input => normalizeMath(input),
  };
}

function normalizeTrivia(input) {
  return normalizeText(input)
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function generateTriviaChallenge() {
  const questions = [
    {
      question: '¿Cuál es la capital de Uruguay?',
      answers: ['montevideo'],
    },
    {
      question: '¿Cuántos días tiene una semana?',
      answers: ['7', 'siete'],
    },
    {
      question: '¿Cuál es el planeta rojo?',
      answers: ['marte'],
    },
    {
      question: '¿Cuánto es 9 x 9?',
      answers: ['81', 'ochenta y uno', 'ochentayuno'],
    },
    {
      question: '¿Qué estación sigue después del invierno?',
      answers: ['primavera'],
    },
    {
      question: '¿Cuál es el océano más grande del mundo?',
      answers: ['pacifico', 'oceano pacifico'],
    },
  ];

  const selected = questions[randomInt(0, questions.length - 1)];
  const validAnswers = selected.answers.map(normalizeTrivia);

  return {
    title: '❓ Preguntados Relámpago',
    text: `${selected.question}\nResponde exacto en una sola línea.`,
    answer: validAnswers,
    normalize: input => normalizeTrivia(input),
    isMultiAnswer: true,
  };
}

function generateReverseChallenge() {
  const words = ['interferencia', 'dominacion', 'electroshock', 'apocalipsis', 'paranoico', 'ultravioleta'];
  const picked = words[randomInt(0, words.length - 1)];
  const answer = normalizeText(picked.split('').reverse().join(''));

  return {
    title: '🔁 Inversión Mental',
    text: `Escribe esta palabra al revés:\n**${picked}**`,
    answer,
    normalize: input => normalizeText(input),
  };
}

function generateSequenceChallenge() {
  const tokens = ['A7', 'K9', 'Q2', 'M4', 'Z8', 'R5', 'T3', 'P6', 'X1'];
  const parts = [];

  for (let i = 0; i < 5; i++) {
    parts.push(tokens[randomInt(0, tokens.length - 1)]);
  }

  const sequence = parts.join('-');
  const expected = parts.slice().reverse().join('-');
  return {
    title: '🎯 Memoria Táctica',
    text: `Escribí la secuencia **al revés**:\n\`${sequence}\``,
    answer: normalizeSequence(expected),
    normalize: input => normalizeSequence(input),
  };
}

function pickChallenge() {
  const pool = [generateCodeChallenge, generateMathChallenge, generateReverseChallenge, generateSequenceChallenge, generateTriviaChallenge];
  return pool[randomInt(0, pool.length - 1)]();
}

function scoreBlock(playerA, playerB, scoreA, scoreB) {
  return [
    `⚔️ <@${playerA}>: **${scoreA}**`,
    `⚔️ <@${playerB}>: **${scoreB}**`,
  ].join('\n');
}

async function waitForAcceptance(message, challengerId, opponentId) {
  const invite = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🏟️ Desafío de Duelo')
        .setColor(0x5865F2)
        .setDescription([
          `<@${opponentId}>, <@${challengerId}> te desafía a un duelo épico.`,
          `Responde **acepto** en ${Math.floor(ACCEPT_TIMEOUT_MS / 1000)}s para iniciar.`,
        ].join('\n')),
    ],
  });

  const accepted = await message.channel.awaitMessages({
    filter: msg => msg.author.id === opponentId && msg.content.toLowerCase().trim() === 'acepto',
    max: 1,
    time: ACCEPT_TIMEOUT_MS,
    errors: ['time'],
  }).catch(() => null);

  await invite.delete().catch(() => null);
  return Boolean(accepted?.first());
}

module.exports = {
  name: 'duelo',
  aliases: ['duel'],
  help: {
    purpose: 'Duelo PvP de alta dificultad. El ganador se lleva todo el pozo.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const challengerId = message.author.id;
    const opponent = await resolveUserTarget(message, args[0]);

    if (!opponent || opponent.user.bot || opponent.id === challengerId) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-duelo @usuario|userId <monto|all|half>`')],
      });
    }

    if (isBusy(guildId, challengerId) || isBusy(guildId, opponent.id)) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('⛔ Duelo no disponible').setColor(0xE67E22).setDescription('Uno de los dos ya tiene un duelo activo o pendiente.')],
      });
    }

    const config = await getGuildConfig(guildId);
    const challengerBalance = await getUserBalance(guildId, challengerId);
    const amount = parseAmountInput(args.slice(1).join(' '), challengerBalance.wallet);

    if (!amount || amount <= 0) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Apuesta inválida').setColor(0xED4245).setDescription('Ejemplo: `-duelo @usuario 5000` o `-duelo @usuario all`')],
      });
    }

    if (challengerBalance.wallet < amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Fondos insuficientes').setColor(0xED4245).setDescription('No tienes saldo en mano para esa apuesta.')],
      });
    }

    const opponentBalance = await getUserBalance(guildId, opponent.id);
    if (opponentBalance.wallet < amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Rival sin fondos').setColor(0xED4245).setDescription('El rival no tiene suficiente saldo en mano para igualar la apuesta.')],
      });
    }

    setBusyPair(guildId, challengerId, opponent.id, pendingInvites, true);

    const accepted = await waitForAcceptance(message, challengerId, opponent.id);
    clearBusyPair(guildId, challengerId, opponent.id, pendingInvites);

    if (!accepted) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('⌛ Duelo cancelado').setColor(0xE67E22).setDescription('No hubo aceptación a tiempo.')],
      });
    }

    const challengerNow = await getUserBalance(guildId, challengerId);
    const opponentNow = await getUserBalance(guildId, opponent.id);
    if (challengerNow.wallet < amount || opponentNow.wallet < amount) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('⚠️ Duelo abortado').setColor(0xE67E22).setDescription('Uno de los dos ya no tiene fondos para iniciar el duelo.')],
      });
    }

    await removeFromWallet(guildId, challengerId, amount);
    await removeFromWallet(guildId, opponent.id, amount);

    setBusyPair(guildId, challengerId, opponent.id, activeDuels, true);

    let challengerScore = 0;
    let opponentScore = 0;
    let round = 0;

    try {
      while (challengerScore < ROUNDS_TO_WIN && opponentScore < ROUNDS_TO_WIN) {
        round += 1;
        const challenge = pickChallenge();

        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle(`🔥 Duelo • Ronda ${round}`)
              .setColor(0x9B59B6)
              .setDescription([
                scoreBlock(challengerId, opponent.id, challengerScore, opponentScore),
                '',
                `**${challenge.title}**`,
                challenge.text,
                '',
                `Tiempo: **${Math.floor(ROUND_TIME_MS / 1000)}s**`,
              ].join('\n')),
          ],
        });

        const answers = await message.channel.awaitMessages({
          filter: msg => msg.author.id === challengerId || msg.author.id === opponent.id,
          max: 20,
          time: ROUND_TIME_MS,
        }).catch(() => null);

        const ordered = (answers?.toJSON?.() || []).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
        const winnerMsg = ordered.find(msg => {
          const normalized = challenge.normalize(msg.content);
          if (challenge.isMultiAnswer) {
            return challenge.answer.includes(normalized);
          }
          return normalized === challenge.answer;
        });

        if (!winnerMsg) {
          await message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setTitle('🫨 Ronda sin punto')
                .setColor(0xE67E22)
                .setDescription(`Nadie resolvió a tiempo.\n\n${scoreBlock(challengerId, opponent.id, challengerScore, opponentScore)}`),
            ],
          });
          continue;
        }

        if (winnerMsg.author.id === challengerId) {
          challengerScore += 1;
        } else {
          opponentScore += 1;
        }

        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('⚡ Punto confirmado')
              .setColor(0x2ECC71)
              .setDescription([
                `Ganó la ronda: <@${winnerMsg.author.id}>`,
                '',
                scoreBlock(challengerId, opponent.id, challengerScore, opponentScore),
              ].join('\n')),
          ],
        });
      }

      let winnerId = null;
      if (challengerScore > opponentScore) winnerId = challengerId;
      if (opponentScore > challengerScore) winnerId = opponent.id;

      const pot = amount * 2;

      if (!winnerId) {
        await addToWallet(guildId, challengerId, amount);
        await addToWallet(guildId, opponent.id, amount);

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('🤝 Duelo empatado')
              .setColor(0xF1C40F)
              .setDescription([
                'El duelo terminó en empate. Se devuelve la apuesta a ambos.',
                '',
                scoreBlock(challengerId, opponent.id, challengerScore, opponentScore),
              ].join('\n')),
          ],
        });
      }

      await addToWallet(guildId, winnerId, pot);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏆 Duelo Épico Finalizado')
            .setColor(0x2ECC71)
            .setDescription([
              `Ganador: <@${winnerId}>`,
              `Premio del pozo: ${formatCurrency(pot, config)}`,
              `Apuesta individual: ${formatCurrency(amount, config)}`,
              '',
              scoreBlock(challengerId, opponent.id, challengerScore, opponentScore),
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    } finally {
      clearBusyPair(guildId, challengerId, opponent.id, activeDuels);
    }
  },
};
const { EmbedBuilder } = require('discord.js');
const { randomInt } = require('./economyStore');

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
  return splitSequenceTokens(input).join('');
}

function splitSequenceTokens(input) {
  const value = String(input || '').replace(/[\u200d\ufe0e\ufe0f]/g, '');

  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
    return [...segmenter.segment(value)]
      .map(part => part.segment)
      .filter(part => !/^\s+$/.test(part));
  }

  return Array.from(value).filter(part => !/^\s+$/.test(part));
}

function generateCodeChallenge(length = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[randomInt(0, chars.length - 1)];
  }
  return code;
}

function reverseText(text) {
  const value = String(text || '');
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    const segmenter = new Intl.Segmenter('es', { granularity: 'grapheme' });
    return [...segmenter.segment(value)].map(part => part.segment).reverse().join('');
  }

  return Array.from(value).reverse().join('');
}

function generateMathChallenge(hard = false) {
  if (!hard) {
    const a = randomInt(7, 54);
    const b = randomInt(3, 31);
    const ops = ['+', '-', '*'];
    const op = ops[randomInt(0, ops.length - 1)];

    if (op === '+') {
      return { label: `${a} + ${b}`, answer: String(a + b) };
    }

    if (op === '-') {
      const high = Math.max(a, b);
      const low = Math.min(a, b);
      return { label: `${high} - ${low}`, answer: String(high - low) };
    }

    const m1 = randomInt(2, 12);
    const m2 = randomInt(2, 12);
    return { label: `${m1} × ${m2}`, answer: String(m1 * m2) };
  }

  const a = randomInt(10, 35);
  const b = randomInt(6, 22);
  const c = randomInt(2, 5);
  const result = (a + b) * c;

  return {
    label: `(${a} + ${b}) × ${c}`,
    answer: String(result),
  };
}

function generateSequenceChallenge() {
  const pool = ['🍀', '💎', '⚡', '🧲', '🗝️', '🧪', '🎲', '🪤', '🕳️', '🎯'];
  const length = randomInt(5, 6);
  const sequence = [];

  for (let i = 0; i < length; i++) {
    sequence.push(pool[randomInt(0, pool.length - 1)]);
  }

  return {
    label: sequence.join(' '),
    answer: sequence.join(' '),
  };
}

function generateTriviaChallenge() {
  const questions = [
    {
      difficulty: 'Fácil',
      question: '¿Cuál es el planeta conocido como el planeta rojo?',
      answers: ['marte'],
    },
    {
      difficulty: 'Fácil',
      question: '¿Cuántos días tiene una semana?',
      answers: ['7', 'siete'],
    },
    {
      difficulty: 'Fácil',
      question: '¿Cuál es el resultado de 9 + 6?',
      answers: ['15', 'quince'],
    },
    {
      difficulty: 'Media',
      question: '¿Cuál es el océano más grande del mundo?',
      answers: ['pacifico', 'oceano pacifico'],
    },
    {
      difficulty: 'Media',
      question: '¿En qué continente está Egipto?',
      answers: ['africa'],
    },
    {
      difficulty: 'Media',
      question: '¿Qué gas respiramos que es esencial para vivir?',
      answers: ['oxigeno', 'oxígeno'],
    },
  ];

  return questions[randomInt(0, questions.length - 1)];
}

function generateReverseWordChallenge() {
  const words = [
    'pirata',
    'tesoro',
    'sombrero',
    'cuchillo',
    'escondite',
    'carterista',
    'contraseña',
    'sigilo',
    'pantera',
    'ladron',
  ];

  const word = words[randomInt(0, words.length - 1)];
  return {
    word,
    reversed: reverseText(word),
  };
}

function buildChallengeList(victimId, hard = false) {
  if (!hard) {
    return [
      () => {
        const code = generateCodeChallenge(5);
        const expected = code;
        return {
          title: '🕵️ Robo • Código',
          instruction: [
            `Objetivo: robarle a <@${victimId}>`,
            '',
            'Escribe este código en **10 segundos**:',
            `\`${code}\``,
          ].join('\n'),
          timeMs: 10_000,
          validate: input => normalizeCode(input) === normalizeCode(expected),
        };
      },
      () => {
        const challenge = generateMathChallenge(false);
        return {
          title: '🕵️ Robo • Cálculo',
          instruction: [
            `Objetivo: robarle a <@${victimId}>`,
            '',
            'Resuelve en **10 segundos**:',
            `**${challenge.label}**`,
          ].join('\n'),
          timeMs: 10_000,
          validate: input => normalizeMath(input) === normalizeMath(challenge.answer),
        };
      },
      () => {
        const challenge = generateTriviaChallenge();
        const validAnswers = challenge.answers.map(answer => normalizeText(answer));
        return {
          title: '🕵️ Robo • Preguntados',
          instruction: [
            `Objetivo: robarle a <@${victimId}>`,
            '',
            `Pregunta (${challenge.difficulty}) • Respondé en **12 segundos**:`,
            `**${challenge.question}**`,
          ].join('\n'),
          timeMs: 12_000,
          validate: input => validAnswers.includes(normalizeText(input)),
        };
      },
    ];
  }

  return [
    () => {
      const challenge = generateReverseWordChallenge();
      return {
        title: '🕵️ Forcerob • Palabra al revés',
        instruction: [
          `Objetivo: forzar a <@${victimId}>`,
          '',
          'Escribí esta palabra **al revés** en **10 segundos**:',
          `\`${challenge.word}\``,
        ].join('\n'),
        timeMs: 10_000,
        validate: input => normalizeText(input) === normalizeText(challenge.reversed),
      };
    },
    () => {
      const challenge = generateMathChallenge(true);
      return {
        title: '🕵️ Forcerob • Cálculo reforzado',
        instruction: [
          `Objetivo: forzar a <@${victimId}>`,
          '',
          'Resuelve en **10 segundos**:',
          `**${challenge.label}**`,
        ].join('\n'),
        timeMs: 10_000,
        validate: input => normalizeMath(input) === normalizeMath(challenge.answer),
      };
    },
    () => {
      const challenge = generateTriviaChallenge();
      const validAnswers = challenge.answers.map(answer => normalizeText(answer));
      return {
        title: '🕵️ Forcerob • Pregunta extra',
        instruction: [
          `Objetivo: forzar a <@${victimId}>`,
          '',
          `Respondé en **15 segundos** (${challenge.difficulty}):`,
          `**${challenge.question}**`,
        ].join('\n'),
        timeMs: 15_000,
        validate: input => validAnswers.includes(normalizeText(input)),
      };
    },
  ];
}

async function runRobberyChallenge(message, victimId, options = {}) {
  const hard = Boolean(options.hard);
  const challenges = buildChallengeList(victimId, hard);
  const selected = challenges[randomInt(0, challenges.length - 1)]();

  const prompt = await message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle(selected.title)
        .setColor(hard ? 0xED4245 : 0x5865F2)
        .setDescription(selected.instruction),
    ],
  });

  const collected = await message.channel.awaitMessages({
    filter: m => m.author.id === message.author.id,
    max: 1,
    time: selected.timeMs,
    errors: ['time'],
  }).catch(() => null);

  const input = collected?.first()?.content?.trim() || '';
  await prompt.delete().catch(() => null);

  return selected.validate(input);
}

module.exports = {
  runRobberyChallenge,
};
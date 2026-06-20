const {
  parseDuration,
  formatDuration,
} = require('../utils/timeParser');

const numberEmojis = [
  '1️⃣',
  '2️⃣',
  '3️⃣',
  '4️⃣',
  '5️⃣',
  '6️⃣',
  '7️⃣',
  '8️⃣',
  '9️⃣',
  '🔟',
];

const COMPONENTS_V2_FLAG = 32768;

const activePolls = new Map();

function parsePollInput(text) {
  const trimmed = text.trim();

  const match = trimmed.match(
    /^((?:\d+\s*[smhd])(?:\s+\d+\s*[smhd])*)?\s*"([^"]+)"\s+(.+)$/i
  );

  if (!match) return null;

  const durationText = match[1]?.trim();

  const question = match[2]?.trim();

  const optionsText = match[3]?.trim();

  const rawOptions = optionsText
    .split(/\s+/)
    .filter(Boolean);

  // máximo 10
  if (rawOptions.length > 10) {
    return {
      error:
        '❌ Máximo 10 opciones permitidas.',
    };
  }

  // mínimo 2
  if (rawOptions.length < 2) {
    return {
      error:
        '❌ Debes poner mínimo 2 opciones.',
    };
  }

  // evitar duplicados
  const lowered = rawOptions.map(x =>
    x.toLowerCase()
  );

  const duplicates = lowered.filter(
    (item, index) =>
      lowered.indexOf(item) !== index
  );

  if (duplicates.length > 0) {
    return {
      error:
        '❌ No puedes repetir opciones.',
    };
  }

  return {
    durationMs: durationText
      ? parseDuration(durationText)
      : 0,

    question,

    options: rawOptions,
  };
}

function getRemainingText(endTime) {
  if (!endTime) {
    return 'Sin límite';
  }

  const remainingMs = Math.max(
    0,
    endTime - Date.now()
  );

  // SOLO countdown
  return formatDuration(remainingMs);
}

function createPollComponents({
  question,
  options,
  endTime,
}) {
  const optionLines = options
    .map(
      (option, i) =>
        `${numberEmojis[i]} ${option}`
    )
    .join('\n');

  return [
    {
      type: 17,

      // sin color
      accent_color: null,

      spoiler: false,

      components: [
        {
          type: 10,

          content:
            `# 📊 Encuesta\n\n` +
            `## ${question}\n\n` +
            `${optionLines}\n\n` +
            `⏳ ${getRemainingText(endTime)}`,
        },
      ],
    },
  ];
}

function createClosedComponents({
  question,
  results,
  totalVotes,
  winnerText,
}) {
  const resultText = results
    .map(
      r =>
        `${r.emoji} ${r.option} — **${r.votes}**`
    )
    .join('\n');

  return [
    {
      type: 17,

      // sin color
      accent_color: null,

      spoiler: false,

      components: [
        {
          type: 10,

          content:
            `# 📊 Encuesta cerrada\n\n` +
            `## ${question}\n\n` +
            `${resultText}\n\n` +
            `### 🏆 Ganador\n${winnerText}\n\n` +
            `### 📈 Votos\n${totalVotes}`,
        },
      ],
    },
  ];
}

async function closePoll(messageId) {
  const active = activePolls.get(messageId);

  if (!active) return;

  clearInterval(active.intervalId);

  clearTimeout(active.timeoutId);

  const {
    pollMessage,
    question,
    options,
  } = active;

  await pollMessage.fetch();

  const results = options.map(
    (option, i) => {
      const reaction =
        pollMessage.reactions.cache.get(
          numberEmojis[i]
        );

      return {
        emoji: numberEmojis[i],
        option,
        votes: reaction
          ? reaction.count - 1
          : 0,
      };
    }
  );

  const totalVotes = results.reduce(
    (a, b) => a + b.votes,
    0
  );

  const sorted = [...results].sort(
    (a, b) => b.votes - a.votes
  );

  const topVotes =
    sorted[0]?.votes || 0;

  const winners = sorted.filter(
    x =>
      x.votes === topVotes &&
      topVotes > 0
  );

  const winnerText =
    winners.length === 0
      ? 'Sin votos'
      : winners.length === 1
      ? `${winners[0].emoji} ${winners[0].option}`
      : winners
          .map(
            w =>
              `${w.emoji} ${w.option}`
          )
          .join(' • ');

  await pollMessage.edit({
    flags: COMPONENTS_V2_FLAG,

    components: createClosedComponents({
      question,
      results,
      totalVotes,
      winnerText,
    }),
  });

  activePolls.delete(messageId);
}

module.exports = {
  name: 'poll',

  help: {
    purpose:
      'Encuestas usando Components V2 + reacciones.',

    category: '📊 Información',
  },

  async execute(message) {
    const raw = message.content
      .replace(/^-poll\s*/i, '')
      .trim();

const parsed = parsePollInput(raw);

if (!parsed) {
  return message.reply(
    '❌ Uso:\n`-poll 30m "pregunta" si no`'
  );
}

if (parsed.error) {
  return message.reply(parsed.error);
}

    const {
      durationMs,
      question,
      options,
    } = parsed;

    if (
      !question ||
      options.length < 2
    ) {
      return message.reply(
        '❌ Debes poner mínimo 2 opciones.'
      );
    }

    const endTime =
      durationMs > 0
        ? Date.now() + durationMs
        : null;

    const pollMessage =
      await message.channel.send({
        flags: COMPONENTS_V2_FLAG,

        components:
          createPollComponents({
            question,
            options,
            endTime,
          }),
      });

    // reacciones
    for (
      let i = 0;
      i < options.length;
      i++
    ) {
      await pollMessage.react(
        numberEmojis[i]
      );
    }

    // actualizar tiempo
    if (durationMs > 0) {
      const intervalId =
        setInterval(async () => {
          const active =
            activePolls.get(
              pollMessage.id
            );

          if (!active) {
            clearInterval(
              intervalId
            );

            return;
          }

          if (
            Date.now() >=
            active.endTime
          ) {
            clearInterval(
              intervalId
            );

            return;
          }

          await pollMessage.edit({
            flags:
              COMPONENTS_V2_FLAG,

            components:
              createPollComponents({
                question:
                  active.question,

                options:
                  active.options,

                endTime:
                  active.endTime,
              }),
          }).catch(() => null);
        }, 1000);

      const timeoutId =
        setTimeout(async () => {
          await closePoll(
            pollMessage.id
          );
        }, durationMs);

      activePolls.set(
        pollMessage.id,
        {
          pollMessage,
          question,
          options,
          endTime,
          intervalId,
          timeoutId,
        }
      );
    }

    if (message.deletable) {
      await message.delete().catch(() => {});
    }
  },
};
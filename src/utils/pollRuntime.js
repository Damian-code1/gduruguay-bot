'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { formatDuration } = require('./timeParser');

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
const COMPONENTS_V2_FLAG = 32768;

// pollId -> { question, options, votes: Map(userId -> optionIndex), endTime, intervalId, timeoutId, message }
const activePolls = new Map();
let pollCounter = 0;

function buildBar(count, total, length = 12) {
  const filled = total ? Math.round((count / total) * length) : 0;
  return '█'.repeat(filled) + '░'.repeat(length - filled);
}

function getRemainingText(endTime) {
  if (!endTime) return 'Sin límite';
  const remainingMs = Math.max(0, endTime - Date.now());
  return formatDuration(remainingMs);
}

function buildPollComponents(poll) {
  const counts = poll.options.map((_, i) => [...poll.votes.values()].filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const optionLines = poll.options
    .map((opt, i) => {
      const count = counts[i];
      const pct = total ? Math.round((count / total) * 100) : 0;
      return `${NUMBER_EMOJIS[i]} ${opt}\n\`${buildBar(count, total)}\` **${count}** (${pct}%)`;
    })
    .join('\n\n');

  return [
    {
      type: 17,
      accent_color: null,
      spoiler: false,
      components: [
        {
          type: 10,
          content:
            `# 📊 Encuesta\n\n` +
            `## ${poll.question}\n\n` +
            `${optionLines}\n\n` +
            `⏳ ${getRemainingText(poll.endTime)}`,
        },
      ],
    },
  ];
}

function buildClosedComponents(poll) {
  const counts = poll.options.map((_, i) => [...poll.votes.values()].filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const results = poll.options.map((opt, i) => ({ emoji: NUMBER_EMOJIS[i], option: opt, votes: counts[i] }));
  const resultText = results.map((r) => `${r.emoji} ${r.option} — **${r.votes}**`).join('\n');

  const sorted = [...results].sort((a, b) => b.votes - a.votes);
  const topVotes = sorted[0]?.votes || 0;
  const winners = sorted.filter((x) => x.votes === topVotes && topVotes > 0);
  const winnerText =
    winners.length === 0
      ? 'Sin votos'
      : winners.length === 1
        ? `${winners[0].emoji} ${winners[0].option}`
        : winners.map((w) => `${w.emoji} ${w.option}`).join(' • ');

  return [
    {
      type: 17,
      accent_color: null,
      spoiler: false,
      components: [
        {
          type: 10,
          content:
            `# 📊 Encuesta cerrada\n\n` +
            `## ${poll.question}\n\n` +
            `${resultText}\n\n` +
            `### 🏆 Ganador\n${winnerText}\n\n` +
            `### 📈 Votos totales\n${total}`,
        },
      ],
    },
  ];
}

function buildPollButtons(pollId, options, disabled = false) {
  const rows = [];
  let row = new ActionRowBuilder();
  options.forEach((opt, i) => {
    if (i > 0 && i % 5 === 0) {
      rows.push(row);
      row = new ActionRowBuilder();
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`poll:vote:${pollId}:${i}`)
        .setLabel(`${i + 1}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    );
  });
  rows.push(row);
  return rows;
}

async function closePoll(pollId) {
  const poll = activePolls.get(pollId);
  if (!poll) return;

  clearInterval(poll.intervalId);
  clearTimeout(poll.timeoutId);

  const components = buildClosedComponents(poll);
  await poll.message.edit({ flags: COMPONENTS_V2_FLAG, components }).catch(() => null);

  activePolls.delete(pollId);
}

async function createPoll(channel, question, options, durationMs) {
  pollCounter += 1;
  const pollId = pollCounter;
  const endTime = durationMs > 0 ? Date.now() + durationMs : null;

  const poll = { question, options, votes: new Map(), endTime };

  const message = await channel.send({
    flags: COMPONENTS_V2_FLAG,
    components: buildPollComponents(poll),
  });

  const buttonRows = buildPollButtons(pollId, options);
  await message.edit({ components: [...buildPollComponents(poll), ...buttonRows] }).catch(() => null);

  poll.message = message;
  activePolls.set(pollId, poll);

  if (durationMs > 0) {
    poll.intervalId = setInterval(async () => {
      const active = activePolls.get(pollId);
      if (!active) { clearInterval(poll.intervalId); return; }
      if (Date.now() >= active.endTime) { clearInterval(poll.intervalId); return; }
      const rows = buildPollButtons(pollId, options);
      await active.message
        .edit({ flags: COMPONENTS_V2_FLAG, components: [...buildPollComponents(active), ...rows] })
        .catch(() => null);
    }, 5000);

    poll.timeoutId = setTimeout(() => closePoll(pollId), durationMs);
  }

  return pollId;
}

function getPoll(pollId) {
  return activePolls.get(pollId) || null;
}

async function handlePollVote(interaction) {
  const [, , pollIdStr, optionIdxStr] = interaction.customId.split(':');
  const pollId = Number(pollIdStr);
  const optionIdx = Number(optionIdxStr);

  const poll = getPoll(pollId);
  if (!poll) {
    return interaction.reply({ content: '⚠️ Esta encuesta ya cerró.', flags: MessageFlags.Ephemeral });
  }

  poll.votes.set(interaction.user.id, optionIdx);

  const rows = buildPollButtons(pollId, poll.options);
  await interaction.message.edit({ flags: COMPONENTS_V2_FLAG, components: [...buildPollComponents(poll), ...rows] }).catch(() => null);

  return interaction.reply({
    content: `✅ Votaste: **${poll.options[optionIdx]}**`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { createPoll, getPoll, closePoll, handlePollVote };
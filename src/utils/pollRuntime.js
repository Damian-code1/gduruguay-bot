'use strict';

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const config = require('../config');

// Cache en memoria de votos: pollId -> Map(userId -> optionIndex)
const pollVotes = new Map();
let pollCounter = 0;

const NUMBER_EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

function buildPollEmbed(question, options, votesMap) {
  const counts = options.map((_, i) => [...votesMap.values()].filter((v) => v === i).length);
  const total = counts.reduce((a, b) => a + b, 0);

  const lines = options.map((opt, i) => {
    const count = counts[i];
    const pct = total ? Math.round((count / total) * 100) : 0;
    const barLength = 12;
    const filled = total ? Math.round((count / total) * barLength) : 0;
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
    return `${NUMBER_EMOJIS[i]} ${opt}\n\`${bar}\` **${count}** (${pct}%)`;
  });

  return new EmbedBuilder()
    .setTitle(`📊 ${question}`)
    .setDescription(lines.join('\n\n'))
    .setColor(config.colors.primary)
    .setFooter({ text: `${total} voto${total === 1 ? '' : 's'} · Encuesta de staff` });
}

function buildPollButtons(pollId, options) {
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
        .setStyle(ButtonStyle.Secondary),
    );
  });
  rows.push(row);
  return rows;
}

function createPoll(question, options) {
  pollCounter += 1;
  const pollId = pollCounter;
  pollVotes.set(pollId, { question, options, votes: new Map() });
  return pollId;
}

function getPoll(pollId) {
  return pollVotes.get(pollId) || null;
}

async function handlePollVote(interaction) {
  const [, , pollIdStr, optionIdxStr] = interaction.customId.split(':');
  const pollId = Number(pollIdStr);
  const optionIdx = Number(optionIdxStr);

  const poll = getPoll(pollId);
  if (!poll) {
    return interaction.reply({ content: '⚠️ Esta encuesta ya no está disponible.', flags: MessageFlags.Ephemeral });
  }

  poll.votes.set(interaction.user.id, optionIdx);

  const embed = buildPollEmbed(poll.question, poll.options, poll.votes);
  await interaction.message.edit({ embeds: [embed] }).catch(() => null);

  return interaction.reply({
    content: `✅ Votaste: **${poll.options[optionIdx]}**`,
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = { createPoll, getPoll, buildPollEmbed, buildPollButtons, handlePollVote };
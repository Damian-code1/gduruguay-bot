const { EmbedBuilder } = require('discord.js');
const { getSeasonState, openEconomySeason } = require('../utils/economySeasonStore');

const OWNER_ID = '1407737422732853331';

module.exports = {
  name: 'openseason',
  help: {
    purpose: 'Reabre los comandos de economía y comienza la siguiente season.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message) {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Solo el dueño del bot puede usar este comando.');
    }

    if (!message.guild) {
      return message.reply('❌ Este comando solo se puede usar en un servidor.');
    }

    const guildId = message.guild.id;
    const state = await getSeasonState(guildId);

    if (!state.locked) {
      return message.reply('⚠️ La season ya está abierta.');
    }

    const nextState = await openEconomySeason(guildId, {
      by: message.author.id,
      at: Date.now(),
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Season reabierta')
          .setColor(0x2ECC71)
          .setDescription([
            'Los comandos de economía volvieron a estar disponibles.',
            `Season actual: **${nextState.seasonNumber}**`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
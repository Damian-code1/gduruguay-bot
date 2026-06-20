const { EmbedBuilder } = require('discord.js');
const { stopLoop, getState } = require('../utils/anilistRecommender');

module.exports = {
  name: 'anistop',
  aliases: ['anirecstop'],
  help: {
    purpose: 'Detiene las recomendaciones automáticas de AniList (solo staff).',
    category: '🔧 Admin',
    usage: '-anistop',
  },
  async execute(message) {
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    stopLoop();
    const embed = new EmbedBuilder().setColor(0x23272A).setTitle('⛔ Recomendaciones detenidas').setDescription('El bucle de recomendaciones ha sido detenido.');
    return message.reply({ embeds: [embed] });
  },
};

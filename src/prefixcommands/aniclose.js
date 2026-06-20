const { EmbedBuilder } = require('discord.js');
const { stopLoop, getState } = require('../utils/anilistRecommender');

module.exports = {
  name: 'aniclose',
  aliases: ['anistop', 'aniclose', 'aniclose'],
  help: {
    purpose: 'Detiene las recomendaciones automáticas de AniList (solo staff).',
    category: '🔧 Admin',
    usage: '-aniclose',
  },
  async execute(message) {
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    const prev = getState();
    if (!prev || !prev.enabled) {
      return message.reply({ content: 'ℹ️ El sistema de recomendaciones ya está detenido.' });
    }

    stopLoop();
    const embed = new EmbedBuilder().setColor(0x23272A).setTitle('⛔ Recomendaciones detenidas').setDescription('El bucle de recomendaciones ha sido detenido por el staff.');
    return message.reply({ embeds: [embed] });
  },
};

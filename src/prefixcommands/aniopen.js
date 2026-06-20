const { EmbedBuilder } = require('discord.js');
const { startLoop, getState } = require('../utils/anilistRecommender');

module.exports = {
  name: 'aniopen',
  aliases: ['aniopen', 'anistart', 'aniresume'],
  help: {
    purpose: 'Inicia/reanuda las recomendaciones automáticas de AniList (solo staff).',
    category: '🔧 Admin',
    usage: '-aniopen',
  },
  async execute(message, args) {
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    const state = getState() || {};
    if (state.enabled) {
      return message.reply({ content: 'ℹ️ El sistema de recomendaciones ya está activo.' });
    }

    const minutes = Number(state.intervalMinutes) || 60;
    const channelId = state.channelId || undefined;

    startLoop(message.client, minutes, channelId);
    const embed = new EmbedBuilder().setColor(0x23272A).setTitle('✅ Recomendaciones reanudadas').setDescription(`Intervalo: **${minutes}** minutos\nCanal destino: **${channelId || '1502203819293937664 (por defecto)'}**`);
    return message.reply({ embeds: [embed] });
  },
};

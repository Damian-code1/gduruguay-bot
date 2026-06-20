const { PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { getVoiceConnection, leaveAndCleanup } = require('../utils/voiceManager');

module.exports = {
  name: 'leave',
  help: {
    purpose: 'Hace que el bot salga del canal de voz actual.',
    category: '🛡️ Moderación',
  },
  async execute(message) {
    const guildId = message.guild?.id;
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const connection = getVoiceConnection(guildId);
    if (!connection) {
      return message.reply('ℹ️ No estoy conectado a ningún canal de voz.');
    }

    try {
      leaveAndCleanup(guildId);
      return message.reply('👋 Salí del canal de voz y limpié el buffer de audio.');
    } catch (error) {
      console.error('Error en -leave:', error);
      return message.reply('❌ No pude salir del canal de voz.');
    }
  },
};

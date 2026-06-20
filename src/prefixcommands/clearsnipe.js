const { PermissionFlagsBits } = require('discord.js');
const { clearSnipes } = require('../utils/snipeStore');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'clearsnipe',
  help: {
    purpose: 'Limpia los mensajes eliminados guardados por snipe en el canal actual.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const deletedCount = clearSnipes(message.channel.id);

    if (!deletedCount) {
      return message.reply('🧹 No había snipes guardados en este canal.');
    }

    return message.reply(`🧹 Se limpiaron **${deletedCount}** snipe(s) de este canal.`);
  },
};

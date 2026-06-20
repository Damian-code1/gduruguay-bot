const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { removeLock, getLock } = require('../utils/lockStore');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'unlock',
  help: {
    purpose: 'Desbloquea el canal actual al instante.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const lock = getLock(message.channel.id);
    if (!lock) {
      return message.reply('🔓 El canal no está bloqueado.');
    }

    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: null,
    });

    removeLock(message.channel.id);
    return message.reply('🔓 Canal desbloqueado.');
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { clearAllowedChannels, getAllowedChannels } = require('../utils/commandChannelManager');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'opencommands',
  help: {
    purpose: 'Permite usar comandos en cualquier canal (reversa a `-closecommands`).',
    category: '🛡️ Moderación',
    adminOnly: true,
    aliases: ['unclosecommands','enablecommands'],
  },
  async execute(message) {
    const guildId = message.guild?.id;
    if (!guildId) return message.reply('❌ Este comando solo se puede usar en un servidor.');

    const canUse = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
    if (!canUse) return message.reply('❌ No tenés permisos para usar este comando.');

    clearAllowedChannels(guildId);

    const embed = new EmbedBuilder()
      .setTitle('✅ Comandos abiertos')
      .setDescription('Ahora los comandos se pueden usar en cualquier canal.')
      .setColor(0x57F287);

    return message.reply({ embeds: [embed] });
  },
};

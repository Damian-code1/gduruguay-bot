const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { clearWarnings } = require('../utils/warningsStore');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -clearwarns')
    .setDescription('Borra todas las advertencias de un usuario.')
    .addFields(
      { name: 'Uso', value: '`-clearwarns @usuario` o `-clearwarns <userId>`' },
      { name: 'Ejemplo', value: '`-clearwarns @pepito`\n`-clearwarns 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0xFEE75C)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'clearwarns',
  help: {
    purpose: 'Borra todas las advertencias de un usuario.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const rawTarget = args[0];
    if (!rawTarget) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const mentionedMember = message.mentions.members.first();
    const cachedMember = message.guild.members.cache.get(rawTarget);
    const isUserId = /^\d{17,20}$/.test(rawTarget);

    const targetId = mentionedMember?.id || cachedMember?.id || (isUserId ? rawTarget : null);
    if (!targetId) return message.reply({ embeds: [usageEmbed()] });

    const amount = clearWarnings(message.guild.id, targetId);
    if (!amount) {
      return message.reply('📭 Ese usuario no tenía warnings para borrar.');
    }

    return message.reply(`🧹 Se borraron **${amount}** warning(s) de <@${targetId}>.`);
  },
};

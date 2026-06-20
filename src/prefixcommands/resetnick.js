const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -resetnick')
    .setDescription('Quita el apodo personalizado de un usuario.')
    .addFields(
      { name: 'Uso', value: '`-resetnick @usuario` o `-resetnick <userId>`' },
      { name: 'Ejemplo', value: '`-resetnick @pepito`\n`-resetnick 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'resetnick',
  help: {
    purpose: 'Quita el apodo personalizado de un usuario.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const resolved = await resolveMemberTarget(message, args[0]);
    const target = resolved?.member;
    if (!target) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    await target.setNickname(null);
    return message.reply(`✅ Se restableció el apodo de <@${target.id}>.`);
  },
};

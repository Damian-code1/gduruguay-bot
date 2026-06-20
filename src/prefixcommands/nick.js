const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -nick')
    .setDescription('Cambia el apodo de un usuario.')
    .addFields(
      { name: 'Uso', value: '`-nick @usuario <apodo>` o `-nick <userId> <apodo>`' },
      { name: 'Ejemplo', value: '`-nick @pepito El Godín`\n`-nick 123456789012345678 El Godín`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'nick',
  help: {
    purpose: 'Cambia el apodo de un usuario.',
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

    const nickname = args.slice(1).join(' ').trim();
    if (!nickname) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    await target.setNickname(nickname);
    return message.reply(`✅ Apodo actualizado para <@${target.id}>: **${nickname}**`);
  },
};

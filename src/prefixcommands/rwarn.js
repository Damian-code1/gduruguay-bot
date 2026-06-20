const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWarnings, clearSpecificWarning, clearWarnings } = require('../utils/warningsStore');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -rwarn')
    .setDescription('Remueve un warning específico o borra todos los warnings de un usuario.')
    .addFields(
      { name: 'Uso', value: '`-rwarn @usuario <número>` / `-rwarn <userId> <número>`\n`-rwarn @usuario all` / `-rwarn <userId> all`' },
      { name: 'Ejemplo', value: '`-rwarn @pepito 2`\n`-rwarn 123456789012345678 2`\n`-rwarn @pepito all`' },
      { name: 'Nota', value: 'Usa `-warns @usuario` o `-warns <userId>` para ver los números' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'rwarn',
  help: {
    purpose: 'Remueve un warning específico o borra todos los warnings de un usuario.',
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

    const action = String(args[1] || '').toLowerCase();
    if (!action) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    if (action === 'all') {
      const amount = clearWarnings(message.guild.id, targetId);
      if (!amount) {
        return message.reply(`📭 <@${targetId}> no tiene advertencias para remover.`);
      }

      const embed = new EmbedBuilder()
        .setTitle('✅ Warnings removidos')
        .addFields(
          { name: 'Usuario', value: `<@${targetId}>`, inline: true },
          { name: 'Warnings borrados', value: `${amount}`, inline: true }
        )
        .setColor(0x2ECC71)
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    }

    const warningNumber = parseInt(action, 10);
    if (!warningNumber || isNaN(warningNumber) || warningNumber < 1) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const warnings = getWarnings(message.guild.id, targetId);
    if (!warnings.length) {
      return message.reply(`📭 <@${targetId}> no tiene advertencias para remover.`);
    }

    if (warningNumber > warnings.length) {
      return message.reply(`❌ Solo hay **${warnings.length}** warning(s). No existe el #${warningNumber}.`);
    }

    const removed = clearSpecificWarning(message.guild.id, targetId, warningNumber - 1);
    
    if (removed) {
      const newWarnings = getWarnings(message.guild.id, targetId);
      const embed = new EmbedBuilder()
        .setTitle('✅ Warning removido')
        .addFields(
          { name: 'Usuario', value: `<@${targetId}>`, inline: true },
          { name: 'Warnings restantes', value: `${newWarnings.length}`, inline: true }
        )
        .setColor(0x2ECC71)
        .setTimestamp();
      
      return message.reply({ embeds: [embed] });
    }

    return message.reply('❌ No se pudo remover el warning.');
  },
};

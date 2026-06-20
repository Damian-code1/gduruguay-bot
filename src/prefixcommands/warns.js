const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getWarnings } = require('../utils/warningsStore');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -warns')
    .setDescription('Muestra las advertencias de un usuario.')
    .addFields(
      { name: 'Uso', value: '`-warns @usuario` o `-warns <userId>`' },
      { name: 'Ejemplo', value: '`-warns @pepito`\n`-warns 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0xFEE75C)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'warns',
  help: {
    purpose: 'Muestra las advertencias de un usuario.',
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

    let targetId = mentionedMember?.id || cachedMember?.id || (isUserId ? rawTarget : null);
    if (!targetId) return message.reply({ embeds: [usageEmbed()] });

    let targetUser = mentionedMember?.user || cachedMember?.user || null;
    if (!targetUser && isUserId) {
      targetUser = await message.client.users.fetch(rawTarget).catch(() => null);
      if (!targetUser) return message.reply('❌ No pude encontrar ese usuario por ID.');
    }

    const displayName = targetUser?.username || targetId;

    const warnings = getWarnings(message.guild.id, targetId);
    if (!warnings.length) {
      return message.reply(`📭 ${displayName} no tiene advertencias.`);
    }

    const text = warnings.slice(-10).map((w, i) => {
      const ts = Math.floor(new Date(w.createdAt).getTime() / 1000);
      return `**#${i + 1}** • ${w.reason}\nModerador: <@${w.moderatorId}> • <t:${ts}:R>`;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings de ${displayName}`)
      .setDescription(text.slice(0, 4096))
      .setColor(0xFEE75C)
      .setFooter({ text: `Total: ${warnings.length}` });

    return message.reply({ embeds: [embed] });
  },
};

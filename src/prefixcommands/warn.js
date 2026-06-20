const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { addWarning } = require('../utils/warningsStore');
const { isStaff } = require('../utils/staffRolesStore');
const { sendModerationDm } = require('../utils/moderationDm');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -warn')
    .setDescription('Agrega una advertencia a un usuario.')
    .addFields(
      { name: 'Uso', value: '`-warn @usuario [razón]` o `-warn <userId> [razón]`' },
      { name: 'Ejemplo', value: '`-warn @pepito spam`\n`-warn 123456789012345678 spam`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0xFEE75C)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'warn',
  help: {
    purpose: 'Agrega una advertencia a un usuario.',
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

    let targetUser = mentionedMember?.user || cachedMember?.user || null;
    if (!targetUser && isUserId) {
      targetUser = await message.client.users.fetch(rawTarget).catch(() => null);
    }

    const displayName = targetUser?.username || targetId;

    const reason = args.slice(1).join(' ') || 'Sin razón especificada';
    const list = addWarning(message.guild.id, targetId, {
      reason,
      moderatorId: message.author.id,
      moderatorName: message.author.username,
      createdAt: new Date().toISOString(),
    });

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Advertencia agregada')
      .addFields(
        { name: 'Usuario', value: `<@${targetId}> (${displayName})`, inline: true },
        { name: 'Total warnings', value: `${list.length}`, inline: true },
        { name: 'Razón', value: reason }
      )
      .setColor(0xFEE75C)
      .setTimestamp();

    await sendModerationDm(targetUser, {
      title: '⚠️ Has recibido una advertencia',
      color: 0xFEE75C,
      description: 'Se registró una advertencia en tu cuenta.',
      fields: [
        { name: 'Razón', value: reason, inline: false },
        { name: 'Total warnings', value: `${list.length}`, inline: true },
      ],
      moderator: `${message.author.tag}`,
      guild: `${message.guild.name}`,
    }).catch(() => null);

    return message.reply({ embeds: [embed] });
  },
};

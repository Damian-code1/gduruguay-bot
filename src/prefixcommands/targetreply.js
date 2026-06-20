const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { setTargetReply, getTargetReply, removeTargetReply, getAllTargetReplies } = require('../utils/targetReplyStore');
const { isStaff } = require('../utils/staffRolesStore');

function parseChannelId(raw) {
  if (!raw) return null;
  const mention = raw.match(/^<#(\d{17,20})>$/);
  if (mention) return mention[1];
  if (/^\d{17,20}$/.test(raw)) return raw;
  return null;
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('⚙️ Uso de targetreply')
    .setDescription('Configura respuestas automáticas por usuario + canal.')
    .addFields({
      name: 'Comandos',
      value: '`-targetreply set <userId> <channelId> <mensaje>`\n`-targetreply status`\n`-targetreply off <userId>`'
    })
    .setColor(0x5865F2)
    .setFooter({ text: 'Solo administradores' });
}

module.exports = {
  name: 'targetreply',
  help: {
    purpose: 'Responde automáticamente a un usuario específico en un canal específico.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = (args[0] || '').toLowerCase();

    if (!sub) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    if (sub === 'status') {
      const allReplies = getAllTargetReplies(message.guild.id);
      if (Object.keys(allReplies).length === 0) {
        return message.reply('ℹ️ No hay respuestas automáticas configuradas.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🤖 Respuestas automáticas configuradas')
        .setColor(0x5865F2);

      for (const [userId, config] of Object.entries(allReplies)) {
        embed.addFields({
          name: `<@${userId}> en <#${config.channelId}>`,
          value: `${config.replyText}`,
          inline: false,
        });
      }

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'off') {
      const userId = args[1];
      if (!/^\d{17,20}$/.test(userId)) {
        return message.reply('❌ Debes proporcionar un userId válido. `Ej: -targetreply off 123456789012345678`');
      }
      const removed = removeTargetReply(message.guild.id, userId);
      return message.reply(removed
        ? `✅ Respuesta automática para <@${userId}> desactivada.`
        : `ℹ️ No había configuración activa para <@${userId}>.`);
    }

    if (sub !== 'set') {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const userId = args[1];
    const channelId = parseChannelId(args[2]);
    const replyText = args.slice(3).join(' ').trim();

    if (!/^\d{17,20}$/.test(userId) || !channelId || !replyText) {
      const embed = usageEmbed().addFields({
        name: 'Ejemplo',
        value: '`-targetreply set 123456789012345678 1487919529530097694 Hola`'
      });
      return message.reply({ embeds: [embed] });
    }

    setTargetReply(message.guild.id, userId, channelId, replyText, message.author.id, Date.now());

    return message.reply(`✅ Configurado. Responderé a <@${userId}> en <#${channelId}> con:\n${replyText}`);
  },
};

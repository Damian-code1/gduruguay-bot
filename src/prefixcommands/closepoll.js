const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const pollCommand = require('./poll');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -closepoll')
    .setDescription('Cierra una encuesta manualmente.')
    .addFields(
      { name: 'Uso', value: '`-closepoll` respondiendo al mensaje de la encuesta\n`-closepoll <messageId>`' },
      { name: 'Permisos', value: 'Solo administradores o staff configurado' }
    )
    .setColor(0xE67E22)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'closepoll',
  help: {
    purpose: 'Cierra una encuesta manualmente.',
    category: '🛡️ Moderación',
  },
  async execute(message, args) {
    const guildId = message.guild?.id;
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const repliedMessageId = message.reference?.messageId;
    const inputMessageId = args[0];
    const targetMessageId = repliedMessageId || inputMessageId;

    if (!targetMessageId || !/^\d{17,20}$/.test(targetMessageId)) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const pollMessage = await message.channel.messages.fetch(targetMessageId).catch(() => null);
    if (!pollMessage) {
      return message.reply('❌ No pude encontrar ese mensaje en este canal.');
    }

    const result = await pollCommand.forceClosePollMessage(pollMessage);

    if (!result?.ok) {
      if (result?.reason === 'already_closed') {
        return message.reply('ℹ️ Esa encuesta ya está cerrada.');
      }
      return message.reply('❌ Ese mensaje no parece una encuesta activa creada con `-poll`.');
    }

    return message.reply('✅ Encuesta cerrada forzadamente.');
  },
};

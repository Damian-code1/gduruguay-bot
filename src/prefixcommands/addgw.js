const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { findGiveawayByMessageId, forceAddParticipant } = require('../utils/giveawayStore');
const { isStaff } = require('../utils/staffRolesStore');

function isAllowed(member, guildId) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(member, guildId);
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -addgw')
    .setDescription('Agrega un usuario a una giveaway por ID de mensaje, ignorando problemas con los requisitos.')
    .addFields(
      { name: 'Uso', value: '`-addgw <messageId> @usuario` o `-addgw <messageId> <userId>`' },
      { name: 'Ejemplo', value: '`-addgw 123456789012345678 @pepito`\n`-addgw 123456789012345678 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores o staff' },
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' });
}

function parseTargetId(message, args) {
  const mentioned = message.mentions.users.first();
  if (mentioned) return mentioned.id;

  const raw = String(args[1] || '').trim();
  if (/^\d{17,20}$/.test(raw)) return raw;

  return null;
}

module.exports = {
  name: 'addgw',
  aliases: ['addgiveaway'],
  help: {
    purpose: 'Agrega usuarios a una giveaway por ID de mensaje.',
    category: '🎁 Sorteos',
    aliases: ['addgiveaway'],
    adminOnly: true,
    usage: '-addgw <messageId> @usuario | -addgw <messageId> <userId>',
  },
  async execute(message, args) {
    if (!message.guild) return;
    if (!isAllowed(message.member, message.guild.id)) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const giveawayMessageId = String(args[0] || '').trim();
    if (!giveawayMessageId) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const targetId = parseTargetId(message, args);
    if (!targetId) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const giveaway = await findGiveawayByMessageId(giveawayMessageId, { activeOnly: true });
    if (!giveaway) {
      return message.reply('❌ No encontré una giveaway activa con ese mensaje.');
    }

    const updated = await forceAddParticipant(giveaway.id, targetId);
    if (!updated) {
      return message.reply('❌ No pude agregar al usuario a la giveaway.');
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Usuario agregado a la giveaway')
      .addFields(
        { name: 'Usuario', value: `<@${targetId}>`, inline: true },
        { name: 'Giveaway', value: `\`${giveaway.id}\``, inline: true },
        { name: 'Mensaje', value: `\`${giveawayMessageId}\``, inline: false },
      )
      .setColor(0x57F287)
      .setTimestamp()
      .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' });

    return message.reply({ embeds: [embed] });
  },
};

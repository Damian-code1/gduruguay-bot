const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, setCurrencyEmoji } = require('../utils/economyStore');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'setcurrency',
  help: {
    purpose: 'Configura el emoji/icono de la moneda del servidor (admin o staff).',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);

    if (!canManage) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos').setColor(0xED4245).setDescription('Solo admins o staff configurado pueden cambiar el emoji de moneda.')],
      });
    }

    const emoji = String(args[0] || '').trim();
    if (!emoji) {
      const current = getGuildConfig(message.guild.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📖 Uso: -setcurrency')
            .setColor(0x5865F2)
            .setDescription('Uso: `-setcurrency <emoji>`\nEjemplo: `-setcurrency 💎`')
            .addFields({ name: 'Actual', value: current.currencyEmoji, inline: true }),
        ],
      });
    }

    setCurrencyEmoji(message.guild.id, emoji);
    const config = getGuildConfig(message.guild.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Moneda actualizada')
      .setColor(0x2ECC71)
      .setDescription(`La moneda del servidor ahora es: ${config.currencyEmoji}`)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

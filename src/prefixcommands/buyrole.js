const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getRolePrice, canAfford, removeFromWallet } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');

module.exports = {
  name: 'buyrole',
  help: {
    purpose: 'Compra un rol configurado en la tienda de economía.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const role = resolveRoleTarget(message, args.join(' '));
    if (!role) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-buyrole <@rol|rolId|nombre>`')],
      });
    }

    const config = getGuildConfig(message.guild.id);
    const price = getRolePrice(message.guild.id, role.id);
    if (!price) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Rol no disponible').setColor(0xED4245).setDescription('Ese rol no está en la tienda.')],
      });
    }

    const member = message.member;
    if (member.roles.cache.has(role.id)) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('ℹ️ Ya lo tienes').setColor(0x5865F2).setDescription(`Ya tienes el rol ${role}.`)],
      });
    }

    if (!canAfford(message.guild.id, member.id, price)) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Fondos insuficientes')
            .setColor(0xED4245)
            .setDescription(`Necesitas ${formatCurrency(price, config)} para comprar ${role}.`),
        ],
      });
    }

    try {
      await member.roles.add(role, `Compra de rol en economía por ${member.user.tag}`);
      removeFromWallet(message.guild.id, member.id, price);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Compra realizada')
            .setColor(0x2ECC71)
            .setDescription(`Compraste ${role} por ${formatCurrency(price, config)}.`)
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('Error en -buyrole:', error);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Error').setColor(0xED4245).setDescription('No pude asignarte ese rol. Revisa jerarquía/permisos del bot.')],
      });
    }
  },
};

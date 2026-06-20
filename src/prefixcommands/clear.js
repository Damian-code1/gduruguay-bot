const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');

module.exports = {
  name: 'clear',
  help: {
    purpose: 'Borra mensajes recientes del canal actual (1 a 100).',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse)
      return message.reply('❌ No tenés permisos para usar este comando.');

    const cantidad = parseInt(args[0]);

    if (!cantidad || isNaN(cantidad) || cantidad < 1 || cantidad > 100) {
      const embed = new EmbedBuilder()
        .setTitle('📖 Uso: -clear')
        .setDescription('Borra mensajes del canal actual.')
        .addFields(
          { name: 'Uso', value: '`-clear <cantidad>`' },
          { name: 'Ejemplo', value: '`-clear 20`' },
          { name: 'Nota', value: 'Máximo 100 mensajes. No borra mensajes de más de 14 días.' },
        )
        .setColor(0x3498DB)
        .setFooter({ text: 'gduruguay bot' });
      return message.reply({ embeds: [embed] });
    }

    await message.delete();
    const borrados = await message.channel.bulkDelete(cantidad, true);

    const reply = await message.channel.send(`🧹 Se borraron **${borrados.size}** mensajes.`);
    setTimeout(() => reply.delete().catch(() => {}), 4000);
  }
};
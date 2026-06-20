const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { setAutorole, getAutorole, clearAutorole } = require('../utils/autoroleStore');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');

function usageEmbed(currentRole = null) {
  const embed = new EmbedBuilder()
    .setTitle('📖 Uso: -autorole')
    .setDescription('Configura el rol automático para nuevos miembros.')
    .addFields(
      { name: 'Comandos', value: '`-autorole set <@rol|rolId|nombre>` → Establecer\n`-autorole off` → Desactivar' },
      { name: 'Ejemplo', value: '`-autorole set 123456789012345678`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
  
  if (currentRole) {
    embed.addFields({ name: 'Configuración actual', value: `<@&${currentRole}>` });
  }
  
  return embed;
}

module.exports = {
  name: 'autorole',
  help: {
    purpose: 'Configura el rol automático para nuevos miembros.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = (args[0] || '').toLowerCase();

    if (!sub) {
      const current = getAutorole(message.guild.id);
      return message.reply({ embeds: [usageEmbed(current)] });
    }

    if (sub === 'off') {
      clearAutorole(message.guild.id);
      return message.reply('✅ Autorole desactivado.');
    }

    if (sub !== 'set') {
      const current = getAutorole(message.guild.id);
      return message.reply({ embeds: [usageEmbed(current)] });
    }

    const role = resolveRoleTarget(message, args.slice(1).join(' '));
    if (!role) {
      return message.reply({ embeds: [usageEmbed().setDescription('❌ Tenés que indicar un rol válido.')] });
    }

    setAutorole(message.guild.id, role.id);
    return message.reply(`✅ Autorole configurado: ${role}`);
  },
};

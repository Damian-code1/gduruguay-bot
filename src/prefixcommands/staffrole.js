const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getStaffRoles, addStaffRole, removeStaffRole, clearStaffRoles } = require('../utils/staffRolesStore');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');

function usageEmbed(guild) {
  const staffRoles = getStaffRoles(guild.id);
  const embed = new EmbedBuilder()
    .setTitle('📖 Uso: -staffrole')
    .setDescription('Configura qué roles se consideran staff y pueden usar comandos sin ser admin.')
    .addFields(
      { name: 'Comandos', value: '`-staffrole add <@rol|rolId|nombre>` - Agregar rol\n`-staffrole remove <@rol|rolId|nombre>` - Remover rol\n`-staffrole list` - Listar roles\n`-staffrole clear` - Limpiar todos' },
      { name: 'Ejemplo', value: '`-staffrole add 123456789012345678`\n`-staffrole add Helper`' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
  
  if (staffRoles.length > 0) {
    const roleNames = staffRoles
      .map(id => {
        const role = guild.roles.cache.get(id);
        return role?.name ? `@${role.name}` : `@rol-eliminado (${id})`;
      })
      .join(', ');
    embed.addFields({ name: 'Roles de staff actuales', value: roleNames });
  }
  
  return embed;
}

module.exports = {
  name: 'staffrole',
  help: {
    purpose: 'Configura roles staff que pueden usar comandos sin ser admin.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = (args[0] || '').toLowerCase();

    if (!sub || sub === 'list') {
      return message.reply({ embeds: [usageEmbed(message.guild)] });
    }

    if (sub === 'clear') {
      clearStaffRoles(message.guild.id);
      return message.reply('✅ Roles de staff limpiados.');
    }

    if (sub === 'add') {
      const role = resolveRoleTarget(message, args.slice(1).join(' '));
      if (!role) {
        return message.reply({ embeds: [usageEmbed(message.guild).setDescription('❌ Necesitas mencionar un rol válido.')] });
      }

      addStaffRole(message.guild.id, role.id);
      return message.reply(`✅ ${role.name} agregado como staff.`);
    }

    if (sub === 'remove') {
      const role = resolveRoleTarget(message, args.slice(1).join(' '));
      if (!role) {
        return message.reply({ embeds: [usageEmbed(message.guild).setDescription('❌ Necesitas mencionar un rol válido.')] });
      }

      removeStaffRole(message.guild.id, role.id);
      return message.reply(`✅ ${role.name} removido de staff.`);
    }

    return message.reply({ embeds: [usageEmbed(message.guild)] });
  },
};

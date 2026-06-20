const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllDepartments, setDepartmentRole } = require('../utils/departmentStore');

module.exports = {
  name: 'depsetup',
  aliases: ['depautoconfigure', 'depauto'],
  help: {
    purpose: 'Configura automáticamente los roles de departamentos buscándolos por nombre.',
    category: '📍 Departamentos',
  },
  async execute(message, args) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🚫 Permiso denegado')
        .setDescription('Solo administradores con **Gestionar Roles** pueden usar este comando.');
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const departments = getAllDepartments();
    const guildRoles = message.guild.roles.cache;

    const ok = [];
    const notFound = [];

    for (const dept of departments) {
      // Exacto → case-insensitive → contiene el nombre del departamento
      const deptLower = dept.toLowerCase();
      const role =
        guildRoles.find(r => r.name === dept) ||
        guildRoles.find(r => r.name.toLowerCase() === deptLower) ||
        guildRoles.find(r => r.name.toLowerCase().includes(deptLower));

      if (role) {
        setDepartmentRole(dept, role.id);
        ok.push(`✅ **${dept}** → ${role}`);
      } else {
        notFound.push(`❌ **${dept}** — no encontrado`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Setup automático de departamentos')
      .setColor(notFound.length === 0 ? 0x57F287 : ok.length === 0 ? 0xED4245 : 0xFAA61A)
      .setFooter({ text: `${ok.length} configurados • ${notFound.length} no encontrados • por ${message.author.tag}` })
      .setTimestamp();

    if (ok.length) {
      embed.addFields({
        name: `✅ Configurados (${ok.length})`,
        value: ok.join('\n'),
        inline: false,
      });
    }

    if (notFound.length) {
      embed.addFields({
        name: `❌ No encontrados (${notFound.length})`,
        value: notFound.join('\n') + '\n\n*Usá `-deprole set <departamento> <@rol>` para configurarlos manualmente.*',
        inline: false,
      });
    }

    return message.reply({ embeds: [embed] }).catch(() => null);
  },
};
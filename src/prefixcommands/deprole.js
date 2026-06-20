const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getAllDepartments, setDepartmentRole, getDepartmentRoles, removeDepartmentRole } = require('../utils/departmentStore');

module.exports = {
  name: 'deprole',
  aliases: ['departmentrole', 'depconfig'],
  help: {
    purpose: 'Configura los roles para los departamentos (solo administradores).',
    category: '📍 Departamentos',
  },
  async execute(message, args) {
    if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const embed = new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('🚫 Permiso denegado')
        .setDescription('Solo administradores con **Gestionar Roles** pueden configurar los departamentos.');
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const subcommand = args[0]?.toLowerCase();

    // ── HELP / sin args ──────────────────────────────────────────────────────
    if (!subcommand || subcommand === 'help') {
      const embed = new EmbedBuilder()
        .setColor(0xFF6347)
        .setTitle('⚙️ Configuración de Departamentos')
        .setDescription('Gestiona qué rol de Discord corresponde a cada departamento.')
        .addFields(
          {
            name: '📝 Comandos',
            value:
              '`-deprole set <departamento> <@rol>` — Asigna un rol\n' +
              '`-deprole list` — Lista los roles configurados\n' +
              '`-deprole remove <departamento>` — Elimina la configuración',
            inline: false,
          },
          {
            name: '📌 Ejemplo',
            value: '`-deprole set Montevideo @Montevidianos`',
            inline: false,
          }
        )
        .setFooter({ text: 'Sistema de departamentos • Solo admins' })
        .setTimestamp();
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    // ── SET ──────────────────────────────────────────────────────────────────
    if (subcommand === 'set') {
      const departmentName = args[1];
      const roleArg = args.slice(2).join(' ');

      if (!departmentName || !roleArg) {
        const embed = new EmbedBuilder()
          .setColor(0xFAA61A)
          .setTitle('⚠️ Faltan argumentos')
          .setDescription('**Uso:** `-deprole set <departamento> <@rol>`\n**Ejemplo:** `-deprole set Montevideo @Montevidianos`');
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      const departments = getAllDepartments();
      const normalizedDept = departments.find(
        d => d.toLowerCase() === departmentName.toLowerCase()
      );

      if (!normalizedDept) {
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Departamento no encontrado')
          .setDescription(`No existe el departamento **"${departmentName}"**.`)
          .addFields({
            name: '📋 Departamentos válidos',
            value: departments.join(', ') || 'Ninguno cargado',
            inline: false,
          });
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      let role = message.mentions.roles.first();
      if (!role) {
        role = message.guild.roles.cache.find(
          r => r.name.toLowerCase() === roleArg.toLowerCase() || r.id === roleArg
        );
      }

      if (!role) {
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Rol no encontrado')
          .setDescription(`No pude encontrar el rol \`${roleArg}\`.\nMenciona el rol con @, escribe su nombre exacto, o pega su ID.`);
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      setDepartmentRole(normalizedDept, role.id);

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Rol configurado')
        .setDescription(`El departamento **${normalizedDept}** quedó vinculado a ${role}.`)
        .addFields(
          { name: '📍 Departamento', value: normalizedDept, inline: true },
          { name: '🎭 Rol', value: role.toString(), inline: true },
          { name: '🆔 ID del rol', value: `\`${role.id}\``, inline: true },
        )
        .setFooter({ text: `Configurado por ${message.author.tag}` })
        .setTimestamp();
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    // ── LIST ─────────────────────────────────────────────────────────────────
    if (subcommand === 'list') {
      const roles = getDepartmentRoles();
      const entries = Object.entries(roles);

      if (entries.length === 0) {
        const embed = new EmbedBuilder()
          .setColor(0xFAA61A)
          .setTitle('📋 Roles configurados')
          .setDescription('No hay roles configurados todavía.\nUsá `-deprole set <departamento> <@rol>` para agregar uno.');
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      const lines = entries.map(([dept, roleId]) => {
        const role = message.guild.roles.cache.get(roleId);
        return `**${dept}** → ${role ? role.toString() : `~~<@&${roleId}>~~ *(eliminado)*`}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📋 Roles configurados')
        .setDescription(lines.join('\n'))
        .setFooter({ text: `${entries.length} departamento(s) configurado(s)` })
        .setTimestamp();
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    // ── REMOVE ───────────────────────────────────────────────────────────────
    if (subcommand === 'remove') {
      const departmentName = args[1];

      if (!departmentName) {
        const embed = new EmbedBuilder()
          .setColor(0xFAA61A)
          .setTitle('⚠️ Falta el departamento')
          .setDescription('**Uso:** `-deprole remove <departamento>`');
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      const departments = getAllDepartments();
      const normalizedDept = departments.find(
        d => d.toLowerCase() === departmentName.toLowerCase()
      );

      if (!normalizedDept) {
        const embed = new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('❌ Departamento no encontrado')
          .setDescription(`No existe el departamento **"${departmentName}"**.`);
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      const roles = getDepartmentRoles();
      if (!roles[normalizedDept]) {
        const embed = new EmbedBuilder()
          .setColor(0xFAA61A)
          .setTitle('⚠️ Sin configuración')
          .setDescription(`El departamento **${normalizedDept}** no tiene rol configurado.`);
        return message.reply({ embeds: [embed] }).catch(() => null);
      }

      // Usar la util si existe, sino escribir manualmente
      if (typeof removeDepartmentRole === 'function') {
        removeDepartmentRole(normalizedDept);
      } else {
        const fs = require('fs');
        const path = require('path');
        delete roles[normalizedDept];
        const rolesPath = path.join(__dirname, '../department-roles.json');
        fs.writeFileSync(rolesPath, JSON.stringify(roles, null, 2));
      }

      const embed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('🗑️ Configuración eliminada')
        .setDescription(`Se removió la configuración de **${normalizedDept}**.`)
        .setFooter({ text: `Acción por ${message.author.tag}` })
        .setTimestamp();
      return message.reply({ embeds: [embed] }).catch(() => null);
    }

    // ── Subcomando desconocido ────────────────────────────────────────────────
    const embed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('❌ Subcomando desconocido')
      .setDescription(`\`${subcommand}\` no es válido. Usá \`-deprole help\` para ver los disponibles.`);
    return message.reply({ embeds: [embed] }).catch(() => null);
  },
};
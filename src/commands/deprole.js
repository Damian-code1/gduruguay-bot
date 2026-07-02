'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');
const {
  getAllDepartments,
  getDepartmentRoles,
  setDepartmentRole,
  removeDepartmentRole,
} = require('../utils/departmentStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deprole')
    .setDescription('Configura manualmente qué rol corresponde a cada departamento.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Vincula un departamento a un rol.')
        .addStringOption((opt) =>
          opt
            .setName('departamento')
            .setDescription('Departamento')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addRoleOption((opt) => opt.setName('rol').setDescription('Rol a vincular').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Lista los roles configurados por departamento.'))
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Elimina la configuración de un departamento.')
        .addStringOption((opt) =>
          opt
            .setName('departamento')
            .setDescription('Departamento')
            .setRequired(true)
            .setAutocomplete(true),
        ),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const departments = getAllDepartments();
    const filtered = departments.filter((d) => d.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(filtered.map((d) => ({ name: d, value: d })));
  },

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return replyError(interaction, 'Necesitás el permiso **Gestionar Roles** para usar este comando.');
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const roles = await getDepartmentRoles(guildId);
      const entries = Object.entries(roles);

      const embed = new EmbedBuilder().setTitle('📍 Roles de departamentos configurados').setColor(config.colors.primary);

      if (!entries.length) {
        embed.setDescription('No hay roles configurados todavía. Usá `/deprole set` o `/deprole-auto`.');
      } else {
        const lines = entries.map(([dept, roleId]) => {
          const role = interaction.guild.roles.cache.get(roleId);
          return `**${dept}** → ${role ? `<@&${roleId}>` : `~~<@&${roleId}>~~ *(rol eliminado)*`}`;
        });
        embed.setDescription(lines.join('\n')).setFooter({ text: `${entries.length} departamento(s) configurado(s)` });
      }

      return replyEmbed(interaction, { embed });
    }

    const departmentName = interaction.options.getString('departamento', true);
    const departments = getAllDepartments();
    const normalizedDept = departments.find((d) => d.toLowerCase() === departmentName.toLowerCase());

    if (!normalizedDept) {
      return replyError(
        interaction,
        `No existe el departamento **"${departmentName}"**.\nDepartamentos válidos: ${departments.join(', ')}`,
      );
    }

    if (sub === 'set') {
      const role = interaction.options.getRole('rol', true);
      await setDepartmentRole(guildId, normalizedDept, role.id);

      const embed = new EmbedBuilder()
        .setTitle('✅ Rol configurado')
        .setColor(config.colors.success)
        .setDescription(`El departamento **${normalizedDept}** quedó vinculado a <@&${role.id}>.`);
      return replyEmbed(interaction, { embed });
    }

    if (sub === 'remove') {
      const removed = await removeDepartmentRole(guildId, normalizedDept);
      if (!removed) {
        return replyError(interaction, `El departamento **${normalizedDept}** no tenía rol configurado.`);
      }

      const embed = new EmbedBuilder()
        .setTitle('🗑️ Configuración eliminada')
        .setColor(config.colors.success)
        .setDescription(`Se removió la configuración de **${normalizedDept}**.`);
      return replyEmbed(interaction, { embed });
    }

    return replyError(interaction, 'Subcomando inválido.');
  },
};

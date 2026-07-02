'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { replyEmbed } = require('../utils/respond');
const { getAllDepartments, setDepartmentRole } = require('../utils/departmentStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('deprole-auto')
    .setDescription('Busca automáticamente roles del servidor que coincidan con cada departamento.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      const embed = new EmbedBuilder()
        .setTitle('🚫 Permiso denegado')
        .setColor(config.colors.danger)
        .setDescription('Necesitás el permiso **Gestionar Roles** para usar este comando.');
      return replyEmbed(interaction, { embed });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const departments = getAllDepartments();
    const guildRoles = interaction.guild.roles.cache;

    const ok = [];
    const notFound = [];

    for (const dept of departments) {
      const deptLower = dept.toLowerCase();
      const role =
        guildRoles.find((r) => r.name === dept) ||
        guildRoles.find((r) => r.name.toLowerCase() === deptLower) ||
        guildRoles.find((r) => r.name.toLowerCase().includes(deptLower));

      if (role) {
        await setDepartmentRole(interaction.guildId, dept, role.id);
        ok.push(`✅ **${dept}** → <@&${role.id}>`);
      } else {
        notFound.push(`❌ **${dept}** — no encontrado`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Setup automático de departamentos')
      .setColor(notFound.length === 0 ? config.colors.success : ok.length === 0 ? config.colors.danger : config.colors.warning)
      .setFooter({ text: `${ok.length} configurados · ${notFound.length} no encontrados` })
      .setTimestamp();

    if (ok.length) embed.addFields({ name: `✅ Configurados (${ok.length})`, value: ok.join('\n') });
    if (notFound.length) {
      embed.addFields({
        name: `❌ No encontrados (${notFound.length})`,
        value: `${notFound.join('\n')}\n\n*Usá \`/deprole set\` para configurarlos manualmente.*`,
      });
    }

    return replyEmbed(interaction, { embed });
  },
};

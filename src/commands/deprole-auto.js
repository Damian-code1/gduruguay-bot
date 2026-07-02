'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { replyEmbed } = require('../utils/respond');
const { getAllDepartments } = require('../utils/departmentStore');

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

    // Este comando ya no guarda nada en base de datos: el bot detecta los
    // roles de departamento en vivo por nombre exacto. Esto solo verifica
    // y muestra qué roles existen y cuáles faltan crear.
    const found = [];
    const notFound = [];

    for (const dept of departments) {
      const role = guildRoles.find((r) => r.name.toLowerCase() === dept.toLowerCase());
      if (role) {
        found.push(`✅ **${dept}** → <@&${role.id}>`);
      } else {
        notFound.push(`❌ **${dept}** — no existe un rol con ese nombre exacto`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('⚙️ Verificación de roles de departamento')
      .setColor(notFound.length === 0 ? config.colors.success : found.length === 0 ? config.colors.danger : config.colors.warning)
      .setDescription('El bot asigna departamentos buscando un rol en el servidor con el **mismo nombre exacto**. No hace falta configurar nada más — solo creá el rol con ese nombre.')
      .setFooter({ text: `${found.length} encontrados · ${notFound.length} faltantes` })
      .setTimestamp();

    if (found.length) embed.addFields({ name: `✅ Roles encontrados (${found.length})`, value: found.join('\n') });
    if (notFound.length) {
      embed.addFields({
        name: `❌ Roles faltantes (${notFound.length})`,
        value: `${notFound.join('\n')}\n\n*Creá un rol en el servidor con el nombre exacto del departamento para que funcione.*`,
      });
    }

    return replyEmbed(interaction, { embed });
  },
};

'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');
const {
  getStaffRoles,
  setStaffRoles,
  addStaffRoles,
  removeStaffRoles,
  clearStaffRoles,
} = require('../utils/staffRolesStore');

function formatRoles(roleIds) {
  return roleIds.map((id) => `<@&${id}>`).join(', ');
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('staffrole')
    .setDescription('Define qué roles tienen permisos de staff (moderación) en el bot.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Reemplaza la lista de roles de staff.')
        .addRoleOption((opt) => opt.setName('rol').setDescription('Rol de staff').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Agrega un rol de staff.')
        .addRoleOption((opt) => opt.setName('rol').setDescription('Rol a agregar').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Quita un rol de staff.')
        .addRoleOption((opt) => opt.setName('rol').setDescription('Rol a quitar').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Muestra los roles de staff actuales.'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Elimina todos los roles de staff configurados.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  // Nota: este comando es SOLO para Administrator (no para staff normal),
  // por eso no usa requireStaff/isStaff sino el check de permisos nativo de Discord
  // vía setDefaultMemberPermissions. Igual reforzamos por si el admin cambió los defaults.
  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyError(interaction, 'Solo administradores pueden configurar los roles de staff.');
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const roles = await getStaffRoles(guildId);
      const embed = new EmbedBuilder()
        .setTitle('🛡️ Roles de staff configurados')
        .setDescription(roles.length ? formatRoles(roles) : 'No hay roles de staff configurados (solo Administrator tiene acceso).')
        .setColor(config.colors.primary);
      return replyEmbed(interaction, { embed });
    }

    if (sub === 'clear') {
      await clearStaffRoles(guildId);
      const embed = new EmbedBuilder()
        .setTitle('✅ Roles de staff eliminados')
        .setDescription('Ya no hay roles de staff configurados (solo Administrator tiene acceso).')
        .setColor(config.colors.success);
      return replyEmbed(interaction, { embed });
    }

    const role = interaction.options.getRole('rol', true);
    let updated;

    if (sub === 'set') updated = await setStaffRoles(guildId, [role.id]);
    else if (sub === 'add') updated = await addStaffRoles(guildId, [role.id]);
    else if (sub === 'remove') updated = await removeStaffRoles(guildId, [role.id]);
    else return replyError(interaction, 'Subcomando inválido.');

    const embed = new EmbedBuilder()
      .setTitle('✅ Roles de staff actualizados')
      .setDescription(updated.length ? `Roles de staff: ${formatRoles(updated)}` : 'No quedó ningún rol de staff configurado.')
      .setColor(config.colors.success);

    return replyEmbed(interaction, { embed });
  },
};

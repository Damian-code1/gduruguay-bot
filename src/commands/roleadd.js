'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff } = require('../utils/guards');
const { replyEmbed, replyError } = require('../utils/respond');
const { findBestRoleMatch, searchRolesForAutocomplete } = require('../utils/roleFuzzyMatch');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('roleadd')
    .setDescription('Asigna un rol a un usuario, con búsqueda flexible por nombre.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a modificar').setRequired(true))
    .addStringOption((opt) =>
      opt.setName('rol').setDescription('Nombre del rol').setRequired(true).setAutocomplete(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const matches = searchRolesForAutocomplete(interaction.guild, focused);
    await interaction.respond(matches.map((r) => ({ name: r.name, value: r.name })));
  },

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;

    await interaction.deferReply().catch(() => null);

    const targetUser = interaction.options.getUser('usuario', true);
    const roleQuery = interaction.options.getString('rol', true);

    const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
    if (!targetMember) {
      return replyError(interaction, 'Ese usuario no está en este servidor.');
    }

    const role = findBestRoleMatch(interaction.guild, roleQuery);
    if (!role) {
      return replyError(interaction, `No encontré ningún rol parecido a **"${roleQuery}"**.`);
    }

    const me = interaction.guild.members.me;
    if (role.position >= me.roles.highest.position) {
      return replyError(interaction, `No puedo asignar **${role.name}**: está igual o por encima de mi rol más alto.`);
    }

    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      role.position >= interaction.member.roles.highest.position
    ) {
      return replyError(interaction, `No podés asignar **${role.name}**: está igual o por encima de tu rol más alto.`);
    }

    if (targetMember.roles.cache.has(role.id)) {
      return replyError(interaction, `<@${targetMember.id}> ya tiene el rol **${role.name}**.`);
    }

    await targetMember.roles.add(role.id, `Asignado por ${interaction.user.tag} via /roleadd`);

    const embed = new EmbedBuilder()
      .setTitle('✅ Rol asignado')
      .setColor(config.colors.success)
      .addFields(
        { name: 'Usuario', value: `<@${targetMember.id}>`, inline: true },
        { name: 'Rol', value: role.name, inline: true },
        { name: 'Por', value: `<@${interaction.user.id}>`, inline: true },
      )
      .setTimestamp();

    await replyEmbed(interaction, { embed, pings: false });
  },
};
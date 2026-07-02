'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff } = require('../utils/guards');
const { replyEmbed, replyError } = require('../utils/respond');
const { setAutorole, getAutorole, clearAutorole } = require('../utils/autoroleStore');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Configura el rol que se asigna automáticamente a nuevos miembros.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Define el rol de autorole.')
        .addRoleOption((opt) => opt.setName('rol').setDescription('Rol a asignar automáticamente').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('check').setDescription('Muestra el rol de autorole actual.'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Desactiva el autorole.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'check') {
      const roleId = await getAutorole(guildId);
      const embed = new EmbedBuilder()
        .setTitle('🏷️ Autorole actual')
        .setColor(config.colors.primary)
        .setDescription(roleId ? `Rol asignado automáticamente: <@&${roleId}>` : 'No hay autorole configurado.');
      return replyEmbed(interaction, { embed });
    }

    if (sub === 'clear') {
      await clearAutorole(guildId);
      const embed = new EmbedBuilder().setTitle('✅ Autorole desactivado').setColor(config.colors.success);
      return replyEmbed(interaction, { embed });
    }

    const role = interaction.options.getRole('rol', true);
    const botMember = interaction.guild.members.me;

    if (botMember.roles.highest.comparePositionTo(role) <= 0) {
      return replyError(interaction, 'Ese rol está por encima de mi rol más alto. No podré asignarlo.');
    }

    await setAutorole(guildId, role.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Autorole configurado')
      .setColor(config.colors.success)
      .setDescription(`Los nuevos miembros recibirán automáticamente <@&${role.id}>.`);

    return replyEmbed(interaction, { embed });
  },
};

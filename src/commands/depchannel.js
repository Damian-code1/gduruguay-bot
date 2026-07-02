'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');
const { getDepartmentChannel, setDepartmentChannel, clearDepartmentChannel } = require('../utils/departmentStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('depchannel')
    .setDescription('Define el canal donde el bot detecta automáticamente el departamento que escribe cada persona.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Define el canal de auto-detección de departamentos.')
        .addChannelOption((opt) =>
          opt
            .setName('canal')
            .setDescription('Canal donde la gente escribe su departamento')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) => sub.setName('check').setDescription('Muestra el canal configurado actualmente.'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Desactiva la auto-detección de departamentos.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyError(interaction, 'Solo administradores pueden configurar el canal de departamentos.');
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'check') {
      const channelId = await getDepartmentChannel(guildId);
      const embed = new EmbedBuilder()
        .setTitle('📍 Canal de departamentos')
        .setColor(config.colors.primary)
        .setDescription(channelId ? `Canal activo: <#${channelId}>` : 'No hay canal configurado. Usá `/depchannel set`.');
      return replyEmbed(interaction, { embed });
    }

    if (sub === 'clear') {
      await clearDepartmentChannel(guildId);
      const embed = new EmbedBuilder()
        .setTitle('✅ Auto-detección desactivada')
        .setColor(config.colors.success)
        .setDescription('El bot ya no va a detectar departamentos automáticamente en ningún canal.');
      return replyEmbed(interaction, { embed });
    }

    const channel = interaction.options.getChannel('canal', true);
    await setDepartmentChannel(guildId, channel.id);

    const embed = new EmbedBuilder()
      .setTitle('✅ Canal configurado')
      .setColor(config.colors.success)
      .setDescription(
        `A partir de ahora, cualquier mensaje en <#${channel.id}> se va a interpretar como el nombre de un departamento.\n` +
          'El bot va a asignar el rol correspondiente automáticamente (con tolerancia a errores de tipeo).',
      );
    return replyEmbed(interaction, { embed });
  },
};

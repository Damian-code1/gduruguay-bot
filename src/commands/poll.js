'use strict';

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { parseDuration } = require('../utils/timeParser');
const { createPoll } = require('../utils/pollRuntime');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea una encuesta con votación por botones (ephemeral).')
    .addStringOption((opt) => opt.setName('pregunta').setDescription('La pregunta de la encuesta').setRequired(true))
    .addStringOption((opt) => opt.setName('opcion1').setDescription('Opción 1').setRequired(true))
    .addStringOption((opt) => opt.setName('opcion2').setDescription('Opción 2').setRequired(true))
    .addStringOption((opt) => opt.setName('opcion3').setDescription('Opción 3'))
    .addStringOption((opt) => opt.setName('opcion4').setDescription('Opción 4'))
    .addStringOption((opt) => opt.setName('opcion5').setDescription('Opción 5'))
    .addStringOption((opt) => opt.setName('opcion6').setDescription('Opción 6'))
    .addStringOption((opt) => opt.setName('opcion7').setDescription('Opción 7'))
    .addStringOption((opt) => opt.setName('opcion8').setDescription('Opción 8'))
    .addStringOption((opt) => opt.setName('opcion9').setDescription('Opción 9'))
    .addStringOption((opt) => opt.setName('opcion10').setDescription('Opción 10'))
    .addStringOption((opt) => opt.setName('duracion').setDescription('Ej: 30m, 1h, 2d. Vacío = sin límite'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const staff = await isStaff(interaction.member);
    if (!staff) {
      return interaction.reply({ content: '❌ Solo staff puede crear encuestas.', flags: MessageFlags.Ephemeral });
    }

    const question = interaction.options.getString('pregunta', true);
    const options = [];
    for (let i = 1; i <= 10; i++) {
      const val = interaction.options.getString(`opcion${i}`);
      if (val) options.push(val);
    }

    if (options.length < 2) {
      return interaction.reply({ content: '❌ Necesitás al menos 2 opciones.', flags: MessageFlags.Ephemeral });
    }

    const durationRaw = interaction.options.getString('duracion');
    const durationMs = durationRaw ? parseDuration(durationRaw) : 0;

    await createPoll(interaction.channel, question, options, durationMs);

    return interaction.reply({ content: '✅ Encuesta publicada.', flags: MessageFlags.Ephemeral });
  },
};
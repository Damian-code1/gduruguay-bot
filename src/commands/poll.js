'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyError } = require('../utils/respond');
const { isStaff } = require('../utils/staffRolesStore');
const { createPoll, buildPollEmbed, buildPollButtons } = require('../utils/pollRuntime');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('poll')
    .setDescription('Crea una encuesta simple con botones.')
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
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const staff = await isStaff(interaction.member);
    if (!staff) return replyError(interaction, 'Solo staff puede crear encuestas.');

    const question = interaction.options.getString('pregunta', true);
    const options = [];
    for (let i = 1; i <= 10; i++) {
      const val = interaction.options.getString(`opcion${i}`);
      if (val) options.push(val);
    }

    if (options.length < 2) return replyError(interaction, 'Necesitás al menos 2 opciones.');
    if (options.length > 10) return replyError(interaction, 'Máximo 10 opciones.');

    const pollId = createPoll(question, options);
    const embed = buildPollEmbed(question, options, new Map());
    const rows = buildPollButtons(pollId, options);

    await interaction.channel.send({ embeds: [embed], components: rows });
    return interaction.reply({ content: '✅ Encuesta publicada.', flags: 64 });
  },
};
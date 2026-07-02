'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const config = require('../config');
const { getAllDepartments, getDepartmentChannel } = require('../utils/departmentStore');

module.exports = {
  data: new SlashCommandBuilder().setName('dephelp').setDescription('Muestra cómo funciona el sistema de departamentos.').setDMPermission(false),

  async execute(interaction) {
    const departments = getAllDepartments();
    const channelId = await getDepartmentChannel(interaction.guildId);

    const embed = new EmbedBuilder()
      .setColor(config.colors.primary)
      .setTitle('📍 Sistema de Departamentos')
      .setDescription(
        '**¿Cómo funciono?**\n' +
          `1️⃣ Escribí el nombre de tu departamento en ${channelId ? `<#${channelId}>` : 'el canal configurado'}\n` +
          '2️⃣ El bot te asigna el rol automáticamente\n' +
          '3️⃣ Podés cambiar de departamento cuando quieras\n' +
          '4️⃣ Solo podés tener **1 departamento a la vez**\n\n' +
          '**Tolerancia a errores de tipeo (fuzzy matching):**\n' +
          '✅ "Mont" → Montevideo\n' +
          '✅ "monteivdeo" → Montevideo\n' +
          '✅ "mdvd" → Montevideo (alias)\n\n' +
          'O elegí tu departamento directamente acá abajo:',
      )
      .addFields({ name: '📌 Departamentos disponibles', value: departments.map((d, i) => `${i + 1}. ${d}`).join('\n') })
      .setFooter({ text: 'Sistema de departamentos' })
      .setTimestamp();

    const chunks = [];
    for (let i = 0; i < departments.length; i += 25) chunks.push(departments.slice(i, i + 25));

    const rows = chunks.map((chunk, chunkIndex) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`depselect:${chunkIndex}`)
          .setPlaceholder(
            chunks.length > 1
              ? `Departamentos ${chunkIndex * 25 + 1}–${chunkIndex * 25 + chunk.length}…`
              : 'Elegí tu departamento...',
          )
          .addOptions(chunk.map((dept) => ({ label: dept, value: dept, description: `Asignarme el rol de ${dept}`, emoji: '📍' }))),
      ),
    );

    return interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
  },
};

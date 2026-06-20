const { EmbedBuilder, StringSelectMenuBuilder, ActionRowBuilder } = require('discord.js');
const { getAllDepartments } = require('../utils/departmentStore');

module.exports = {
  name: 'dephelp',
  aliases: ['depayuda', 'departamentos'],
  help: {
    purpose: 'Muestra cómo funciona el sistema de departamentos.',
    category: '📍 Departamentos',
  },
  async execute(message, args) {
    const departments = getAllDepartments();

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📍 Sistema de Departamentos')
      .setDescription(
        `Solo los **urudasher** pueden asignar departamentos.\n\n` +
        `**¿Cómo funciona?**\n` +
        `1️⃣ Escribe el nombre de tu departamento en <#1502843326448013504>\n` +
        `2️⃣ El bot te asignará el rol automáticamente\n` +
        `3️⃣ Puedes cambiar de departamento cuando quieras\n` +
        `4️⃣ Solo puedes tener **1 departamento a la vez**\n\n` +
        `**Fuzzy Matching (typos permitidos):**\n` +
        `✅ "Mont" → Montevideo\n` +
        `✅ "monteivdeo" → Montevideo\n` +
        `✅ "mdvd" → Montevideo (aliased)\n` +
        `❌ Los turistas no pueden usar este sistema`
      )
      .addFields(
        {
          name: '📌 Departamentos disponibles',
          value: departments.map((d, i) => `${i + 1}. ${d}`).join('\n'),
          inline: false,
        },
        {
          name: '💡 Tips',
          value:
            '• El bot responde automáticamente en el canal\n' +
            '• Se elimina rol anterior al cambiar\n' +
            '• Tolerancia: hasta 2 caracteres de diferencia',
          inline: false,
        }
      )
      .setFooter({ text: 'Sistema de departamentos • v2.0' })
      .setTimestamp();

    // Dividir en chunks de 25 si hay más de 25 departamentos (límite de Discord)
    const chunks = [];
    for (let i = 0; i < departments.length; i += 25) {
      chunks.push(departments.slice(i, i + 25));
    }

    const rows = chunks.map((chunk, chunkIndex) =>
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`department_select_${chunkIndex}`)
          .setPlaceholder(
            chunks.length > 1
              ? `Departamentos ${chunkIndex * 25 + 1}–${chunkIndex * 25 + chunk.length}…`
              : 'Selecciona tu departamento...'
          )
          .addOptions(
            chunk.map(dept => ({
              label: dept,
              value: dept,
              description: `Asignarme el rol de ${dept}`,
              emoji: '📍',
            }))
          )
      )
    );

    return message.reply({
      embeds: [embed],
      components: rows,
    }).catch(() => null);
  },
};
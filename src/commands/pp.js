const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getPpSize, setPpSize, shouldReset, generateRandomSize } = require('../utils/ppStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pp')
    .setDescription('Mide el pp 🍆')
    .addUserOption(o =>
      o.setName('usuario')
        .setDescription('A quién medir (vacío = vos)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const objetivo = interaction.options.getUser('usuario') || interaction.user;

    let tamanio;
    let isNew = false;

    // Verificar si debe resetearse
    if (shouldReset(objetivo.id)) {
      tamanio = generateRandomSize();
      setPpSize(objetivo.id, tamanio);
      isNew = true;
    } else {
      const stored = getPpSize(objetivo.id);
      tamanio = stored ? stored.size : generateRandomSize();
      if (!stored) {
        setPpSize(objetivo.id, tamanio);
        isNew = true;
      }
    }

    const pp = '8' + '='.repeat(tamanio) + 'D';
    const status = isNew ? '✨ Medición' : '📊 Medición guardada';

    const embed = new EmbedBuilder()
      .setTitle('🍆 Medidor oficial')
      .setDescription(`**${objetivo.username}**\n\n${pp}\n\n**${tamanio} cm**`)
      .setColor(0x9B59B6)
      .setFooter({ text: status })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
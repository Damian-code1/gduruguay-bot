const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const respuestas = [
  '✅ Sí', '❌ No', '🤔 Tal vez', '🔮 Las señales apuntan a sí',
  '🔮 Las señales apuntan a no', '😂 Obvio que sí', '💀 Ni en pedo',
  '👀 Mejor no saberlo', '⚠️ Preguntá de nuevo', '🎱 Sin dudas',
  '🎱 Muy dudoso', '🌚 El universo prefiere no responder',
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pregunta')
    .setDescription('Hacele una pregunta al bot')
    .addStringOption(o =>
      o.setName('pregunta')
        .setDescription('¿Qué querés saber?')
        .setRequired(true)
    ),

  async execute(interaction) {
    const pregunta = interaction.options.getString('pregunta');
    const respuesta = respuestas[Math.floor(Math.random() * respuestas.length)];

    const embed = new EmbedBuilder()
      .setTitle('🔮 El bot ha hablado')
      .addFields(
        { name: 'Tu pregunta', value: pregunta },
        { name: 'Respuesta', value: respuesta }
      )
      .setColor(0x9B59B6)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
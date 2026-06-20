const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ship')
    .setDescription('¿Qué tan compatible es una pareja?')
    .addUserOption(o => o.setName('persona1').setDescription('Primera persona').setRequired(true))
    .addUserOption(o => o.setName('persona2').setDescription('Segunda persona').setRequired(true)),

  async execute(interaction) {
    const p1 = interaction.options.getUser('persona1');
    const p2 = interaction.options.getUser('persona2');

    if (p1.id === p2.id) {
      const embed = new EmbedBuilder()
        .setTitle('🫶 Ship-o-metro')
        .setDescription(`**${p1.username}** + **${p2.username}**\n\n❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️\n\n**100%** — Siempre suma tener amor propio.`)
        .setColor(0xFF69B4)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    if (p1.bot || p2.bot) {
      const embed = new EmbedBuilder()
        .setTitle('🤖 Ship-o-metro')
        .setDescription(`**${p1.username}** + **${p2.username}**\n\n🖤🖤🖤🖤🖤🖤🖤🖤🖤🖤\n\n**0%** — Amor irreal detectado: uno de los dos es un bot.`)
        .setColor(0xFF69B4)
        .setTimestamp();

      await interaction.reply({ embeds: [embed] });
      return;
    }

    const seed = (p1.id + p2.id).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const porcentaje = seed % 101;

    let emoji, descripcion;
    if (porcentaje >= 80) { emoji = '💞'; descripcion = 'Son el uno para el otro.'; }
    else if (porcentaje >= 60) { emoji = '💕'; descripcion = 'Tienen buena onda.'; }
    else if (porcentaje >= 40) { emoji = '🤝'; descripcion = 'Puede funcionar con esfuerzo.'; }
    else if (porcentaje >= 20) { emoji = '😬'; descripcion = 'Complicado...'; }
    else { emoji = '💔'; descripcion = 'Mejor ni intentarlo.'; }

    const barra = '❤️'.repeat(Math.floor(porcentaje / 10)) + '🖤'.repeat(10 - Math.floor(porcentaje / 10));

    const embed = new EmbedBuilder()
      .setTitle(`${emoji} Ship-o-metro`)
      .setDescription(`**${p1.username}** + **${p2.username}**\n\n${barra}\n\n**${porcentaje}%** — ${descripcion}`)
      .setColor(0xFF69B4)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
const { EmbedBuilder } = require('discord.js');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  name: 'nuke',
  aliases: ['nukeme', 'servernuke'],
  help: {
    purpose: 'Countdown fake para "borrar" el servidor (es una broma).',
    category: '🎮 Diversión',
  },

  async execute(message, args) {
    const embed = new EmbedBuilder()
      .setTitle('☢️ INICIANDO SECUENCIA DE DESTRUCCIÓN')
      .setColor(0xFF0000)
      .setDescription('**ADVERTENCIA CRÍTICA**\nEl servidor será destruido en...')
      .setTimestamp();

    const msg = await message.reply({ embeds: [embed] });

    // Countdown fake: 10, 9, 8...
    for (let i = 10; i >= 1; i--) {
      await wait(800);
      const countEmbed = new EmbedBuilder()
        .setTitle('☢️ SECUENCIA DE DESTRUCCIÓN EN PROGRESO')
        .setColor(0xFF0000)
        .setDescription(`**${i}**`.repeat(5))
        .addFields(
          { name: 'Estado', value: `ELIMINANDO ${i * 10}% DE DATOS...`, inline: false },
          { name: 'Tiempo restante', value: `${i} segundo${i !== 1 ? 's' : ''}`, inline: false }
        )
        .setTimestamp();

      await msg.edit({ embeds: [countEmbed] }).catch(() => null);
    }

    // Mensaje de "explotar"
    await wait(500);
    const explosionEmbed = new EmbedBuilder()
      .setTitle('💥 SERVIDOR DESTRUIDO 💥')
      .setColor(0xFF6B00)
      .setDescription('```\n████████████████████████\n████ NUKE COMPLETADO ████\n████████████████████████\n```')
      .setTimestamp();

    await msg.edit({ embeds: [explosionEmbed] }).catch(() => null);

    // Reveal de que fue broma
    await wait(1500);
    const jokeEmbed = new EmbedBuilder()
      .setTitle('😂 PSYCH! FUE UNA BROMA 😂')
      .setColor(0x2ECC71)
      .setDescription([
        '`Tu servidor sigue intacto, campeón.`',
        '',
        `Ejecutado por: <@${message.author.id}>`,
        `En servidor: **${message.guild.name}**`,
      ].join('\n'))
      .setFooter({ text: 'Gracias por tu atención' })
      .setTimestamp();

    return msg.edit({ embeds: [jokeEmbed] }).catch(() => null);
  },
};

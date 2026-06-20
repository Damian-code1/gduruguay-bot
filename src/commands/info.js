const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Muestra información del servidor y del bot'),

  async execute(interaction) {
    const guild = interaction.guild;

    const embed = new EmbedBuilder()
      .setTitle(guild.name)
      .setColor(0x5865F2)
      .setDescription('Bot hecho exclusivamente para GD Uruguay. No está pensado para uso general fuera de la comunidad.')
      .addFields(
        { name: 'Miembros', value: `${guild.memberCount}`, inline: true },
        { name: 'Creado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: true },
        { name: 'Uso', value: 'Exclusivo para GD Uruguay', inline: true },
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: 'GD Uruguay Bot' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
};
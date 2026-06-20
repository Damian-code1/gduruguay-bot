const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POINTERCRATE_API = 'https://pointercrate.com/api/v2';

module.exports = {
  help: {
    purpose: 'Busca demonios en la base de datos de Pointercrate.',
    category: '🎮 Diversión',
  },
  data: new SlashCommandBuilder()
    .setName('demons')
    .setDescription('Busca demonios en Pointercrate')
    .addStringOption(option =>
      option
        .setName('buscar')
        .setDescription('Filtrar por nombre (contiene)')
        .setRequired(false))
    .addIntegerOption(option =>
      option
        .setName('limit')
        .setDescription('Máximo de resultados (1-50)')
        .setMinValue(1)
        .setMaxValue(50)
        .setRequired(false))
    .addIntegerOption(option =>
      option
        .setName('level')
        .setDescription('Filtrar por ID de nivel')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('verifier')
        .setDescription('Filtrar por nombre de verificador')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const search = interaction.options.getString('buscar');
      const limit = interaction.options.getInteger('limit') || 10;
      const levelId = interaction.options.getInteger('level');
      const verifierName = interaction.options.getString('verifier');

      // Construir query string
      let query = `?limit=${limit}`;
      if (search) query += `&name_contains=${encodeURIComponent(search)}`;
      if (levelId) query += `&level_id=${levelId}`;
      if (verifierName) query += `&verifier_name=${encodeURIComponent(verifierName)}`;

      const url = `${POINTERCRATE_API}/demons/${query}`;
      const response = await fetch(url);

      if (!response.ok) {
        return await interaction.editReply('❌ No se pudo conectar con la API de Pointercrate.');
      }

      const data = await response.json();
      const demons = Array.isArray(data) ? data : data.data || [];

      if (demons.length === 0) {
        return await interaction.editReply('❌ No se encontraron demonios con esos filtros.');
      }

      // Crear embed con los demonios
      const embed = new EmbedBuilder()
        .setTitle('👹 Demonios de Pointercrate')
        .setColor(0xFF6B6B)
        .setDescription(`Mostrando **${demons.length}** resultado(s)`)
        .setFooter({ text: 'Datos de pointercrate.com' })
        .setTimestamp();

      // Agregar demonios al embed (máximo 25 fields)
      for (let i = 0; i < Math.min(demons.length, 25); i++) {
        const demon = demons[i];
        const demonName = demon.name || 'N/A';
        const requirement = demon.requirement || 'N/A';
        const verifier = demon.verifier?.name || 'N/A';
        const publisher = demon.publisher?.name || 'N/A';
        const levelId = demon.level_id || 'N/A';

        const value = [
          `🎯 **ID de Nivel**: \`${levelId}\``,
          `⚠️ **Requisito**: \`${requirement}%\``,
          `✅ **Verificador**: ${verifier}`,
          `📝 **Creador**: ${publisher}`,
        ].join('\n');

        embed.addFields({
          name: `${i + 1}. ${demonName}`,
          value,
          inline: false,
        });

        // Discord limita a 25 fields por embed
        if (i >= 24) break;
      }

      // Si hay más resultados, agregar nota
      if (demons.length > 25) {
        embed.addFields({
          name: '⚠️ Resultados limitados',
          value: `Se muestran 25 de ${demons.length} demonios. Usa filtros más específicos.`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error en comando demons:', error);
      await interaction.editReply('❌ Hubo un error al procesar tu solicitud.');
    }
  },
};

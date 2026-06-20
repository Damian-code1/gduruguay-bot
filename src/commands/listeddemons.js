const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POINTERCRATE_API = 'https://pointercrate.com/api/v2';

module.exports = {
  help: {
    purpose: 'Lista demonios rankeados del demons list de Pointercrate.',
    category: '🎮 Diversión',
  },
  data: new SlashCommandBuilder()
    .setName('listeddemons')
    .setDescription('Muestra demonios rankeados del demons list de Pointercrate')
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

      let query = `?limit=${limit}`;
      if (search) query += `&name_contains=${encodeURIComponent(search)}`;
      if (levelId) query += `&level_id=${levelId}`;
      if (verifierName) query += `&verifier_name=${encodeURIComponent(verifierName)}`;

      const url = `${POINTERCRATE_API}/demons/listed/${query}`;
      const response = await fetch(url);

      if (!response.ok) {
        return await interaction.editReply('❌ No se pudo conectar con la API de Pointercrate.');
      }

      const data = await response.json();
      const demons = Array.isArray(data) ? data : data.data || [];

      if (demons.length === 0) {
        return await interaction.editReply('❌ No se encontraron demonios rankeados con esos filtros.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Demonios Rankeados (Pointercrate)')
        .setColor(0xF1C40F)
        .setDescription(`Mostrando ${demons.length} resultado(s) del demons list`)
        .setFooter({ text: 'Datos de pointercrate.com' })
        .setTimestamp();

      for (let i = 0; i < Math.min(demons.length, 25); i++) {
        const demon = demons[i];
        const demonName = demon.name || 'N/A';
        const requirement = demon.requirement ?? 'N/A';
        const verifier = demon.verifier?.name || 'N/A';
        const publisher = demon.publisher?.name || 'N/A';
        const demonLevelId = demon.level_id ?? 'N/A';
        const position = demon.position ?? 'N/A';

        const value = [
          `Posición: #${position}`,
          `ID de nivel: ${demonLevelId}`,
          `Requisito: ${requirement}%`,
          `Verificador: ${verifier}`,
          `Creador: ${publisher}`,
        ].join('\n');

        embed.addFields({
          name: `${i + 1}. ${demonName}`,
          value,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error en comando listeddemons:', error);
      await interaction.editReply('❌ Hubo un error al procesar tu solicitud.');
    }
  },
};

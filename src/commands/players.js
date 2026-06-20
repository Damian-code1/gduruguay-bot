const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const POINTERCRATE_API = 'https://pointercrate.com/api/v1';

module.exports = {
  help: {
    purpose: 'Busca jugadores en la base de datos de Pointercrate.',
    category: '🎮 Diversión',
  },
  data: new SlashCommandBuilder()
    .setName('players')
    .setDescription('Busca jugadores en Pointercrate')
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
    .addStringOption(option =>
      option
        .setName('pais')
        .setDescription('Filtrar por código de país (ej: AR, US, MX)')
        .setRequired(false))
    .addBooleanOption(option =>
      option
        .setName('baneado')
        .setDescription('Mostrar solo jugadores baneados')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const search = interaction.options.getString('buscar');
      const limit = interaction.options.getInteger('limit') || 10;
      const country = interaction.options.getString('pais');
      const banned = interaction.options.getBoolean('baneado');

      // Verificar token
      const token = process.env.POINTERCRATE_TOKEN;
      if (!token) {
        return await interaction.editReply(
          '⚠️ Este comando requiere un token de Pointercrate configurado en `.env` (POINTERCRATE_TOKEN).\n' +
          'Contacta al administrador del bot para configurarlo.'
        );
      }

      // Construir query string
      let query = `?limit=${limit}`;
      if (search) query += `&name_contains=${encodeURIComponent(search)}`;
      if (country) query += `&nation=${encodeURIComponent(country)}`;
      if (banned !== null) query += `&banned=${banned}`;

      const url = `${POINTERCRATE_API}/players/${query}`;
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (response.status === 401) {
        return await interaction.editReply('❌ Token de Pointercrate inválido o expirado.');
      }

      if (!response.ok) {
        return await interaction.editReply(`❌ Error de API: ${response.status}`);
      }

      const data = await response.json();
      const players = Array.isArray(data) ? data : data.data || [];

      if (players.length === 0) {
        return await interaction.editReply('❌ No se encontraron jugadores con esos filtros.');
      }

      // Crear embed con los jugadores
      const embed = new EmbedBuilder()
        .setTitle('👥 Jugadores de Pointercrate')
        .setColor(0x5865F2)
        .setDescription(`Mostrando **${players.length}** resultado(s)${search ? ` (búsqueda: "${search}")` : ''}`)
        .setFooter({ text: 'Datos de pointercrate.com' })
        .setTimestamp();

      // Agregar jugadores al embed (máximo 25 fields)
      for (let i = 0; i < Math.min(players.length, 25); i++) {
        const player = players[i];
        const playerName = player.name || 'N/A';
        const playerId = player.id || 'N/A';
        const nation = player.nation?.name || player.nation?.iso_country_code || 'N/A';
        const score = player.score !== undefined ? player.score : 'N/A';
        const rank = player.rank !== undefined ? `#${player.rank}` : 'No clasificado';
        const banned = player.banned ? '🚫 Baneado' : '✅ Activo';

        const value = [
          `🎯 **ID**: \`${playerId}\``,
          `🏆 **Rango**: ${rank}`,
          `📊 **Score**: \`${score}\``,
          `🌍 **País**: ${nation}`,
          `📌 **Estado**: ${banned}`,
        ].join('\n');

        embed.addFields({
          name: `${i + 1}. ${playerName}`,
          value,
          inline: false,
        });

        if (i >= 24) break;
      }

      // Si hay más resultados, agregar nota
      if (players.length > 25) {
        embed.addFields({
          name: '⚠️ Resultados limitados',
          value: `Se muestran 25 de ${players.length} jugadores. Usa filtros más específicos.`,
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error en comando players:', error);
      await interaction.editReply('❌ Hubo un error al procesar tu solicitud.');
    }
  },
};

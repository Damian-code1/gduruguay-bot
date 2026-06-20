const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const AREDL_API = 'https://api.aredl.net/v2';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function resolveLevelIdByName(levelName) {
  const response = await fetch(`${AREDL_API}/api/aredl/levels`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`No se pudo consultar niveles de AREDL (${response.status})`);
  }

  const data = await response.json();
  const levels = Array.isArray(data) ? data : data.data || [];
  const normalizedQuery = levelName.trim().toLowerCase();

  const exact = levels.find(level => String(level.name || '').trim().toLowerCase() === normalizedQuery);
  if (exact) {
    return {
      levelId: exact.id,
      levelName: exact.name,
      matches: [exact],
    };
  }

  const partialMatches = levels
    .filter(level => String(level.name || '').toLowerCase().includes(normalizedQuery))
    .slice(0, 5);

  if (!partialMatches.length) {
    return { levelId: null, levelName: null, matches: [] };
  }

  return {
    levelId: partialMatches[0].id,
    levelName: partialMatches[0].name,
    matches: partialMatches,
  };
}

module.exports = {
  help: {
    purpose: 'Lista LDMs de niveles desde la API de AREDL.',
    category: '🎮 Diversión',
  },
  data: new SlashCommandBuilder()
    .setName('aredlldms')
    .setDescription('Lista LDMs de niveles en AREDL')
    .addIntegerOption(option =>
      option
        .setName('page')
        .setDescription('Página de resultados (default: 1)')
        .setMinValue(1)
        .setRequired(false))
    .addIntegerOption(option =>
      option
        .setName('per_page')
        .setDescription('Resultados por página (1-25, default: 10)')
        .setMinValue(1)
        .setMaxValue(25)
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('level_id')
        .setDescription('UUID interno del nivel original')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('level_name')
        .setDescription('Nombre del nivel (resuelve UUID automáticamente)')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('type')
        .setDescription('Tipo de LDM')
        .addChoices(
          { name: 'Bugfix', value: 'Bugfix' },
          { name: 'GlobedCopy', value: 'GlobedCopy' },
          { name: 'Ldm', value: 'Ldm' },
          { name: 'Other', value: 'Other' },
        )
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('status')
        .setDescription('Estado del LDM')
        .addChoices(
          { name: 'Published', value: 'Published' },
          { name: 'Allowed', value: 'Allowed' },
          { name: 'Banned', value: 'Banned' },
        )
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('description')
        .setDescription('Filtrar por descripción (texto parcial)')
        .setRequired(false))
    .addStringOption(option =>
      option
        .setName('added_by')
        .setDescription('UUID del moderador que agregó el LDM')
        .setRequired(false)),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const page = interaction.options.getInteger('page') || 1;
      const perPage = interaction.options.getInteger('per_page') || 10;
      let levelId = interaction.options.getString('level_id');
      const levelNameQuery = interaction.options.getString('level_name');
      const typeFilter = interaction.options.getString('type');
      const statusFilter = interaction.options.getString('status');
      const description = interaction.options.getString('description');
      const addedBy = interaction.options.getString('added_by');

      let resolvedLevelName = null;

      if (levelNameQuery && !levelId) {
        const resolved = await resolveLevelIdByName(levelNameQuery);

        if (!resolved.levelId) {
          return await interaction.editReply(`❌ No encontré ningún nivel con el nombre '${levelNameQuery}'.`);
        }

        levelId = resolved.levelId;
        resolvedLevelName = resolved.levelName;
      }

      if (levelId && !UUID_REGEX.test(levelId)) {
        return await interaction.editReply('❌ level_id no es un UUID válido.');
      }

      if (addedBy && !UUID_REGEX.test(addedBy)) {
        return await interaction.editReply('❌ added_by no es un UUID válido.');
      }

      const params = new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      });

      if (levelId) params.set('level_id', levelId);
      if (typeFilter) params.set('type_filter', typeFilter);
      if (statusFilter) params.set('status_filter', statusFilter);
      if (description) params.set('description', description);
      if (addedBy) params.set('added_by', addedBy);

      const url = `${AREDL_API}/api/aredl/levels/ldms?${params.toString()}`;
      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        return await interaction.editReply(`❌ Error de API AREDL: ${response.status}`);
      }

      const data = await response.json();
      const ldms = Array.isArray(data) ? data : data.data || [];

      if (!ldms.length) {
        return await interaction.editReply('❌ No se encontraron LDMs con esos filtros.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🛠️ AREDL - Level LDMs')
        .setColor(0x1ABC9C)
        .setDescription(`Mostrando **${ldms.length}** resultado(s) • página ${page}`)
        .setFooter({ text: 'Datos de api.aredl.net' })
        .setTimestamp();

      if (levelNameQuery && levelId) {
        embed.addFields({
          name: '🎯 Nivel resuelto',
          value: `${resolvedLevelName || levelNameQuery}\nUUID: \`${levelId}\``,
          inline: false,
        });
      }

      for (let i = 0; i < Math.min(ldms.length, 25); i++) {
        const entry = ldms[i];
        const entryId = entry.id || 'N/A';
        const entryLevelId = entry.level_id || 'N/A';
        const ldmId = entry.ldm_id ?? 'N/A';
        const idType = entry.id_type || 'N/A';
        const status = entry.status || 'N/A';
        const addedById = entry.added_by || 'N/A';
        const createdAt = entry.created_at ? `<t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>` : 'N/A';
        const descriptionText = entry.description || 'Sin descripción';

        embed.addFields({
          name: `${i + 1}. LDM #${ldmId} • ${status}`,
          value: [
            `**Tipo:** ${idType}`,
            `**Level ID:** \`${entryLevelId}\``,
            `**Entry ID:** \`${entryId}\``,
            `**Added by:** \`${addedById}\``,
            `**Descripción:** ${descriptionText}`,
            `**Creado:** ${createdAt}`,
          ].join('\n').slice(0, 1024),
          inline: false,
        });
      }

      if (ldms.length >= 25) {
        embed.addFields({
          name: '⚠️ Resultados limitados',
          value: 'Se muestran hasta 25 resultados por mensaje. Usa más filtros para afinar.',
          inline: false,
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error en comando aredlldms:', error);
      await interaction.editReply('❌ Hubo un error al consultar los LDMs de AREDL.');
    }
  },
};

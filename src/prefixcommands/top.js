const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getGuildConfig, getLeaderboard } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');

const TOP_PAGE_SIZE = 10;
const TOP_COLLECTOR_MS = 120_000;

function buildTopEmbed(ranking, config, currentPage, totalPages, totalUsers) {
  const offset = (currentPage - 1) * TOP_PAGE_SIZE;
  const lines = ranking.map((entry, index) => `${offset + index + 1}. <@${entry.userId}> — ${formatCurrency(entry.total, config)} (mano ${formatCurrency(entry.wallet, config)} | banco ${formatCurrency(entry.bank, config)})`);

  return new EmbedBuilder()
    .setTitle('🏆 Top Economía')
    .setColor(0xF1C40F)
    .setDescription(lines.join('\n'))
    .setFooter({ text: `Página ${currentPage}/${totalPages} • Mostrando ${ranking.length} de ${totalUsers}` })
    .setTimestamp();
}

function buildTopButtons(currentPage, totalPages, disableAll = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('top_first')
      .setLabel('⏮️ Primera')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || currentPage <= 1),
    new ButtonBuilder()
      .setCustomId('top_prev')
      .setLabel('⬅️ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || currentPage <= 1),
    new ButtonBuilder()
      .setCustomId('top_next')
      .setLabel('Siguiente ➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || currentPage >= totalPages),
    new ButtonBuilder()
      .setCustomId('top_last')
      .setLabel('⏭️ Última')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disableAll || currentPage >= totalPages),
  );
}

module.exports = {
  name: 'top',
  aliases: ['lb'],
  help: {
    purpose: 'Muestra el ranking de economía del servidor.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const pageArg = Number(args[0]);
    const requestedPage = Number.isFinite(pageArg) ? Math.max(1, Math.floor(pageArg)) : 1;

    const config = getGuildConfig(message.guild.id);
    const allRanking = getLeaderboard(message.guild.id, Number.MAX_SAFE_INTEGER, 0);
    const totalUsers = allRanking.length;
    const totalPages = Math.max(1, Math.ceil(totalUsers / TOP_PAGE_SIZE));
    let currentPage = Math.min(requestedPage, totalPages);

    const getPageRanking = page => {
      const offset = (page - 1) * TOP_PAGE_SIZE;
      return allRanking.slice(offset, offset + TOP_PAGE_SIZE);
    };

    const ranking = getPageRanking(currentPage);

    if (!ranking.length) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('🏆 Top Economía').setColor(0x5865F2).setDescription('Todavía no hay datos de economía.')],
      });
    }

    const response = await message.reply({
      embeds: [buildTopEmbed(ranking, config, currentPage, totalPages, totalUsers)],
      components: totalPages > 1 ? [buildTopButtons(currentPage, totalPages)] : [],
    });

    if (totalPages <= 1) return;

    const collector = response.createMessageComponentCollector({
      time: TOP_COLLECTOR_MS,
      filter: interaction => ['top_first', 'top_prev', 'top_next', 'top_last'].includes(interaction.customId),
    });

    collector.on('collect', async interaction => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: 'Solo quien ejecutó el comando puede cambiar de página.',
          ephemeral: true,
        }).catch(() => null);
        return;
      }

      if (interaction.customId === 'top_first') {
        currentPage = 1;
      }

      if (interaction.customId === 'top_prev' && currentPage > 1) {
        currentPage -= 1;
      }

      if (interaction.customId === 'top_next' && currentPage < totalPages) {
        currentPage += 1;
      }

      if (interaction.customId === 'top_last') {
        currentPage = totalPages;
      }

      const nextRanking = getPageRanking(currentPage);
      await interaction.update({
        embeds: [buildTopEmbed(nextRanking, config, currentPage, totalPages, totalUsers)],
        components: [buildTopButtons(currentPage, totalPages)],
      }).catch(() => null);
    });

    collector.on('end', async () => {
      await response.edit({
        components: [buildTopButtons(currentPage, totalPages, true)],
      }).catch(() => null);
    });
  },
};

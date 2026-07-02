'use strict';

const {
  MessageFlags,
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const {
  PAGE_SIZE,
  EMOJI,
  formatNumber,
  pill,
  truncate,
  getLevelId,
  getLevelName,
  getLevelAuthor,
  getDifficultyLabel,
  getDifficultyThumbnail,
  getLength,
  getCoinsText,
  getSongLine,
  getAredlPositionLine,
} = require('./levelSearchData');

const COMPONENTS_V2_EPHEMERAL = MessageFlags.Ephemeral | MessageFlags.IsComponentsV2;

function buildLevelCardText(level) {
  const title = `▶️ **${getLevelName(level)}** by ${getLevelAuthor(level)}`;
  const positionLine = getAredlPositionLine(level);
  const downloads = `${EMOJI.downloads} ${pill(formatNumber(level?.downloads ?? level?.downloadCount ?? 0))}`;
  const likes = `${EMOJI.likes} ${pill(formatNumber(level?.likes ?? level?.likeCount ?? 0))}`;
  const length = `${EMOJI.length} ${pill(getLength(level))}`;
  const song = getSongLine(level);

  return [title, positionLine, downloads, likes, length, song ? `${EMOJI.song} ${song}` : null]
    .filter(Boolean)
    .join('\n');
}

function buildLevelStatsLines(level) {
  return [
    `${EMOJI.downloads} ${pill(formatNumber(level?.downloads ?? level?.downloadCount ?? 0))}`,
    `${EMOJI.likes} ${pill(formatNumber(level?.likes ?? level?.likeCount ?? 0))}`,
    `${EMOJI.length} ${pill(getLength(level))}`,
    `${EMOJI.stars} ${pill(`${level?.stars ?? level?.starCount ?? 0}`)}`,
    `${EMOJI.coins} ${getCoinsText(level)}`,
  ];
}

/** Lista paginada de resultados (Container sin accent_color -> sin barra de color). */
function buildListContainer(session) {
  const pageLevels = session.currentPageResults.slice(0, PAGE_SIZE);
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `# 🔎 Resultados para "${truncate(session.query, 40)}"\n-# Página ${session.currentPage + 1} de ${session.totalPages}`,
    ),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  pageLevels.forEach((level, idx) => {
    const section = new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(buildLevelCardText(level)))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(getDifficultyThumbnail(level)));
    container.addSectionComponents(section);

    if (idx < pageLevels.length - 1) {
      container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    }
  });

  return container;
}

function buildListButtons(session) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`lvlsearch:${session.id}:first`)
      .setEmoji('⏮️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.currentPage <= 0),
    new ButtonBuilder()
      .setCustomId(`lvlsearch:${session.id}:prev`)
      .setEmoji('⬅️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(session.currentPage <= 0),
    new ButtonBuilder()
      .setCustomId(`lvlsearch:${session.id}:next`)
      .setEmoji('➡️')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(session.currentPage >= session.totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`lvlsearch:${session.id}:last`)
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(session.currentPage >= session.totalPages - 1),
    new ButtonBuilder().setCustomId(`lvlsearch:${session.id}:close`).setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
}

function buildListSelect(session) {
  const pageLevels = session.currentPageResults.slice(0, PAGE_SIZE);
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lvlsearch:${session.id}:select`)
    .setPlaceholder('Elegí un nivel de esta página')
    .addOptions(
      pageLevels.map((level, idx) => ({
        label: `${idx + 1}. ${truncate(getLevelName(level), 70)}`,
        description: `Autor: ${truncate(getLevelAuthor(level), 80)} · ID: ${getLevelId(level)}`,
        value: String(getLevelId(level)),
      })),
    );
  return new ActionRowBuilder().addComponents(select);
}

function buildListPayload(session) {
  const components = [buildListContainer(session), buildListButtons(session)];
  if (session.currentPageResults.length) components.push(buildListSelect(session));

  return { flags: COMPONENTS_V2_EPHEMERAL, components };
}

/** Vista detallada de un nivel. */
function buildDetailContainer(session, level) {
  const positionLine = getAredlPositionLine(level);
  const container = new ContainerBuilder();

  const headerText = new TextDisplayBuilder().setContent(
    `# ${getLevelName(level)}\n` +
      `${EMOJI.author} ${getLevelAuthor(level)}\n` +
      `**🎯 ${getDifficultyLabel(level)}**` +
      (positionLine ? `\n${positionLine}` : ''),
  );
  const headerSection = new SectionBuilder()
    .addTextDisplayComponents(headerText)
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(getDifficultyThumbnail(level)));
  container.addSectionComponents(headerSection);

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(buildLevelStatsLines(level).join('\n')),
  );
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`${EMOJI.song} ${getSongLine(level) || 'Sin información'}`),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`-# 🆔 ${getLevelId(level)} · Página ${session.currentPage + 1}`),
  );

  return container;
}

function buildDetailButtons(session) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`lvlsearch:${session.id}:back`).setLabel('Volver a la lista').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`lvlsearch:${session.id}:copyid`).setLabel('Copiar ID').setEmoji('🆔').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`lvlsearch:${session.id}:close`).setLabel('Cerrar').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
}

function buildDetailPayload(session, level) {
  return {
    flags: COMPONENTS_V2_EPHEMERAL,
    components: [buildDetailContainer(session, level), buildDetailButtons(session)],
  };
}

function buildClosedPayload(session) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# 🔎 Búsqueda cerrada\n\nLa búsqueda de "${truncate(session.query, 40)}" fue cerrada.`),
  );
  return { flags: COMPONENTS_V2_EPHEMERAL, components: [container] };
}

function buildEmptyPayload(query) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# 🔎 Sin resultados\n\nNo se encontraron niveles para "${truncate(query, 40)}".`),
  );
  return { flags: COMPONENTS_V2_EPHEMERAL, components: [container] };
}

function buildErrorPayload(message) {
  const container = new ContainerBuilder().addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# ❌ Error\n\n${truncate(message, 300)}`),
  );
  return { flags: COMPONENTS_V2_EPHEMERAL, components: [container] };
}

module.exports = {
  COMPONENTS_V2_EPHEMERAL,
  buildListPayload,
  buildDetailPayload,
  buildClosedPayload,
  buildEmptyPayload,
  buildErrorPayload,
};

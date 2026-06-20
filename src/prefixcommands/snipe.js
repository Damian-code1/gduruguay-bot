const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { getSnipes } = require('../utils/snipeStore');

const SNIPES_PER_PAGE = 5;

function truncate(text, max = 1000) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function formatEmbedSummary(embeds = []) {
  if (!embeds.length) return null;

  const lines = [];
  for (const embed of embeds.slice(0, 4)) {
    const head = embed.title || embed.authorName || embed.providerName || `Embed ${embed.index || ''}`.trim();
    const details = [
      embed.description ? truncate(embed.description, 120) : null,
      Array.isArray(embed.fields) && embed.fields.length ? truncate(embed.fields.join(' • '), 120) : null,
    ].filter(Boolean).join(' • ');

    lines.push(`• ${truncate(head, 70)}${details ? ` — ${details}` : ''}`);
  }

  if (embeds.length > 4) {
    lines.push(`• ...y ${embeds.length - 4} embed(s) más`);
  }

  return truncate(lines.join('\n'), 1024);
}

function formatLinks(links = [], max = 8) {
  const unique = [...new Set((links || []).filter(Boolean))];
  if (!unique.length) return null;
  const shown = unique.slice(0, max).join('\n');
  if (unique.length > max) {
    return `${shown}\n...y ${unique.length - max} más`;
  }
  return shown;
}

function isGifUrl(url = '') {
  return /\.gif(\?.*)?$/i.test(url) || /gifv(\?.*)?$/i.test(url);
}

function buildChannelJumpUrl(guildId, channelId) {
  if (!guildId || !channelId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}`;
}

function buildMessageJumpUrl(guildId, channelId, messageId) {
  if (!guildId || !channelId || !messageId) return null;
  return `https://discord.com/channels/${guildId}/${channelId}/${messageId}`;
}

function buildNavigationRow(currentPage, totalPages) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('snipe_prev')
      .setLabel('⬅️ Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage <= 0),
    new ButtonBuilder()
      .setCustomId('snipe_next')
      .setLabel('Siguiente ➡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  );
}

function buildSnipeEntry(snipe, absoluteIndex) {
  const mediaCandidates = [
    ...(snipe.imageUrls || []),
    ...(snipe.attachmentUrls || []),
    ...(snipe.embedLinks || []),
    snipe.imageUrl,
    snipe.attachmentUrl,
  ].filter(Boolean);
  const gifLinks = [...new Set(mediaCandidates.filter(isGifUrl))];

  const parts = [
    `📝 ${truncate(snipe.rawContent || snipe.content || '(sin texto)', 180)}`,
    `👤 ${snipe.authorId ? `<@${snipe.authorId}>` : snipe.authorTag}`,
    `📍 <#${snipe.channelId}>`,
    `🕒 <t:${Math.floor(snipe.deletedAt / 1000)}:R>`,
  ];

  const channelJump = buildChannelJumpUrl(snipe.guildId, snipe.channelId);
  const messageJump = buildMessageJumpUrl(snipe.guildId, snipe.channelId, snipe.messageId);
  if (channelJump && messageJump) {
    parts.push(`🔗 [Ir al canal](${channelJump}) • [Ir al punto](${messageJump})`);
  } else if (channelJump) {
    parts.push(`🔗 [Ir al canal](${channelJump})`);
  }

  const embedsAmount = snipe.embedCount || (Array.isArray(snipe.embeds) ? snipe.embeds.length : 0);
  const attachmentsAmount = Array.isArray(snipe.attachmentUrls) ? snipe.attachmentUrls.length : (snipe.attachmentUrl ? 1 : 0);
  const stickersAmount = Array.isArray(snipe.stickerUrls) ? snipe.stickerUrls.length : 0;
  const mediaSummary = [];
  if (embedsAmount) mediaSummary.push(`embeds: ${embedsAmount}`);
  if (attachmentsAmount) mediaSummary.push(`adjuntos: ${attachmentsAmount}`);
  if (stickersAmount) mediaSummary.push(`stickers: ${stickersAmount}`);
  if (gifLinks.length) mediaSummary.push(`gif: ${gifLinks.length}`);
  if (mediaSummary.length) parts.push(`📦 ${mediaSummary.join(' • ')}`);

  return {
    field: {
      name: `#${absoluteIndex}`,
      value: truncate(parts.join('\n'), 1024),
      inline: false,
    },
    gifLinks: gifLinks.map(link => `#${absoluteIndex}: ${link}`),
  };
}

function buildSnipePagePayload(snipes, pageIndex) {
  const totalPages = Math.max(1, Math.ceil(snipes.length / SNIPES_PER_PAGE));
  const safePageIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const start = safePageIndex * SNIPES_PER_PAGE;
  const end = Math.min(start + SNIPES_PER_PAGE, snipes.length);
  const pageItems = snipes.slice(start, end);

  const embed = new EmbedBuilder()
    .setTitle('🕵️ Snipes del canal')
    .setColor(0x5865F2)
    .setDescription(`Mostrando **${start + 1}-${end}** de **${snipes.length}** snipes guardados.`)
    .setFooter({ text: `Página ${safePageIndex + 1}/${totalPages} • ${SNIPES_PER_PAGE} por página` })
    .setTimestamp(Date.now());

  const gifLines = [];
  for (let i = 0; i < pageItems.length; i += 1) {
    const absoluteIndex = start + i + 1;
    const entry = buildSnipeEntry(pageItems[i], absoluteIndex);
    embed.addFields(entry.field);
    gifLines.push(...entry.gifLinks);
  }

  return {
    content: gifLines.length
      ? `🎞️ GIFs de esta página (se envían fuera del embed para que reproduzcan):\n${truncate(gifLines.join('\n'), 1800)}`
      : '',
    embeds: [embed],
    components: totalPages > 1 ? [buildNavigationRow(safePageIndex, totalPages)] : [],
  };
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -snipe')
    .setDescription('Muestra mensajes eliminados recientemente en el canal actual.')
    .addFields(
      { name: 'Uso', value: '`-snipe [página]`' },
      { name: 'Navegación', value: 'Usa los botones para pasar de página' },
      { name: 'Detalle', value: `Se muestran ${SNIPES_PER_PAGE} snipes por página` },
      { name: 'Ejemplo', value: '`-snipe` o `-snipe 2`' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'snipe',
  help: {
    purpose: 'Muestra mensajes eliminados recientemente en el canal actual.',
    category: '📊 Información',
  },
  async execute(message, args) {
    const pageRequested = parseInt(args[0], 10) || 1;

    if (isNaN(pageRequested) || pageRequested < 1) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const snipes = getSnipes(message.channel.id);
    if (!snipes.length) {
      return message.reply('📭 No hay mensajes eliminados para mostrar en este canal.');
    }

    const totalPages = Math.max(1, Math.ceil(snipes.length / SNIPES_PER_PAGE));
    let pageIndex = Math.min(pageRequested - 1, totalPages - 1);
    const sentMessage = await message.reply(buildSnipePagePayload(snipes, pageIndex));

    if (totalPages <= 1) {
      return;
    }

    const collector = sentMessage.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async (interaction) => {
      if (interaction.user.id !== message.author.id) {
        await interaction.reply({
          content: 'Solo quien usó `-snipe` puede cambiar de página.',
          ephemeral: true,
        }).catch(() => null);
        return;
      }

      const currentSnipes = getSnipes(message.channel.id);
      if (!currentSnipes.length) {
        collector.stop('empty');
        await interaction.update({
          content: '📭 Ya no hay mensajes eliminados guardados en este canal.',
          embeds: [],
          components: [],
        }).catch(() => null);
        return;
      }

      if (interaction.customId === 'snipe_prev') {
        pageIndex = Math.max(0, pageIndex - 1);
      } else if (interaction.customId === 'snipe_next') {
        const currentTotalPages = Math.max(1, Math.ceil(currentSnipes.length / SNIPES_PER_PAGE));
        pageIndex = Math.min(currentTotalPages - 1, pageIndex + 1);
      }

      const currentTotalPages = Math.max(1, Math.ceil(currentSnipes.length / SNIPES_PER_PAGE));
      pageIndex = Math.min(pageIndex, currentTotalPages - 1);
      await interaction.update(buildSnipePagePayload(currentSnipes, pageIndex)).catch(() => null);
    });

    collector.on('end', async () => {
      const lastSnipes = getSnipes(message.channel.id);
      if (!lastSnipes.length) {
        await sentMessage.edit({ components: [] }).catch(() => null);
        return;
      }

      const finalTotalPages = Math.max(1, Math.ceil(lastSnipes.length / SNIPES_PER_PAGE));
      const safePageIndex = Math.min(pageIndex, finalTotalPages - 1);

      const finalPayload = buildSnipePagePayload(lastSnipes, safePageIndex);
      await sentMessage.edit({
        ...finalPayload,
        components: [],
      }).catch(() => null);
    });
  },
};

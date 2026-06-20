const fs = require('fs');
const path = require('path');

const MAX_SNIPES_PER_CHANNEL = 20;
const STORE_PATH = path.join(__dirname, '../snipes.json');

const snipesByChannel = new Map();

function ensureStoreFile() {
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify({ channels: {} }, null, 2));
  }
}

function normalizeSnipe(snipe, channelId) {
  return {
    authorId: snipe.authorId || null,
    authorTag: snipe.authorTag || 'Usuario desconocido',
    guildId: snipe.guildId || null,
    messageId: snipe.messageId || null,
    content: snipe.content || '(sin texto)',
    rawContent: snipe.rawContent || null,
    channelId: snipe.channelId || channelId,
    createdAt: Number(snipe.createdAt) || Date.now(),
    deletedAt: Number(snipe.deletedAt) || Date.now(),
    imageUrl: snipe.imageUrl || null,
    imageUrls: Array.isArray(snipe.imageUrls) ? snipe.imageUrls.filter(Boolean) : [],
    attachmentUrl: snipe.attachmentUrl || null,
    attachmentUrls: Array.isArray(snipe.attachmentUrls) ? snipe.attachmentUrls.filter(Boolean) : [],
    stickerUrls: Array.isArray(snipe.stickerUrls) ? snipe.stickerUrls.filter(Boolean) : [],
    embeds: Array.isArray(snipe.embeds) ? snipe.embeds : [],
    embedCount: Number.isFinite(snipe.embedCount)
      ? snipe.embedCount
      : (Array.isArray(snipe.embeds) ? snipe.embeds.length : 0),
    embedLinks: Array.isArray(snipe.embedLinks) ? snipe.embedLinks.filter(Boolean) : [],
  };
}

function loadStore() {
  try {
    ensureStoreFile();
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const data = JSON.parse(raw);
    const channels = data && typeof data === 'object' ? data.channels : null;
    if (!channels || typeof channels !== 'object') return;

    for (const [channelId, list] of Object.entries(channels)) {
      if (!Array.isArray(list) || !channelId) continue;
      const normalized = list
        .slice(0, MAX_SNIPES_PER_CHANNEL)
        .map(item => normalizeSnipe(item, channelId));

      if (normalized.length) {
        snipesByChannel.set(channelId, normalized);
      }
    }
  } catch {
    snipesByChannel.clear();
  }
}

function persistStore() {
  ensureStoreFile();
  const channels = {};
  for (const [channelId, list] of snipesByChannel.entries()) {
    channels[channelId] = list.slice(0, MAX_SNIPES_PER_CHANNEL);
  }
  fs.writeFileSync(STORE_PATH, JSON.stringify({ channels }, null, 2));
}

function isImageUrl(url = '') {
  return /\.(png|jpe?g|gif|webp|bmp|tiff|svg)(\?.*)?$/i.test(url);
}

function trimText(text, max = 250) {
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function addSnipe(message) {
  if (!message || !message.channelId) return;

  const channelId = message.channelId;
  const current = snipesByChannel.get(channelId) || [];

  const content = (message.content || '').trim();
  const attachments = Array.from(message.attachments?.values?.() || []);
  const stickers = Array.from(message.stickers?.values?.() || []);
  const embeds = (message.embeds || []).map((embed, index) => {
    const fields = Array.isArray(embed.fields)
      ? embed.fields.slice(0, 3).map(field => `${trimText(field.name, 80)}: ${trimText(field.value, 120)}`)
      : [];

    return {
      index: index + 1,
      title: embed.title || null,
      description: embed.description || null,
      url: embed.url || null,
      type: embed.type || null,
      imageUrl: embed.image?.url || null,
      thumbnailUrl: embed.thumbnail?.url || null,
      videoUrl: embed.video?.url || null,
      authorName: embed.author?.name || null,
      providerName: embed.provider?.name || null,
      fields,
    };
  });

  const imageUrls = [];
  for (const attachment of attachments) {
    if (attachment.contentType?.startsWith('image/') || isImageUrl(attachment.url || '')) {
      imageUrls.push(attachment.proxyURL || attachment.url);
    }
  }

  for (const embed of embeds) {
    if (embed.imageUrl) imageUrls.push(embed.imageUrl);
    if (embed.thumbnailUrl) imageUrls.push(embed.thumbnailUrl);
    if (embed.videoUrl && isImageUrl(embed.videoUrl)) imageUrls.push(embed.videoUrl);
    if (embed.url && isImageUrl(embed.url)) imageUrls.push(embed.url);
  }

  for (const sticker of stickers) {
    if (sticker.url) imageUrls.push(sticker.url);
  }

  const uniqueImageUrls = [...new Set(imageUrls.filter(Boolean))];

  const attachmentUrls = attachments
    .map(attachment => attachment.proxyURL || attachment.url)
    .filter(Boolean);

  const stickerUrls = stickers
    .map(sticker => sticker.url)
    .filter(Boolean);

  const embedLinks = embeds
    .flatMap(embed => [embed.url, embed.imageUrl, embed.thumbnailUrl, embed.videoUrl])
    .filter(Boolean);
  const uniqueEmbedLinks = [...new Set(embedLinks)];

  const displayContent =
    content
    || (embeds.length ? '(mensaje con embed/sin texto)' : '')
    || (attachments.length ? '(mensaje con adjunto/sin texto)' : '')
    || (stickers.length ? '(mensaje con sticker/sin texto)' : '')
    || '(sin texto)';

  current.unshift({
    authorId: message.author?.id || null,
    authorTag: message.author?.tag || 'Usuario desconocido',
    guildId: message.guildId || null,
    messageId: message.id || null,
    content: displayContent,
    rawContent: content || null,
    channelId,
    createdAt: message.createdTimestamp || Date.now(),
    deletedAt: Date.now(),
    imageUrl: uniqueImageUrls[0] || null,
    imageUrls: uniqueImageUrls,
    attachmentUrl: attachmentUrls[0] || null,
    attachmentUrls,
    stickerUrls,
    embeds,
    embedCount: embeds.length,
    embedLinks: uniqueEmbedLinks,
  });

  if (current.length > MAX_SNIPES_PER_CHANNEL) {
    current.length = MAX_SNIPES_PER_CHANNEL;
  }

  snipesByChannel.set(channelId, current);
  persistStore();
}

function getSnipes(channelId) {
  return snipesByChannel.get(channelId) || [];
}

function clearSnipes(channelId) {
  if (!snipesByChannel.has(channelId)) return 0;
  const amount = snipesByChannel.get(channelId).length;
  snipesByChannel.delete(channelId);
  persistStore();
  return amount;
}

loadStore();

module.exports = {
  addSnipe,
  getSnipes,
  clearSnipes,
};

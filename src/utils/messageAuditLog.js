const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('./staffRolesStore');

const COMPONENTS_V2_FLAG = MessageFlags?.IsComponentsV2 ?? 32768;

function escapeMentions(value) {
  return String(value || '')
    .replace(/@everyone/gi, '@\u200beveryone')
    .replace(/@here/gi, '@\u200bhere')
    .replace(/<@&?(\d+)>/g, '<@\u200b$1>')
    .replace(/<#(\d+)>/g, '<#\u200b$1>');
}

function trimText(text, max = 900) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function buildContainer({ title, summary = null, fields = [], footer = null, thumbnailUrl = null, thumbnailLabel = null }) {
  const components = [];

  components.push({ type: 10, content: title.startsWith('#') ? title : `# ${title}` });

  if (thumbnailUrl || summary) {
    components.push({
      type: 9,
      components: [
        {
          type: 10,
          content: summary ? escapeMentions(summary) : (thumbnailLabel ? escapeMentions(thumbnailLabel) : '\u200B'),
        },
      ],
      ...(thumbnailUrl
        ? {
            accessory: {
              type: 11,
              media: { type: 1, url: thumbnailUrl },
              spoiler: false,
            },
          }
        : {}),
    });
  }

  if (fields.length) {
    components.push({ type: 14 });
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i];
      if (i > 0) components.push({ type: 14 });
      components.push({ type: 10, content: `### ${field.name}\n${field.value}` });
    }
  }

  if (footer) {
    components.push({ type: 14 });
    components.push({ type: 10, content: `> ${footer}` });
  }

  return {
    type: 17,
    accent_color: null,
    components,
  };
}

function buildV2LogPayload({ title, summary = null, fields = [], footer = 'GD Uruguay Bot', thumbnailUrl = null, thumbnailLabel = null }) {
  return {
    flags: COMPONENTS_V2_FLAG,
    allowedMentions: { parse: [] },
    components: [buildContainer({ title, summary, fields, footer, thumbnailUrl, thumbnailLabel })],
  };
}

function isPingableMember(member, channel, guildId) {
  if (!member || !channel?.permissionsFor) return false;
  if (isStaff(member, guildId)) return false;

  const canViewChannel = channel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel);
  return !canViewChannel;
}

function formatAuthorLabel(member, userId, shouldPing) {
  if (!userId) return 'Usuario desconocido';
  if (shouldPing) return `<@${userId}>`;
  return escapeMentions(member?.user?.tag || member?.displayName || `Usuario ${userId}`);
}

function getAvatarUrl(member, author, userId) {
  return member?.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || member?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || author?.displayAvatarURL?.({ extension: 'png', size: 128 })
    || (userId ? `https://cdn.discordapp.com/avatars/${userId}/${author?.avatar || member?.user?.avatar || member?.avatar || ''}.png?size=128` : null)
    || null;
}

function formatContent(value) {
  const text = trimText(value, 900);
  return text ? escapeMentions(text) : '(sin texto)';
}

function buildMessageDeleteLog({ guild, channel, message, member }) {
  const shouldPing = isPingableMember(member, channel, guild.id);
  const authorLabel = formatAuthorLabel(member, message.author?.id, shouldPing);
  const content = formatContent(message.content);
  const attachments = Array.from(message.attachments?.values?.() || []);
  const embeds = Array.isArray(message.embeds) ? message.embeds.length : 0;
  const stickers = Array.from(message.stickers?.values?.() || []);

  return buildV2LogPayload({
    title: '🗑️ Mensaje eliminado',
    summary: `**Autor:** ${authorLabel}`,
    fields: [
      { name: 'Info', value: `Canal: <#${channel.id}> · [Abrir mensaje](https://discord.com/channels/${guild.id}/${channel.id}/${message.id})` },
      { name: 'Contenido', value: trimText(content, 220) },
      {
        name: 'Adjuntos',
        value: attachments.length
          ? `${attachments.length} archivo(s)`
          : 'Ninguno',
      },
      {
        name: 'Embeds / Stickers',
        value: `${embeds} embed(s) · ${stickers.length} sticker(s)`,
      },
    ],
    footer: `Servidor: ${escapeMentions(guild.name)}`,
    thumbnailUrl: getAvatarUrl(member, message.author, message.author?.id),
    thumbnailLabel: `Autor: ${member?.user?.tag || message.author?.tag || 'Usuario desconocido'}`,
  });
}

function buildMessageUpdateLog({ guild, channel, oldMessage, newMessage, member }) {
  const shouldPing = isPingableMember(member, channel, guild.id);
  const authorLabel = formatAuthorLabel(member, newMessage.author?.id || oldMessage.author?.id, shouldPing);
  const beforeContent = formatContent(oldMessage.content);
  const afterContent = formatContent(newMessage.content);
  const oldAttachments = Array.from(oldMessage.attachments?.values?.() || []);
  const newAttachments = Array.from(newMessage.attachments?.values?.() || []);
  const oldEmbeds = Array.isArray(oldMessage.embeds) ? oldMessage.embeds.length : 0;
  const newEmbeds = Array.isArray(newMessage.embeds) ? newMessage.embeds.length : 0;

  return buildV2LogPayload({
    title: '✏️ Mensaje editado',
    summary: `**Autor:** ${authorLabel}`,
    fields: [
      { name: 'Info', value: `Canal: <#${channel.id}> · [Abrir mensaje](https://discord.com/channels/${guild.id}/${channel.id}/${newMessage.id})` },
      { name: 'Antes', value: trimText(beforeContent, 220) },
      { name: 'Después', value: trimText(afterContent, 220) },
      {
        name: 'Adjuntos / Embeds',
        value: `Adjuntos: ${oldAttachments.length} → ${newAttachments.length}\nEmbeds: ${oldEmbeds} → ${newEmbeds}`,
      },
    ],
    footer: `Servidor: ${escapeMentions(guild.name)}`,
    thumbnailUrl: getAvatarUrl(member, newMessage.author || oldMessage.author, newMessage.author?.id || oldMessage.author?.id),
    thumbnailLabel: `Autor: ${member?.user?.tag || newMessage.author?.tag || oldMessage.author?.tag || 'Usuario desconocido'}`,
  });
}

function hasMeaningfulMessageChanges(oldMessage, newMessage) {
  if ((oldMessage.content || '') !== (newMessage.content || '')) return true;

  const oldAttachments = Array.from(oldMessage.attachments?.values?.() || []);
  const newAttachments = Array.from(newMessage.attachments?.values?.() || []);
  if (oldAttachments.length !== newAttachments.length) return true;

  const oldStickers = Array.from(oldMessage.stickers?.values?.() || []);
  const newStickers = Array.from(newMessage.stickers?.values?.() || []);
  if (oldStickers.length !== newStickers.length) return true;

  // Discord can emit messageUpdate when a link/GIF preview gets generated.
  // If the actual message content, attachments, and stickers did not change,
  // treat it as a non-user edit and ignore it.

  return false;
}

module.exports = {
  buildMessageDeleteLog,
  buildMessageUpdateLog,
  hasMeaningfulMessageChanges,
};
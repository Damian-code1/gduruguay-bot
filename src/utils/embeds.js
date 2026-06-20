const { EmbedBuilder } = require('discord.js');

const DEFAULT_COLOR = 0x5865F2;
const ERROR_COLOR = 0xED4245;
const OK_COLOR = 0x57F287;
const INFO_COLOR = 0xFEE75C;

function ensureEmbed(input, opts = {}) {
  if (!input) input = '';
  if (typeof input === 'string') {
    const eb = new EmbedBuilder()
      .setDescription(input)
      .setColor(opts.color || DEFAULT_COLOR);
    if (opts.title) eb.setTitle(opts.title);
    if (opts.footer) eb.setFooter({ text: opts.footer });
    return eb;
  }

  // If already an EmbedBuilder or raw object, try to normalize
  if (input instanceof EmbedBuilder) return input;
  if (input && input.toJSON) return input;

  // fallback: create from object
  const eb = new EmbedBuilder();
  if (input.title) eb.setTitle(input.title);
  if (input.description) eb.setDescription(input.description);
  if (input.color) eb.setColor(input.color);
  if (input.footer) eb.setFooter({ text: input.footer });
  return eb;
}

function payloadToEmbed(payload, defaultColor = DEFAULT_COLOR) {
  if (!payload) return ensureEmbed('', { color: defaultColor });

  if (typeof payload === 'string') {
    return ensureEmbed(payload, { color: defaultColor });
  }

  if (payload instanceof EmbedBuilder) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.embeds) && payload.embeds.length) {
      return payload.embeds[0] instanceof EmbedBuilder ? payload.embeds[0] : ensureEmbed(payload.embeds[0], { color: defaultColor });
    }

    return ensureEmbed({
      title: payload.title,
      description: payload.description || payload.content || '',
      color: payload.color || defaultColor,
      footer: payload.footer,
    });
  }

  return ensureEmbed('', { color: defaultColor });
}

async function replyEmbed(message, payload) {
  // payload can be: string, EmbedBuilder, or an object { embeds, content, title, description, color, footer }
  if (!message || !message.reply) return null;

  // If already an object with embeds, forward as-is
  if (payload && typeof payload === 'object' && Array.isArray(payload.embeds)) {
    return message.reply(payload).catch(() => null);
  }

  // If it's a string or embed-like
  let embed;
  if (typeof payload === 'string') {
    embed = ensureEmbed(payload);
  } else if (payload instanceof EmbedBuilder) {
    embed = payload;
  } else if (payload && typeof payload === 'object') {
    // create embed from object properties
    embed = ensureEmbed({
      title: payload.title,
      description: payload.description || payload.content || '',
      color: payload.color,
      footer: payload.footer,
    });
  } else {
    embed = ensureEmbed('');
  }

  return message.reply({ embeds: [embed] }).catch(() => null);
}

async function replyError(message, text) {
  const eb = ensureEmbed({ description: text, color: ERROR_COLOR });
  return message.reply({ embeds: [eb] }).catch(() => null);
}

async function replyOk(message, text) {
  const eb = ensureEmbed({ description: text, color: OK_COLOR });
  return message.reply({ embeds: [eb] }).catch(() => null);
}

module.exports = {
  replyEmbed,
  replyError,
  replyOk,
  ensureEmbed,
  payloadToEmbed,
};

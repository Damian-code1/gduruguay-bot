'use strict';

const { EmbedBuilder, MessageFlags, ContainerBuilder, TextDisplayBuilder } = require('discord.js');

/**
 * Responde a una interacción con un embed.
 *
 * Regla del bot: TODOS los embeds son ephemeral por defecto.
 * Excepción: si el embed necesita pinguear a un usuario o @here/@everyone
 * (por ejemplo, notificar públicamente a la persona sancionada), se envía
 * como mensaje normal (no ephemeral) para que la mención funcione,
 * ya que Discord no dispara notificaciones de mención en mensajes ephemeral.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{
 *   embed: EmbedBuilder,
 *   pings?: boolean,          // true => respuesta pública (porque pinguea)
 *   content?: string,         // contenido de texto plano opcional (ej. la mención)
 *   components?: any[],
 * }} options
 */
async function replyEmbed(interaction, { embed, pings = false, content, components } = {}) {
  // Comandos que pinguean (menciones/@here/@everyone): embed normal, público, no V2.
  if (pings) {
    const payload = {
      embeds: embed ? [embed] : [],
      components: components || [],
      ...(content ? { content } : {}),
    };
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply(payload);
    }
    return interaction.reply(payload);
  }

  // Todo lo demás: ephemeral con Components V2.
  const container = new ContainerBuilder();

  if (embed) {
    const title = embed.data.title ? `### ${embed.data.title}\n` : '';
    const description = embed.data.description || '';
    if (title || description) {
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${title}${description}`));
    }
    if (embed.data.fields?.length) {
      const fieldsText = embed.data.fields
        .map((f) => `**${f.name}**\n${f.value}`)
        .join('\n\n');
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldsText));
    }
    if (embed.data.color) container.setAccentColor(embed.data.color);
  }

  if (content) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  const payload = {
    flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
    components: [container, ...(components || [])],
  };

  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

/** Embed de error rápido (siempre ephemeral, nunca pinguea). */
async function replyError(interaction, description, color = 0xC0392B) {
  const embed = new EmbedBuilder().setTitle('❌ Error').setDescription(description).setColor(color);
  return replyEmbed(interaction, { embed, pings: false });
}

/**
 * Publica un embed de moderación en el canal de logs configurado.
 * @param {import('discord.js').Client} client
 * @param {string} channelId
 * @param {EmbedBuilder} embed
 */
async function postToModLog(client, channelId, embed) {
  try {
    const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
    if (!channel?.isTextBased()) return;
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Error posteando en el canal de logs:', err);
  }
}

module.exports = { replyEmbed, replyError, postToModLog };

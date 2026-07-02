'use strict';

const {
  EmbedBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
} = require('discord.js');

/**
 * Responde a una interacción.
 *
 * Regla del bot:
 * - Si el mensaje pinguea a un usuario o @here/@everyone (pings: true),
 *   se envía como embed clásico público (Discord no dispara notificaciones
 *   de mención en mensajes ephemeral / Components V2 ephemeral).
 * - En cualquier otro caso, se envía como Components V2 ephemeral: simple,
 *   sin color de borde, con separadores (dividers) entre secciones.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {{
 *   embed: EmbedBuilder,
 *   pings?: boolean,
 *   content?: string,
 *   components?: any[],
 * }} options
 */
async function replyEmbed(interaction, { embed, pings = false, content, components } = {}) {
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

  const container = new ContainerBuilder();
  let sectionsAdded = 0;

  const addDividerIfNeeded = () => {
    if (sectionsAdded > 0) {
      container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small),
      );
    }
    sectionsAdded += 1;
  };

  if (content) {
    addDividerIfNeeded();
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(content));
  }

  if (embed) {
    const title = embed.data.title ? `### ${embed.data.title}` : '';
    const description = embed.data.description || '';
    const headerText = [title, description].filter(Boolean).join('\n');
    if (headerText) {
      addDividerIfNeeded();
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(headerText));
    }

    if (embed.data.fields?.length) {
      addDividerIfNeeded();
      const fieldsText = embed.data.fields
        .map((f) => `**${f.name}**\n${f.value}`)
        .join('\n\n');
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(fieldsText));
    }
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

/** Mensaje de error rápido (siempre ephemeral, nunca pinguea). */
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
const { MessageFlags } = require('discord.js');

const COMPONENTS_V2_FLAG = MessageFlags?.IsComponentsV2 ?? 32768;

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function mimicMentions(value) {
  return String(value || '')
    .replace(/@here/gi, '@ here')
    .replace(/@everyone/gi, '@ everyone')
    .replace(/@channel/gi, '@ channel');
}

function isUsageLikeText(text) {
  const normalized = normalizeText(text);
  return (
    /(^|\n)\s*(?:📖\s*)?(?:uso|usage)\b/i.test(text) ||
    /(^|\n)\s*(?:❌|ℹ️|⚠️)?\s*uso\b/i.test(text) ||
    normalized.includes('ejemplo:') ||
    normalized.includes('ejemplos:') ||
    normalized.includes('use:') ||
    normalized.includes('how to')
  );
}

function extractTextFromEmbed(embed) {
  if (!embed) return '';

  const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
  const parts = [];

  if (data.title) parts.push(String(data.title));
  if (data.description) parts.push(mimicMentions(data.description));

  if (Array.isArray(data.fields)) {
    for (const field of data.fields) {
      if (!field) continue;
      const name = String(field.name || '').trim();
      const value = String(field.value || '').trim();
      if (name) parts.push(mimicMentions(name));
      if (value) parts.push(mimicMentions(value));
    }
  }

  if (Array.isArray(data.components)) {
    for (const component of data.components) {
      const content = component?.content;
      if (content) parts.push(mimicMentions(String(content)));
    }
  }

  return parts.join('\n');
}

function extractStructuredEmbed(embed) {
  if (!embed) return { title: '', description: '', fields: [], footer: '' };

  const data = typeof embed.toJSON === 'function' ? embed.toJSON() : embed;
  return {
    title: data.title ? mimicMentions(String(data.title)) : '',
    description: data.description ? mimicMentions(String(data.description)) : '',
    fields: Array.isArray(data.fields)
      ? data.fields
          .filter(Boolean)
          .map(field => ({
            name: mimicMentions(String(field.name || '').trim()),
            value: mimicMentions(String(field.value || '').trim()),
          }))
      : [],
    footer: data.footer?.text ? mimicMentions(String(data.footer.text)) : '',
  };
}

function extractPayloadText(payload) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload.content === 'string' && payload.content.trim()) return payload.content;

  if (Array.isArray(payload.embeds) && payload.embeds.length) {
    return payload.embeds.map(extractTextFromEmbed).filter(Boolean).join('\n');
  }

  if (payload.embed) return extractTextFromEmbed(payload.embed);

  return '';
}

function formatFieldGroup(fields) {
  return fields
    .map(field => {
      const label = field.name ? `### ${field.name}` : '### Información';
      const value = field.value || '—';
      return `${label}\n${value}`.trim();
    })
    .join('\n\n');
}

function buildV2ContainerFromStructuredEmbed(embed) {
  const { title, description, fields, footer } = extractStructuredEmbed(embed);

  const components = [];

  if (title) {
    components.push({
      type: 10,
      content: title.startsWith('#') ? title : `# ${title}`,
    });
  }

  if (description) {
    if (components.length) components.push({ type: 14 });
    components.push({ type: 10, content: description });
  }

  if (fields.length) {
    if (components.length) components.push({ type: 14 });

    const firstGroup = fields.slice(0, 2);
    const secondGroup = fields.slice(2);

    if (firstGroup.length) {
      components.push({ type: 10, content: formatFieldGroup(firstGroup) });
    }

    if (secondGroup.length) {
      components.push({ type: 14 });
      components.push({ type: 10, content: formatFieldGroup(secondGroup) });
    }
  }

  if (footer) {
    if (components.length) components.push({ type: 14 });
    components.push({ type: 10, content: `> ${footer}` });
  }

  if (!components.length) return null;

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: null,
        components,
      },
    ],
  };
}

function buildV2ContainerFromText(text) {
  const lines = String(mimicMentions(text) || '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(line => line.trim().length > 0);

  if (!lines.length) return null;

  const components = [];
  const head = lines[0];
  const body = lines.slice(1);

  components.push({
    type: 10,
    content: head.startsWith('#') ? head : `# ${head}`,
  });

  if (body.length) {
    components.push({ type: 14 });
    const mid = body.length > 3 ? 2 : body.length;
    const firstGroup = body.slice(0, mid).join('\n');
    const secondGroup = body.slice(mid).join('\n');

    components.push({ type: 10, content: firstGroup });

    if (secondGroup) {
      components.push({ type: 14 });
      components.push({ type: 10, content: secondGroup });
    }
  }

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [
      {
        type: 17,
        accent_color: null,
        components,
      },
    ],
  };
}

function convertUsageReplyPayload(payload) {
  const text = extractPayloadText(payload);
  if (!text || !isUsageLikeText(text)) return null;

  if (payload && typeof payload === 'object' && Array.isArray(payload.embeds) && payload.embeds.length) {
    const converted = buildV2ContainerFromStructuredEmbed(payload.embeds[0]);
    if (converted) return converted;
  }

  return buildV2ContainerFromText(text);
}

function makeV2UsageReply(payload) {
  const converted = convertUsageReplyPayload(payload);
  if (!converted) return payload;

  if (payload && typeof payload === 'object') {
    for (const key of ['allowedMentions', 'reply', 'files', 'attachments', 'components']) {
      if (payload[key] !== undefined && converted[key] === undefined) {
        converted[key] = payload[key];
      }
    }
  }

  return converted;
}

module.exports = {
  COMPONENTS_V2_FLAG,
  convertUsageReplyPayload,
  makeV2UsageReply,
};
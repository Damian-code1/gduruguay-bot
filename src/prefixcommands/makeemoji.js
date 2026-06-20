const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const REMOVE_BG_URL = 'https://api.remove.bg/v1.0/removebg';

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -makeemoji')
    .setColor(0x5865F2)
    .setDescription('Crea un emoji desde una imagen (adjunta o URL).')
    .addFields(
      { name: 'Uso básico', value: '`-makeemoji nombre` (adjuntando imagen)' },
      { name: 'Con URL', value: '`-makeemoji nombre https://...`' },
      { name: 'Quitar fondo opcional', value: '`-makeemoji nombre nobg` o `-makeemoji nombre removebg`' },
      { name: 'Notas', value: 'El nombre del emoji debe tener entre 2 y 32 caracteres.' }
    )
    .setFooter({ text: 'gduruguay bot' });
}

function sanitizeEmojiName(input) {
  const clean = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  if (clean.length < 2 || clean.length > 32) return null;
  return clean;
}

function extractOptions(args) {
  const flags = new Set(['nobg', 'removebg', '--removebg', '-removebg', 'sinfondo']);
  let removeBg = false;
  let name = null;
  let url = null;

  for (const raw of args) {
    const value = String(raw || '').trim();
    if (!value) continue;

    const lower = value.toLowerCase();
    if (flags.has(lower)) {
      removeBg = true;
      continue;
    }

    if (/^https?:\/\//i.test(value) && !url) {
      url = value;
      continue;
    }

    if (!name) {
      name = value;
    }
  }

  return { removeBg, name, url };
}

async function fetchImageBuffer(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('No se pudo descargar la imagen.');
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  if (!contentType.startsWith('image/')) {
    throw new Error('El archivo no es una imagen válida.');
  }

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType,
  };
}

async function removeBackground(buffer, contentType) {
  const apiKey = process.env.REMOVEBG_API_KEY;
  if (!apiKey) {
    throw new Error('Falta configurar `REMOVEBG_API_KEY` en el .env para usar removebg.');
  }

  const form = new FormData();
  form.append('image_file', new Blob([buffer], { type: contentType }), 'image');
  form.append('size', 'auto');

  const response = await fetch(REMOVE_BG_URL, {
    method: 'POST',
    headers: {
      'X-Api-Key': apiKey,
    },
    body: form,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`remove.bg devolvió ${response.status}. ${text.slice(0, 180)}`.trim());
  }

  const output = await response.arrayBuffer();
  return {
    buffer: Buffer.from(output),
    contentType: 'image/png',
  };
}

module.exports = {
  name: 'makeemoji',
  help: {
    purpose: 'Crea un emoji del servidor a partir de una imagen, opcionalmente quitando fondo.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const botMember = message.guild.members.me;
    const botHasPermission = botMember?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions);
    if (!botHasPermission) {
      return message.reply('❌ Me falta el permiso `Manage Expressions` para crear emojis.');
    }

    const { removeBg, name, url } = extractOptions(args);
    const imageAttachment = message.attachments.first();
    const imageUrl = imageAttachment?.url || url;

    const emojiName = sanitizeEmojiName(name);
    if (!emojiName || !imageUrl) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const progress = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🛠️ Creando emoji...')
          .setColor(0x5865F2)
          .setDescription(removeBg ? 'Procesando imagen y quitando fondo...' : 'Procesando imagen...'),
      ],
    });

    try {
      const downloaded = await fetchImageBuffer(imageUrl);
      const finalImage = removeBg ? await removeBackground(downloaded.buffer, downloaded.contentType) : downloaded;

      const emoji = await message.guild.emojis.create({
        attachment: finalImage.buffer,
        name: emojiName,
      });

      const embed = new EmbedBuilder()
        .setTitle('✅ Emoji creado')
        .setColor(0x2ECC71)
        .setDescription(`${emoji} Se creó el emoji **:${emoji.name}:**`)
        .addFields(
          { name: 'Nombre', value: `\`${emoji.name}\``, inline: true },
          { name: 'ID', value: `\`${emoji.id}\``, inline: true },
          { name: 'Remove BG', value: removeBg ? 'Sí' : 'No', inline: true },
        )
        .setTimestamp();

      return progress.edit({ embeds: [embed] });
    } catch (error) {
      console.error('Error en -makeemoji:', error);

      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ No se pudo crear el emoji')
        .setColor(0xED4245)
        .setDescription([
          'Posibles causas:',
          '• Imagen demasiado grande o formato inválido.',
          '• Límite de emojis del servidor alcanzado.',
          '• Fallo de remove.bg o API key faltante.',
          '',
          `Detalle: ${String(error.message || 'error desconocido').slice(0, 300)}`,
        ].join('\n'));

      return progress.edit({ embeds: [errorEmbed] });
    }
  },
};

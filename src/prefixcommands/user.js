const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;

const EMOJI = {
  stars: '<:starpoint:1503144120657383524>',
  coins: '<:silvercoin:1503144102990971162>',
  user: '👤',
};

// New emoji images uploaded by the user (use as accessory media)
const EMOJI_URLS = {
  demon: 'https://cdn.discordapp.com/emojis/1503152992482885794.webp?size=96',
  diamond: 'https://cdn.discordapp.com/emojis/1503153052050395226.webp?size=96',
  moon: 'https://cdn.discordapp.com/emojis/1503153076691927120.webp?size=96',
};

async function doFetch(url, options) {
  if (typeof fetch === 'function') return fetch(url, options);
  try {
    const undici = require('undici');
    if (undici && typeof undici.fetch === 'function') return undici.fetch(url, options);
  } catch (e) {}

  try {
    const nodeFetch = require('node-fetch');
    if (typeof nodeFetch === 'function') return nodeFetch(url, options);
    if (nodeFetch && typeof nodeFetch.default === 'function') return nodeFetch.default(url, options);
  } catch (e) {}

  throw new Error('No fetch implementation available (global fetch, undici or node-fetch)');
}

function safeNumber(value) {
  return Number(value || 0);
}

function getUserId(u) {
  return u?.id ?? u?.playerID ?? u?.playerId ?? u?.accountID ?? '';
}

function getUserName(u) {
  return u?.name ?? u?.username ?? u?.playerName ?? u?.user ?? 'Desconocido';
}

function getAvatarUrl(u) {
  // GDBrowser user payloads sometimes include an `icon` or `playerIcon` field
  const icon = u?.icon ?? u?.playerIcon ?? u?.iconURL ?? '';
  if (!icon) return null;

  if (/^https?:\/\//i.test(icon)) return icon;

  // Fallback guess for common icon paths (harmless if incorrect)
  return `https://gdbrowser.com/images/players/${encodeURIComponent(String(icon))}.png`;
}

async function fetchUser(query) {
  const tries = [];

  // Try common profile endpoints for ID or name
  tries.push(`https://gdbrowser.com/api/profile/${encodeURIComponent(query)}`);
  tries.push(`https://gdbrowser.com/api/user/${encodeURIComponent(query)}`);
  tries.push(`https://gdbrowser.com/api/users/${encodeURIComponent(query)}`);
  tries.push(`https://gdbrowser.com/api/player/${encodeURIComponent(query)}`);
  tries.push(`https://gdbrowser.com/api/players/${encodeURIComponent(query)}`);

  for (const url of tries) {
    try {
      const res = await doFetch(url);
      if (!res) {
        console.debug('[user] fetch null response for', url);
        continue;
      }
      if (!res.ok) {
        console.debug('[user] non-ok response', res.status, url);
        continue;
      }
      let data;
      try {
        data = await res.json();
      } catch (e) {
        console.debug('[user] failed to parse JSON from', url);
        continue;
      }
      if (data && !data.error && (data.id || data.playerID || data.name || data.username)) return { data, tried: tries };
    } catch (e) {
      console.debug('[user] fetch error for', url, e && e.message ? e.message : e);
      // ignore and try next
    }
  }

  // Last-ditch: try the site profile page HTML (not JSON) and return null
  try {
    const res = await doFetch(`https://gdbrowser.com/profile/${encodeURIComponent(query)}`);
    if (res && res.ok) {
      // we don't parse HTML here; just indicate we tried
      return { data: null, tried: tries.concat([`https://gdbrowser.com/profile/${encodeURIComponent(query)}`]) };
    }
  } catch (e) {
    console.debug('[user] final profile page fetch failed', e && e.message ? e.message : e);
  }

  return { data: null, tried: tries };
}

async function buildUserCard(user) {
  const avatar = getAvatarUrl(user);
  const name = getUserName(user);
  const id = getUserId(user) || '—';

  const stars = safeNumber(user?.stars ?? user?.starCount ?? user?.starsCount);
  const demons = safeNumber(user?.demons ?? user?.demonCount ?? user?.demonCountCompleted ?? 0);
  const diamonds = safeNumber(user?.diamonds ?? user?.diam ?? user?.playerPoints ?? 0);
  const userCoins = safeNumber(user?.userCoins ?? user?.coins ?? user?.usercoins ?? 0);
  const rank = user?.rank ?? user?.position ?? null;

  const components = [];

  // Header (avatar URL is included as plain text to avoid accessory issues)
  components.push({
    type: 9,
    components: [
      {
        type: 10,
        content: `# ${name}\n${EMOJI.user} ID: ${id}${rank ? ` • Rango: ${rank}` : ''}${avatar ? `\nAvatar: ${avatar}` : ''}`,
      },
    ],
  });

  components.push({ type: 14 });

  // Use accessory images for prominent stats so they look like emojis
  components.push({
    type: 9,
    components: [{ type: 10, content: `${EMOJI.stars || '⭐'} Estrellas: \`${stars}\`` }],
  });

  components.push({
    type: 9,
    components: [{ type: 10, content: `👹 Demons: \`${demons}\`` }],
  });

  components.push({
    type: 9,
    components: [{ type: 10, content: `💎 Diamonds: \`${diamonds}\`` }],
  });

  components.push({
    type: 9,
    components: [{ type: 10, content: `🌙 Monedas: \`${userCoins}\`` }],
  });

  // Optional extra info
  if (user?.created) components.push({ type: 10, content: `🗓️ Creado: ${String(user.created)}` });
  if (user?.country) components.push({ type: 10, content: `🌍 País: ${String(user.country)}` });

  // Last comment: try to extract from user payload, otherwise try comments endpoint
  let lastComment = null;
  if (user?.lastComment) lastComment = user.lastComment;
  if (!lastComment && Array.isArray(user?.comments) && user.comments.length) lastComment = user.comments[0]?.text || user.comments[0];

  if (!lastComment) {
    try {
      const uid = getUserId(user);
      if (uid) {
        const cRes = await doFetch(`https://gdbrowser.com/api/comments/${encodeURIComponent(uid)}`);
        if (cRes && cRes.ok) {
          const cData = await cRes.json();
          if (Array.isArray(cData) && cData.length) lastComment = cData[0]?.text || String(cData[0]);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (lastComment) {
    const trimmed = String(lastComment).trim().slice(0, 240);
    components.push({ type: 14 });
    components.push({ type: 10, content: `🗨️ Último comentario: ${trimmed}` });
  }

  // Add profile link as plain text inside the Components V2 card to avoid
  // sending mixed component types (raw + builders) which may produce invalid
  // form bodies.
  try {
    const profileUrl = `https://gdbrowser.com/profile/${encodeURIComponent(getUserId(user) || getUserName(user))}`;
    components.push({ type: 14 });
    components.push({ type: 10, content: `🔗 Ver en GDBrowser: ${profileUrl}` });
  } catch (e) {
    // ignore
  }

  return {
    type: 17,
    accent_color: null,
    components,
  };
}

module.exports = {
  name: 'user',
  aliases: ['u', 'profile'],
  async execute(message, args) {
    const query = args.join(' ').trim();
    if (!query) {
      return message.reply({ embeds: [new EmbedBuilder().setTitle('Uso: -user <id|nombre>').setDescription('Busca información de usuario en GDBrowser por ID o nombre.').setColor(0x2C2F33)] });
    }

    const loading = await message.reply('🔍 Buscando usuario...');

    try {
      const result = await fetchUser(query);
      const user = result && result.data ? result.data : null;
      if (!user) {
        console.debug('[user] fetchUser tried URLs:', result && result.tried ? result.tried : 'none');
        await loading.edit('❌ No se encontró ningún usuario en GDBrowser con ese identificador o nombre.');
        return;
      }

      // Build a simple embed instead of Components V2 to avoid payload issues
      const avatar = getAvatarUrl(user);
      const name = getUserName(user);
      const id = getUserId(user) || '—';

      const stars = safeNumber(user?.stars ?? user?.starCount ?? user?.starsCount);
      const demons = safeNumber(user?.demons ?? user?.demonCount ?? user?.demonCountCompleted ?? 0);
      const diamonds = safeNumber(user?.diamonds ?? user?.diam ?? user?.playerPoints ?? 0);
      const userCoins = safeNumber(user?.userCoins ?? user?.coins ?? user?.usercoins ?? 0);

      const profileUrl = `https://gdbrowser.com/profile/${encodeURIComponent(getUserId(user) || getUserName(user))}`;

      const embed = new EmbedBuilder()
        .setTitle(name)
        .setDescription(`ID: ${id}`)
        .setColor(0x2C2F33)
        .setURL(profileUrl);

      if (avatar) embed.setThumbnail(avatar);

      embed.addFields(
        { name: 'Estrellas', value: String(stars), inline: true },
        { name: 'Demons', value: String(demons), inline: true },
        { name: 'Diamonds', value: String(diamonds), inline: true },
        { name: 'Monedas', value: String(userCoins), inline: true },
      );

      if (user?.created) embed.addFields({ name: 'Creado', value: String(user.created), inline: true });
      if (user?.country) embed.addFields({ name: 'País', value: String(user.country), inline: true });

      await message.channel.send({ embeds: [embed] });

      try { await loading.delete(); } catch (e) {}
    } catch (err) {
      console.error('[user] fetch error', err);
      try {
        await loading.edit('❌ Error al buscar el usuario en GDBrowser.');
      } catch (e) {
        try { await message.channel.send('❌ Error al buscar el usuario en GDBrowser.'); } catch (_) {}
      }
    }
  },
};

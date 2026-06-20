const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { parseDuration, formatDuration } = require('./timeParser');
const {
  createGiveaway,
  updateGiveaway,
  removeGiveaway,
  setGiveawayStatus,
  getGiveaway,
  getActiveGiveawaysByGuild,
  addParticipant,
  isGiveawayBanned,
  incrementMessageCounts,
  incrementInviteCounts,
  setInviteSnapshot,
  getSetting,
  setSetting,
  deleteSetting,
  flushDatabase,
  getGiveawayStats,
  getEligibleParticipants,
} = require('./giveawayStore');

const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;
const DEFAULT_THUMBNAIL = 'https://cdn.discordapp.com/embed/avatars/0.png';
const GIVEAWAY_THUMBNAIL_SETTING = 'giveawayDefaultThumbnailUrl';
const DEFAULT_PING = 'everyone';
const URUBOT_LOG_CHANNEL_ID = '1496348718558089216';
const timers = new Map();

async function persistGiveawayState() {
  await flushDatabase().catch(() => null);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isAdminOrStaff(member, guildId) {
  if (!member) return false;
  const isAdmin = member.permissions?.has?.(PermissionFlagsBits.Administrator);
  const isManageGuild = member.permissions?.has?.(PermissionFlagsBits.ManageGuild);
  return Boolean(isAdmin || isManageGuild || member.guild?.id === guildId && member.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function resolveThumbnail(thumbnailUrl) {
  const raw = String(thumbnailUrl || '').trim();
  return raw || '';
}

function getFallbackThumbnail(client) {
  return client?.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || DEFAULT_THUMBNAIL;
}

function getParticipantCount(giveaway) {
  return Array.isArray(giveaway?.participants) ? giveaway.participants.length : 0;
}

async function sendUrubotLog(client, embed) {
  const channel = await client.channels.fetch(URUBOT_LOG_CHANNEL_ID).catch(() => null);
  if (!channel?.isTextBased?.()) return;
  await channel.send({ embeds: [embed] }).catch(() => null);
}

async function buildInviteAuditEmbed(client, giveaway, winnerIds, label) {
  const participants = Array.isArray(giveaway?.participants) ? giveaway.participants : [];
  const stats = await Promise.all(participants.slice(0, 20).map(async (userId) => {
    const s = await getGiveawayStats(giveaway.id, userId);
    return {
      userId,
      messages: s?.messages ?? 0,
      invites: s?.invites ?? 0,
      joined: Boolean(s?.joined),
    };
  }));

  const lines = stats.length
    ? stats.map(s => `• <@${s.userId}> — invitaciones: \`${s.invites}\` · mensajes: \`${s.messages}\`${s.joined ? ' · dentro' : ''}`).join('\n')
    : 'Aún no hay participantes registrados.';

  return new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📋 ${label}`)
    .setDescription([
      `**Premio:** ${giveaway.prize}`,
      winnerIds?.length ? `**Ganador(es):** ${winnerIds.map(id => `<@${id}>`).join(' ')}` : null,
      '',
      lines,
    ].filter(Boolean).join('\n'))
    .setThumbnail(resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(client))
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' })
    .setTimestamp();
}

function buildWinnerCardPayload(client, giveaway, winnerIds, label = 'RESULTADO DEL GIVEAWAY') {
  const isSingle = winnerIds.length === 1;
  const winnerText = isSingle ? `<@${winnerIds[0]}>` : winnerIds.map(id => `<@${id}>`).join(' ');
  const container = buildContainer({
    title: isSingle ? '🎉 GANASTE' : '🎉 GANARON',
    subtitle: `## 🎁 ${giveaway.prize}`,
    fields: [
      { name: isSingle ? 'Ganador' : 'Ganadores', value: winnerText || 'Nadie' },
      { name: 'Participantes', value: `\`${getParticipantCount(giveaway)}\`` },
      { name: 'Requisitos', value: [
        Number(giveaway.requiredMessages) > 0 ? `Mensajes: \`${giveaway.requiredMessages}\`` : null,
        Number(giveaway.requiredInvites) > 0 ? `Invitaciones: \`${giveaway.requiredInvites}\`` : null,
      ].filter(Boolean).join('\n') || 'Sin requisitos' },
    ],
    thumbnailUrl: resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(client),
    fullWidthThumbnail: true,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container],
  };
}

async function resolveDefaultGiveawayThumbnail() {
  const stored = await getSetting(GIVEAWAY_THUMBNAIL_SETTING, '');
  return normalizeThumbnailUrl(stored) || DEFAULT_THUMBNAIL;
}

function normalizeThumbnailUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function extractAttachmentThumbnailUrl(message) {
  const attachment = message?.attachments?.first?.();
  if (!attachment) return '';

  const contentType = String(attachment.contentType || '').toLowerCase();
  const isImage = contentType.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(String(attachment.name || attachment.url || ''));
  if (!isImage) return '';

  return String(attachment.url || '').trim();
}

function resizeImageUrl(url, width = 900, height = 220) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if (host.endsWith('discordapp.com') || host.endsWith('discordapp.net') || host.endsWith('media.discordapp.net')) {
      const proxy = new URL(raw);
      proxy.hostname = 'media.discordapp.net';
      proxy.searchParams.set('width', String(width));
      proxy.searchParams.set('height', String(height));
      return proxy.toString();
    }

    parsed.searchParams.set('width', String(width));
    parsed.searchParams.set('height', String(height));
    return parsed.toString();
  } catch {
    return raw;
  }
}

function formatCountdown(ms) {
  if (ms <= 0) return '0s';
  return formatDuration(ms);
}

function buildContainer({
  title,
  subtitle,
  fields = [],
  thumbnailUrl = null,
  footer = null,
  fullWidthThumbnail = false,
}) {
  const components = [];
  const finalThumbnailUrl = thumbnailUrl;

  components.push({ type: 10, content: title.startsWith('#') ? title : `# ${title}` });

  if (finalThumbnailUrl && fullWidthThumbnail) {
    components.push({
      type: 12,
      items: [
        {
          media: {
            type: 1,
            url: finalThumbnailUrl,
          },
          spoiler: false,
        },
      ],
    });
  }

  if (subtitle) {
    components.push({ type: 14 });
    components.push({ type: 10, content: subtitle });
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

  if (finalThumbnailUrl && !fullWidthThumbnail) {
    components.splice(1, 0, {
      type: 9,
      components: [{ type: 10, content: '\u200B' }],
      accessory: {
        type: 11,
        media: { type: 1, url: finalThumbnailUrl },
        spoiler: false,
      },
    });
  }

  return {
    type: 17,
    accent_color: null,
    components,
  };
}

function buildHelpPayload(client, guild) {
  const thumbnail = getFallbackThumbnail(client);
  const container = buildContainer({
    title: '🎁 Giveaways',
    subtitle: 'Sistema de sorteos.',
    fields: [
      {
        name: 'Uso',
        value: [
          '`-gw panel`',
          '`-gw create <duración> <premio>`',
          '`-gw create #canal <duración> <premio>`',
          '`-gw preview`',
          '`-gw thumbnail set <url>`',
          '`-gw thumbnail set` + adjuntar imagen',
          '`-gw thumbnail clear`',
          '`-gw thumbnail show`',
          '`-gw stats <id> [@usuario|me]`',
          '`-gw reroll <id>`',
          '`-gw stop <id>`',
        ].join('\n'),
      },
      {
        name: 'Requisitos',
        value: [
          'Mensajes desde el inicio del sorteo.',
          'Invitaciones validadas por invite tracker.',
          'Botón de estadísticas por participante.',
        ].join('\n'),
      },
    ],
    thumbnailUrl: thumbnail,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container],
  };
}

function buildPanelPayload(client, guild) {
  const thumbnail = getFallbackThumbnail(client);
  const container = buildContainer({
    title: '🎉 Panel de Giveaways',
    subtitle: 'Pulsa el botón para ver la guía rápida de creación.',
    fields: [
      { name: 'Estado', value: 'Listo para configurar un sorteo.' },
      { name: 'Estética', value: 'Embed v2 borderless + Components v2.' },
    ],
    thumbnailUrl: thumbnail,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('gw_panel_open')
      .setLabel('Ver Guía')
      .setStyle(ButtonStyle.Primary)
  );

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container, row],
  };
}

function buildQuickGuideEmbed(client, guild) {
  return new EmbedBuilder()
    .setTitle('🎉 Panel de Giveaways')
    .setDescription([
      'Sistema de sorteos.',
      '',
      '**Creación rápida:**',
      '`-gw create <duración> <premio>`',
      '`-gw create #canal <duración> <premio>`',
      '',
      '**Otros:**',
      '`-gw preview`',
      '`-gw thumbnail set <url>`',
      '`-gw thumbnail clear`',
    ].join('\n'))
    .setThumbnail(DEFAULT_THUMBNAIL)
    .setFooter({ text: 'Made by Evosen • GD Uruguay Bot' });
}

function buildPreviewPayload(client, guild, thumbnailUrl) {
  const thumb = resolveThumbnail(thumbnailUrl) || getFallbackThumbnail(client);
  const container = buildContainer({
    title: '🎁 Vista previa de Giveaway',
    subtitle: 'Esto es solo una muestra visual del formato actual.',
    fields: [
      { name: '🎉 Premio', value: 'Nitro / Role / lo que quieras' },
      { name: 'Tiempo', value: '<t:1893456000:R>' },
      { name: 'Participantes', value: '`24`' },
      { name: 'Ganadores', value: '`1`' },
    ],
    thumbnailUrl: thumb,
    fullWidthThumbnail: true,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container],
  };
}

function giveawayButtons(giveawayId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`gw_join:${giveawayId}`)
      .setLabel('🎉 Participar')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId(`gw_stats:${giveawayId}`)
      .setLabel('Mis Estadísticas')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(disabled),
  );
}

function buildGiveawayPayload(client, guild, giveaway, remainingMs, participantCount) {
  const thumbnail = resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(client);
  const endUnix = Math.floor(giveaway.endsAt / 1000);
  const requirements = [];
  if (Number(giveaway.requiredMessages) > 0) requirements.push(`Mensajes: \`${giveaway.requiredMessages}\``);
  if (Number(giveaway.requiredInvites) > 0) requirements.push(`Invitaciones: \`${giveaway.requiredInvites}\``);

  const container = buildContainer({
    title: '🎉 GIVEAWAY',
    subtitle: `## 🎉 ${giveaway.prize}`,
    fields: [
      { name: 'Tiempo', value: `<t:${endUnix}:R>` },
      ...(requirements.length ? [{ name: 'Requisitos', value: requirements.join('\n') }] : []),
      { name: 'Participantes', value: `\`${participantCount}\`` },
      { name: 'Ganadores', value: `\`${giveaway.winners}\`` },
    ],
    thumbnailUrl: thumbnail,
    fullWidthThumbnail: true,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container],
  };
}

function buildEndedPayload(client, guild, giveaway, winners, reason = 'finalizado') {
  const thumbnail = resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(client);
  const winnerText = winners.length ? winners.map(id => `<@${id}>`).join('\n') : 'Nadie cumplió los requisitos.';
  const requirements = [];
  if (Number(giveaway.requiredMessages) > 0) requirements.push(`Mensajes: \`${giveaway.requiredMessages}\``);
  if (Number(giveaway.requiredInvites) > 0) requirements.push(`Invitaciones: \`${giveaway.requiredInvites}\``);
  const title = reason === 'stop'
    ? '🛑 GIVEAWAY DETENIDO'
    : winners.length === 1
      ? '🎉 GANASTE'
      : winners.length > 1
        ? '🎉 GANARON'
        : '🏆 GIVEAWAY FINALIZADO';

  const container = buildContainer({
    title,
    subtitle: `## 🎉 ${giveaway.prize}`,
    fields: [
      { name: 'Ganador(es)', value: winnerText },
      { name: 'Participantes', value: `\`${getParticipantCount(giveaway)}\`` },
      ...(requirements.length ? [{ name: 'Requisitos', value: requirements.join('\n') }] : []),
    ],
    thumbnailUrl: thumbnail,
    fullWidthThumbnail: true,
    footer: 'Made by Evosen • GD Uruguay Bot',
  });

  return {
    flags: COMPONENTS_V2_FLAG,
    components: [container],
  };
}

async function captureInviteSnapshot(guild) {
  try {
    const invites = await guild.invites.fetch();
    const snapshot = {};
    for (const invite of invites.values()) {
      snapshot[invite.code] = {
        uses: invite.uses || 0,
        inviterId: invite.inviter?.id || null,
        inviterTag: invite.inviter?.tag || invite.inviter?.username || null,
      };
    }
    return snapshot;
  } catch (error) {
    return null;
  }
}

function pickRandom(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}

function resolveStatsTarget(message, args) {
  const directMention = message.mentions.users.first();
  if (directMention) return directMention.id;

  const targetArg = String(args[2] || args[1] || '').trim();
  if (!targetArg) return null;
  if (targetArg.toLowerCase() === 'me') return message.author.id;

  const cleaned = targetArg.replace(/[<@!>]/g, '');
  if (/^\d{17,20}$/.test(cleaned)) return cleaned;

  return null;
}

async function ensureGiveawayRuntime(client, giveaway) {
  if (timers.has(giveaway.id)) return timers.get(giveaway.id);

  const remaining = Math.max(0, giveaway.endsAt - Date.now());
  const intervalId = setInterval(async () => {
    try {
      const current = await getGiveaway(giveaway.id);
      if (!current || current.status !== 'active') {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
        timers.delete(giveaway.id);
        return;
      }

      const channel = await client.channels.fetch(current.channelId).catch(() => null);
      const message = channel?.messages ? await channel.messages.fetch(current.messageId).catch(() => null) : null;
      if (!message) return;

      const updated = buildGiveawayPayload(client, channel.guild, current, Math.max(0, current.endsAt - Date.now()), getParticipantCount(current));
      await message.edit({
        flags: updated.flags,
        components: [
          ...updated.components,
          giveawayButtons(current.id),
        ],
      }).catch(() => null);
    } catch (error) {
      console.error('[giveaway] countdown update failed', error);
    }
  }, 30_000);

  const timeoutId = setTimeout(async () => {
    await finalizeGiveaway(client, giveaway.id, 'auto').catch(() => null);
  }, remaining);

  const runtime = { intervalId, timeoutId };
  timers.set(giveaway.id, runtime);
  return runtime;
}

async function publishGiveaway(client, guild, channelId, giveaway) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.isTextBased?.()) throw new Error('El canal destino no existe o no es de texto.');

  const payload = buildGiveawayPayload(client, guild, giveaway, Math.max(0, giveaway.endsAt - Date.now()), getParticipantCount(giveaway));
  const msg = await channel.send({
    content: '@everyone 🎉 Sorteo activo',
    allowedMentions: { parse: ['everyone'] },
    flags: payload.flags,
    components: [
      ...payload.components,
      giveawayButtons(giveaway.id),
    ],
  });

  return msg;
}

async function finalizeGiveaway(client, giveawayId, reason = 'auto') {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return null;

  if (timers.has(giveawayId)) {
    const runtime = timers.get(giveawayId);
    clearInterval(runtime.intervalId);
    clearTimeout(runtime.timeoutId);
    timers.delete(giveawayId);
  }

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  const message = channel?.messages ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;

  const eligible = await getEligibleParticipants(giveawayId);
  let winners = [];

  if (eligible.length > 0) {
    const pool = eligible.map(item => item.userId);
    while (winners.length < giveaway.winners && pool.length > 0) {
      const chosen = pickRandom(pool);
      if (!chosen) break;
      winners.push(chosen);
      pool.splice(pool.indexOf(chosen), 1);
    }
  }

  await setGiveawayStatus(giveawayId, reason === 'stop' ? 'stopped' : 'ended', {
    endedAt: Date.now(),
    winnerIds: winners,
    rerollCount: giveaway.rerollCount || 0,
  });

  await persistGiveawayState();

  if (message) {
    const payload = buildEndedPayload(client, channel.guild, { ...giveaway, winnerIds: winners }, winners, reason === 'stop' ? 'stop' : 'auto');
    await message.edit({
      flags: payload.flags,
      components: payload.components,
    }).catch(() => null);
  }

  if (channel) {
    if (reason !== 'stop') {
      if (winners.length > 0) {
        const pingText = winners.length === 1
          ? `🎉 Felicidades <@${winners[0]}>! Ganaste **${giveaway.prize}**.`
          : `🎉 Felicidades ${winners.map(id => `<@${id}>`).join(' ')}! Ganaron **${giveaway.prize}**.`;

        await channel.send({
          content: pingText,
          allowedMentions: { parse: ['users'] },
        }).catch(() => null);

        const resultCard = buildWinnerCardPayload(client, { ...giveaway, winnerIds: winners }, winners);
        await channel.send({
          flags: resultCard.flags,
          components: resultCard.components,
        }).catch(() => null);

        const inviteAudit = await buildInviteAuditEmbed(client, giveaway, winners, winners.length === 1 ? 'Ganador del giveaway' : 'Ganadores del giveaway');
        await sendUrubotLog(client, inviteAudit);

      } else {
        await channel.send({
          content: `⚠️ El giveaway **${giveaway.prize}** terminó, pero nadie cumplió los requisitos.`,
        }).catch(() => null);
      }
    }
  }

  return { giveaway, winners };
}

async function rerollGiveaway(client, giveawayId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return { ok: false, error: 'No encontré ese giveaway.' };

  const eligible = await getEligibleParticipants(giveawayId);
  if (!eligible.length) return { ok: false, error: 'No hay participantes elegibles para rerollear.' };

  const winner = pickRandom(eligible.map(item => item.userId));
  if (!winner) return { ok: false, error: 'No pude elegir un ganador.' };

  const nextCount = Math.max(0, Number(giveaway.rerollCount) || 0) + 1;
  await updateGiveaway(giveawayId, { winnerIds: [winner], rerollCount: nextCount, lastUpdatedAt: Date.now() });
  await persistGiveawayState();

  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (channel) {
    await channel.send({
      content: `🔁 Reroll del giveaway **${giveaway.prize}**: ganó <@${winner}>`,
      allowedMentions: { parse: ['users'] },
    }).catch(() => null);

    const resultCard = buildWinnerCardPayload(client, { ...giveaway, winnerIds: [winner] }, [winner], 'REROLL DEL GIVEAWAY');
    await channel.send({
      flags: resultCard.flags,
      components: resultCard.components,
    }).catch(() => null);

    const inviteAudit = await buildInviteAuditEmbed(client, giveaway, [winner], 'Reroll del giveaway');
    await sendUrubotLog(client, inviteAudit);
  }

  return { ok: true, winner };
}

async function stopGiveaway(client, giveawayId) {
  const giveaway = await getGiveaway(giveawayId);
  if (!giveaway) return { ok: false, error: 'No encontré ese giveaway.' };

  await finalizeGiveaway(client, giveawayId, 'stop');
  return { ok: true };
}

async function handleGiveawayMessage(message) {
  if (!message.guild || message.author?.bot) return;
  await incrementMessageCounts(message.guild.id, message.author.id, 1);
}

async function handleGiveawayMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return;
  const active = await getActiveGiveawaysByGuild(member.guild.id);
  if (!active.length) return;

  const currentSnapshot = await captureInviteSnapshot(member.guild);
  if (!currentSnapshot) return;

  for (const giveaway of active) {
    const previous = giveaway.inviteSnapshot || {};
    let matchedInvite = null;

    for (const [code, currentInfo] of Object.entries(currentSnapshot)) {
      const previousUses = Number(previous[code]?.uses || 0);
      const currentUses = Number(currentInfo?.uses || 0);
      if (currentUses > previousUses) {
        matchedInvite = currentInfo;
        break;
      }
    }

    if (matchedInvite?.inviterId) {
      await incrementInviteCounts(member.guild.id, matchedInvite.inviterId, 1);
    }

    await setInviteSnapshot(giveaway.id, currentSnapshot);
  }
}

async function handleGiveawayPrefixCommand(message, args = []) {
  const sub = String(args[0] || '').toLowerCase();

  if (!sub || sub === 'help' || sub === 'ayuda' || sub === '?') {
    return message.reply({
      flags: COMPONENTS_V2_FLAG,
      components: [buildHelpPayload(message.client, message.guild).components[0]],
    });
  }

  if (sub === 'panel') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden usar el panel.');
    return message.reply(buildPanelPayload(message.client, message.guild));
  }

  if (sub === 'create') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden crear giveaways.');

    const tokens = args.slice(1).filter(Boolean);
    if (!tokens.length) {
      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('❌ Uso de -gw create')
          .setDescription([
            '`-gw create [#canal] <duración> <premio>`',
            '`-gw create [#canal] <duración> <premio> --messages <n>`',
            '`-gw create [#canal] <duración> <premio> --invites <n>`',
            '`-gw create [#canal] <duración> <premio> --winners <n>`',
            '`-gw create [#canal] <duración> <premio> --thumb <url>`',
          ].join('\n'))
          .setColor(0xED4245)],
      });
    }

    let targetChannel = message.channel;
    let durationIndex = 0;

    if (tokens[0] && !parseDuration(tokens[0])) {
      const maybeChannel = message.guild.channels.cache.get(tokens[0].replace(/[<#>]/g, ''))
        || message.guild.channels.cache.find(ch => ch?.name === tokens[0].replace(/^#/, ''));
      if (maybeChannel?.isTextBased?.()) {
        targetChannel = maybeChannel;
        durationIndex = 1;
      }
    }

    const durationText = String(tokens[durationIndex] || '').trim();
    const durationMs = parseDuration(durationText);
    if (!durationMs || durationMs < 60_000) {
      return message.reply('❌ Duración inválida. Ejemplo: `1h`, `1d`, `30m`.');
    }

    const optionTokens = tokens.slice(durationIndex + 1);
    const options = [];
    const prizeParts = [];
    for (let i = 0; i < optionTokens.length; i += 1) {
      const token = optionTokens[i];
      if (token.startsWith('--')) {
        options.push(token);
        if (['--messages', '--invites', '--winners', '--thumb', '--thumbnail'].includes(token)) {
          const next = optionTokens[i + 1];
          if (next) options.push(next);
          i += 1;
        }
      } else {
        prizeParts.push(token);
      }
    }

    const parseOptionValue = (names) => {
      for (let i = 0; i < options.length; i += 2) {
        if (names.includes(options[i])) return options[i + 1] || '';
      }
      return '';
    };

    const messagesRequired = Math.max(0, Number(parseOptionValue(['--messages'])) || 0);
    const invitesRequired = Math.max(0, Number(parseOptionValue(['--invites'])) || 0);
    const winners = Math.max(1, Number(parseOptionValue(['--winners'])) || 1);
    const rawThumb = parseOptionValue(['--thumb', '--thumbnail']) || extractAttachmentThumbnailUrl(message);
    const prize = prizeParts.join(' ').trim();
    const thumbnailOverride = normalizeThumbnailUrl(rawThumb) || (rawThumb ? extractAttachmentThumbnailUrl(message) : '');

    if (!prize) {
      return message.reply('❌ Tenés que indicar un premio.');
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const canSendInChannel = botMember ? targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages) : false;
    if (!canSendInChannel) {
      return message.reply('❌ No tengo permiso para enviar mensajes en ese canal.');
    }
    if (invitesRequired > 0 && !botMember?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ Para rastrear invitaciones necesito el permiso `Manage Server`.');
    }

    const fallbackThumbnail = await resolveDefaultGiveawayThumbnail();
    const createdAt = Date.now();
    const endsAt = createdAt + durationMs;
    const inviteSnapshot = invitesRequired > 0 ? (await captureInviteSnapshot(message.guild)) || {} : {};

    const giveawayRecord = await createGiveaway({
      id: `${createdAt}-${message.id}`,
      guildId: message.guild.id,
      channelId: targetChannel.id,
      messageId: '',
      creatorId: message.author.id,
      creatorTag: message.author.tag,
      prize,
      endsAt,
      createdAt,
      requiredMessages: messagesRequired,
      requiredInvites: invitesRequired,
      winners,
      thumbnailUrl: thumbnailOverride || fallbackThumbnail,
      pingType: DEFAULT_PING,
      status: 'active',
      participants: [],
      messageCounts: {},
      inviteCounts: {},
      inviteSnapshot,
      announcementChannelId: targetChannel.id,
      announcementMessageId: '',
      lastUpdatedAt: createdAt,
      rerollCount: 0,
    });

    await persistGiveawayState();

    await targetChannel.send({
      content: '@everyone 🎉 Giveaway nuevo en marcha',
      allowedMentions: { parse: ['everyone'] },
    });

    const initialPayload = buildGiveawayPayload(message.client, message.guild, giveawayRecord, durationMs, 0);
    const announceMessage = await targetChannel.send({
      flags: initialPayload.flags,
      components: [
        ...initialPayload.components,
        giveawayButtons(giveawayRecord.id),
      ],
    });

    const updated = await updateGiveaway(giveawayRecord.id, {
      messageId: announceMessage.id,
      announcementMessageId: announceMessage.id,
      announcementChannelId: targetChannel.id,
    });

    await persistGiveawayState();

    await announceMessage.edit({
      flags: COMPONENTS_V2_FLAG,
      components: [
        buildGiveawayPayload(message.client, message.guild, updated, durationMs, 0).components[0],
        giveawayButtons(updated.id),
      ],
    }).catch(() => null);

    await ensureGiveawayRuntime(message.client, updated);

    return message.reply(`✅ Giveaway publicado en ${targetChannel}. ID: \`${updated.id}\``);
  }

  if (sub === 'preview') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden ver la preview.');

    const action = String(args[1] || '').toLowerCase();
    const rawUrl = action === 'set'
      ? String(args.slice(2).join(' ')).trim()
      : String(args.slice(1).join(' ')).trim();
    const attachmentUrl = extractAttachmentThumbnailUrl(message);

    let thumbnailUrl = '';
    if (rawUrl || attachmentUrl) {
      thumbnailUrl = normalizeThumbnailUrl(rawUrl) || attachmentUrl || '';
      if (!thumbnailUrl) {
        return message.reply('❌ La preview necesita una URL válida o una imagen adjunta.');
      }
    } else {
      thumbnailUrl = await resolveDefaultGiveawayThumbnail();
    }

    return message.reply(buildPreviewPayload(message.client, message.guild, thumbnailUrl));
  }

  if (sub === 'thumbnail') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden configurar la thumbnail global.');

    const action = String(args[1] || '').toLowerCase();
    if (action === 'clear' || action === 'remove' || action === 'delete') {
      await deleteSetting(GIVEAWAY_THUMBNAIL_SETTING);
      return message.reply('✅ Thumbnail global de giveaways limpiada. Ahora se usará la imagen base por defecto.');
    }

    if (action === 'show' || action === 'ver' || action === 'actual') {
      const current = await resolveDefaultGiveawayThumbnail();
      const configured = await getSetting(GIVEAWAY_THUMBNAIL_SETTING, '');
      return message.reply({
        content: configured
          ? `🖼️ Thumbnail global actual: ${configured}`
          : `🖼️ No hay thumbnail global guardada. Se usa la base por defecto: ${current}`,
      });
    }

    const rawUrl = action === 'set'
      ? String(args.slice(2).join(' ')).trim()
      : String(args.slice(1).join(' ')).trim();
    const attachmentUrl = extractAttachmentThumbnailUrl(message);
    const normalized = normalizeThumbnailUrl(rawUrl) || attachmentUrl || null;
    if (!normalized) {
      return message.reply('❌ Uso: `-gw thumbnail set <url>` o `-gw thumbnail set` adjuntando una imagen.');
    }

    await setSetting(GIVEAWAY_THUMBNAIL_SETTING, normalized);
    return message.reply('✅ Thumbnail global de giveaways guardada. Se usará en todos los giveaways nuevos.');
  }

  if (sub === 'stats') {
    const giveawayId = String(args[1] || '').trim();
    const targetId = resolveStatsTarget(message, args);
    if (!giveawayId) return message.reply('❌ Uso: `-gw stats <id> [@usuario|me]`.');

    if (!targetId) {
      const giveaway = await getGiveaway(giveawayId);
      if (!giveaway) return message.reply('❌ No encontré ese giveaway.');

      const participants = giveaway?.participants || [];
      const lines = await Promise.all(participants.slice(0, 20).map(async userId => {
        const s = await getGiveawayStats(giveawayId, userId);
        return `• <@${userId}> — mensajes: \`${s.messages}\`/${s.requiredMessages} · invites: \`${s.invites}\`/${s.requiredInvites}`;
      }));

      const container = buildContainer({
        title: '📋 Estadísticas del giveaway',
        subtitle: `## 🎁 ${giveaway.prize}`,
        fields: [
          { name: 'Participantes', value: lines.length ? lines.join('\n') : 'Aún no hay participantes.' },
        ],
        thumbnailUrl: resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(message.client),
      });

      return message.reply({
        flags: COMPONENTS_V2_FLAG,
        components: [container],
      });
    }

      const stats = await getGiveawayStats(giveawayId, targetId);
      if (!stats) return message.reply('❌ No encontré ese giveaway.');

    const embedPayload = buildContainer({
      title: '📊 Estadísticas del giveaway',
      subtitle: `## 🎁 ${stats.prize}`,
      fields: [
        { name: 'Usuario', value: `<@${targetId}>` },
        { name: 'Mensajes', value: `\`${stats.messages}\` / \`${stats.requiredMessages}\`` },
        { name: 'Invitaciones', value: `\`${stats.invites}\` / \`${stats.requiredInvites}\`` },
        { name: 'Participó', value: stats.joined ? 'Sí' : 'No' },
      ],
      thumbnailUrl: resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(message.client),
    });

    return message.reply({
      flags: COMPONENTS_V2_FLAG,
      components: [embedPayload],
    });
  }

  if (sub === 'reroll') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden rerollear giveaways.');
    const giveawayId = String(args[1] || '').trim();
    if (!giveawayId) return message.reply('❌ Uso: `-gw reroll <id>`.');
    const result = await rerollGiveaway(message.client, giveawayId);
    if (!result.ok) return message.reply(`❌ ${result.error}`);
    return message.reply(`🔁 Reroll realizado. Nuevo ganador: <@${result.winner}>`);
  }

  if (sub === 'stop') {
    const canUse = isAdminOrStaff(message.member, message.guild.id);
    if (!canUse) return message.reply('❌ Solo administradores o staff pueden detener giveaways.');
    const giveawayId = String(args[1] || '').trim();
    if (!giveawayId) return message.reply('❌ Uso: `-gw stop <id>`.');
    const result = await stopGiveaway(message.client, giveawayId);
    if (!result.ok) return message.reply(`❌ ${result.error}`);
    return message.reply('🛑 Giveaway detenido.');
  }

  return message.reply({
    flags: COMPONENTS_V2_FLAG,
    components: [buildHelpPayload(message.client, message.guild).components[0]],
  });
}

function buildSetupModal() {
  return new ModalBuilder()
    .setCustomId('gw_setup_modal')
    .setTitle('Configurar Giveaway')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_prize')
          .setLabel('Premio')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_duration')
          .setLabel('Duración (ej. 1h, 1d)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(20)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_messages')
          .setLabel('Mensajes requeridos')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue('0')
          .setMaxLength(6)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_invites')
          .setLabel('Invitaciones requeridas')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue('0')
          .setMaxLength(6)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_channel')
          .setLabel('ID del canal destino')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(32)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('gw_thumbnail')
          .setLabel('Thumbnail (URL opcional)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('https://...')
          .setMaxLength(400)
      ),
    );
}

async function createGiveawayFromModal(interaction) {
  const canUse = isAdminOrStaff(interaction.member, interaction.guild.id);
  if (!canUse) {
    return interaction.reply({ content: '❌ Solo administradores o staff pueden crear giveaways.', ephemeral: true });
  }

  const prize = interaction.fields.getTextInputValue('gw_prize')?.trim();
  const durationText = interaction.fields.getTextInputValue('gw_duration')?.trim();
  const messagesRequired = Math.max(0, Number(interaction.fields.getTextInputValue('gw_messages')) || 0);
  const invitesRequired = Math.max(0, Number(interaction.fields.getTextInputValue('gw_invites')) || 0);
  const targetChannelId = interaction.fields.getTextInputValue('gw_channel')?.trim();
  const thumbnailInput = interaction.fields.getTextInputValue('gw_thumbnail')?.trim();

  if (!prize || !durationText || !targetChannelId) {
    return interaction.reply({ content: '❌ Faltan datos para crear el giveaway.', ephemeral: true });
  }

  const thumbnailUrl = normalizeThumbnailUrl(thumbnailInput);
  if (thumbnailUrl === null) {
    return interaction.reply({ content: '❌ La thumbnail debe ser una URL válida http/https o dejarse vacía.', ephemeral: true });
  }

  const fallbackThumbnail = await resolveDefaultGiveawayThumbnail();

  const durationMs = parseDuration(durationText);
  if (!durationMs || durationMs < 60_000) {
    return interaction.reply({ content: '❌ Duración inválida. Ejemplo: `1h`, `1d`, `30m`.', ephemeral: true });
  }

  const targetChannel = await interaction.guild.channels.fetch(targetChannelId).catch(() => null);
  if (!targetChannel?.isTextBased?.()) {
    return interaction.reply({ content: '❌ El canal destino no existe o no es de texto.', ephemeral: true });
  }

  const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe().catch(() => null);
  const canSendInChannel = targetChannel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
  if (!canSendInChannel) {
    return interaction.reply({ content: '❌ Me falta permiso para enviar mensajes en ese canal.', ephemeral: true });
  }

  if (invitesRequired > 0 && !botMember?.permissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({ content: '❌ Para rastrear invitaciones necesito el permiso `Manage Server`.', ephemeral: true });
  }

  const createdAt = Date.now();
  const endsAt = createdAt + durationMs;
  const inviteSnapshot = invitesRequired > 0 ? (await captureInviteSnapshot(interaction.guild)) || {} : {};

  const giveawayRecord = await createGiveaway({
    id: `${createdAt}-${interaction.id}`,
    guildId: interaction.guild.id,
    channelId: targetChannel.id,
    messageId: '',
    creatorId: interaction.user.id,
    creatorTag: interaction.user.tag,
    prize,
    endsAt,
    createdAt,
    requiredMessages: messagesRequired,
    requiredInvites: invitesRequired,
    winners: 1,
    thumbnailUrl: thumbnailUrl || fallbackThumbnail,
    pingType: DEFAULT_PING,
    status: 'active',
    participants: [],
    messageCounts: {},
    inviteCounts: {},
    inviteSnapshot,
    announcementChannelId: targetChannel.id,
    announcementMessageId: '',
    lastUpdatedAt: createdAt,
    rerollCount: 0,
  });

  await persistGiveawayState();

  await targetChannel.send({
    content: '@everyone 🎉 Giveaway nuevo en marcha',
    allowedMentions: { parse: ['everyone'] },
  });

  const initialPayload = buildGiveawayPayload(interaction.client, interaction.guild, giveawayRecord, durationMs, 0);
  const announceMessage = await targetChannel.send({
    flags: initialPayload.flags,
    components: [
      ...initialPayload.components,
      giveawayButtons(giveawayRecord.id),
    ],
  });

  const updated = await updateGiveaway(giveawayRecord.id, {
    messageId: announceMessage.id,
    announcementMessageId: announceMessage.id,
    announcementChannelId: targetChannel.id,
  });

  await persistGiveawayState();

  await announceMessage.edit({
    flags: COMPONENTS_V2_FLAG,
    components: [
      buildGiveawayPayload(interaction.client, interaction.guild, updated, durationMs, 0).components[0],
      giveawayButtons(updated.id),
    ],
  }).catch(() => null);

  await ensureGiveawayRuntime(interaction.client, updated);

  return interaction.reply({
    content: `✅ Giveaway publicado en ${targetChannel}. ID: \`${updated.id}\``,
    ephemeral: true,
  });
}

async function handleGiveawayInteraction(interaction) {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'gw_panel_open') {
        const canUse = isAdminOrStaff(interaction.member, interaction.guild.id);
        if (!canUse) {
          await interaction.reply({ content: '❌ Solo administradores o staff pueden abrir el panel.', ephemeral: true });
          return true;
        }

        await interaction.reply({
          embeds: [buildQuickGuideEmbed(interaction.client, interaction.guild)],
          ephemeral: true,
        });
        return true;
      }

      if (interaction.customId.startsWith('gw_join:')) {
        const giveawayId = interaction.customId.split(':')[1];
        const giveaway = await getGiveaway(giveawayId);
        if (!giveaway || giveaway.status !== 'active') {
          await interaction.reply({ content: '❌ Ese giveaway ya no está activo.', ephemeral: true });
          return true;
        }

        if (await isGiveawayBanned(giveawayId, interaction.user.id)) {
          await interaction.reply({ content: '❌ Estás baneado de este giveaway.', ephemeral: true });
          return true;
        }

        const alreadyJoined = Array.isArray(giveaway.participants)
          && giveaway.participants.map(String).includes(String(interaction.user.id));
        if (alreadyJoined) {
          await interaction.reply({ content: 'ℹ️ Ya estás dentro de la giveaway.', ephemeral: true });
          return true;
        }

        const stats = await getGiveawayStats(giveawayId, interaction.user.id);
        if (!stats) {
          await interaction.reply({ content: '❌ No pude verificar tus estadísticas.', ephemeral: true });
          return true;
        }

        if (stats.messages < stats.requiredMessages || stats.invites < stats.requiredInvites) {
          const missing = [];
          if (stats.messages < stats.requiredMessages) {
            missing.push(`mensajes: \`${stats.messages}\`/\`${stats.requiredMessages}\``);
          }
          if (stats.invites < stats.requiredInvites) {
            missing.push(`invitaciones: \`${stats.invites}\`/\`${stats.requiredInvites}\``);
          }

          await interaction.reply({
            content: `❌ No cumplís los requisitos para entrar: ${missing.join(' · ')}.`,
            ephemeral: true,
          });
          return true;
        }

        const updatedGiveaway = await addParticipant(giveawayId, interaction.user.id);
        if (!updatedGiveaway) {
          await interaction.reply({ content: '❌ No pude registrarte en el giveaway.', ephemeral: true });
          return true;
        }

        const livePayload = buildGiveawayPayload(interaction.client, interaction.guild, updatedGiveaway, Math.max(0, updatedGiveaway.endsAt - Date.now()), getParticipantCount(updatedGiveaway));
        await interaction.message.edit({
          flags: livePayload.flags,
          components: [
            livePayload.components[0],
            giveawayButtons(updatedGiveaway.id),
          ],
        }).catch(() => null);

        await interaction.reply({ content: '✅ Te registré en el giveaway.', ephemeral: true });
        return true;
      }

      if (interaction.customId.startsWith('gw_stats:')) {
        const giveawayId = interaction.customId.split(':')[1];
        const giveaway = await getGiveaway(giveawayId);
        if (!giveaway) {
          await interaction.reply({ content: '❌ No encontré ese giveaway.', ephemeral: true });
          return true;
        }

        const stats = await getGiveawayStats(giveawayId, interaction.user.id);
        const container = buildContainer({
          title: '📊 Mis estadísticas',
          subtitle: `## 🎁 ${giveaway.prize}`,
          fields: [
            { name: 'Mensajes', value: `\`${stats.messages}\` / \`${stats.requiredMessages}\`` },
            { name: 'Invitaciones', value: `\`${stats.invites}\` / \`${stats.requiredInvites}\`` },
            { name: 'Participante', value: stats.joined ? 'Sí' : 'No' },
          ],
          thumbnailUrl: resolveThumbnail(giveaway.thumbnailUrl) || getFallbackThumbnail(interaction.client),
        });

        await interaction.reply({
          flags: COMPONENTS_V2_FLAG,
          components: [container],
          ephemeral: true,
        });
        return true;
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'gw_setup_modal') {
        await createGiveawayFromModal(interaction);
        return true;
      }
    }
  } catch (error) {
    console.error('[giveaway] interaction error', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ Ocurrió un error en el sistema de giveaways.', ephemeral: true }).catch(() => null);
    }
    return true;
  }

  return false;
}

async function resumeGiveaways(client) {
  const active = [];
  // load through active giveaways by guild because store is async
  // collect all guild ids from database indirectly via getActiveGiveawaysByGuild callers would be expensive,
  // so we scan database through getDatabase here if present.
  try {
    const { ensureDatabase, getDatabase } = require('./giveawayStore');
    await ensureDatabase();
    const database = getDatabase();
    const giveaways = database.giveaways || {};
    for (const giveaway of Object.values(giveaways)) {
      if (giveaway.status !== 'active') continue;
      active.push(giveaway);
    }
  } catch (error) {
    console.error('[giveaway] resume scan failed', error);
  }

  for (const giveaway of active) {
    if (giveaway.endsAt <= Date.now()) {
      await finalizeGiveaway(client, giveaway.id, 'auto').catch(() => null);
    } else {
      await ensureGiveawayRuntime(client, giveaway);
    }
  }
}

module.exports = {
  COMPONENTS_V2_FLAG,
  buildHelpPayload,
  buildPanelPayload,
  handleGiveawayPrefixCommand,
  handleGiveawayInteraction,
  handleGiveawayMessage,
  handleGiveawayMemberJoin,
  resumeGiveaways,
  publishGiveaway,
  finalizeGiveaway,
  rerollGiveaway,
  stopGiveaway,
};

const { PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const { joinAndStay } = require('../utils/voiceManager');

module.exports = {
  name: 'join',
  help: {
    purpose: 'Hace que el bot se una a un canal de voz (por ID, índice o tu canal actual) y se mantenga conectado.',
    category: '🛡️ Moderación',
    aliases: ['vcjoin'],
    usage: ['-join', '-join <channelId>', '-join vc', '-join vc <index>'],
  },
  async execute(message, args) {
    const sub = (args?.[0] || '').toLowerCase();

    const COLORS = { ok: 0x57F287, err: 0xED4245, info: 0xFEE75C };
    const makeEmbed = (opts = {}) => {
      const eb = new EmbedBuilder();
      eb.setColor(opts.color || COLORS.info);
      if (opts.title) eb.setTitle(opts.title);
      if (opts.description) eb.setDescription(opts.description);
      if (opts.footer) eb.setFooter({ text: opts.footer });
      return eb;
    };

    if (sub === 'help' || sub === 'ayuda') {
      const embed = makeEmbed({
        title: '📖 Uso de -join',
        description: ['`-join` → Me uno a tu canal de voz actual y me mantengo conectado.', '`-join <channelId>` → Me uno al canal con ese ID.', '`-join vc` → Lista canales de voz con índices.', '`-join vc <index>` → Me uno al canal indicado por índice.'].join('\n'),
        color: COLORS.info,
      });
      return message.reply({ embeds: [embed] });
    }

    // Helper: collect voice channels in the guild
    const voiceChannels = message.guild.channels.cache
      .filter(c => c && (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice))
      .sort((a, b) => (a.position || 0) - (b.position || 0));

    // Show list of voice channels with their IDs
    if (sub === 'vc' || sub === 'vcs' || sub === 'canales' || sub === 'list') {
      if (!voiceChannels.size) {
        const embed = makeEmbed({ description: '⚠️ No encontré canales de voz en este servidor.', color: COLORS.err });
        return message.reply({ embeds: [embed] });
      }

      const lines = [];
      let i = 0;
      for (const ch of voiceChannels.values()) {
        i += 1;
        lines.push(`**${i}.** ${ch.name} — \`${ch.id}\` (${ch.members?.size || 0} usuarios)`);
        if (lines.length >= 25) break;
      }

      const embed = makeEmbed({
        title: `🔊 Canales de voz (${voiceChannels.size})`,
        description: lines.join('\n'),
        footer: 'Usá `-join <channelId>` o `-join vc <index>`',
        color: COLORS.info,
      });

      return message.reply({ embeds: [embed] });
    }

    // Determine target channel: priority -> explicit ID in first arg, vc <index>, else user's channel
    let targetChannel = null;

    // case: -join vc <index>
    if (sub === 'vc' && args?.[1]) {
      const idx = parseInt(args[1], 10);
      if (Number.isInteger(idx) && idx > 0 && idx <= voiceChannels.size) {
        targetChannel = Array.from(voiceChannels.values())[idx - 1];
      } else {
        const embed = makeEmbed({ description: '❌ Índice inválido. Usá `-join vc` para ver la lista y sus índices.', color: COLORS.err });
        return message.reply({ embeds: [embed] });
      }
    }

    // case: -join <channelId>
    if (!targetChannel && sub) {
      // if sub looks like an ID (17-19 digits) try to fetch by id
      const maybeId = args[0];
      if (/^\d{17,19}$/.test(maybeId)) {
        targetChannel = message.guild.channels.cache.get(maybeId) || await message.guild.channels.fetch(maybeId).catch(() => null);
        if (targetChannel && !(targetChannel.type === ChannelType.GuildVoice || targetChannel.type === ChannelType.GuildStageVoice)) {
          targetChannel = null;
        }
        if (!targetChannel) {
          const embed = makeEmbed({ description: `❌ No encontré un canal de voz con ID \`${maybeId}\`.`, color: COLORS.err });
          return message.reply({ embeds: [embed] });
        }
      }
    }

    // fallback: user's current voice channel
    if (!targetChannel) {
      targetChannel = message.member?.voice?.channel;
      if (!targetChannel) {
        const embed = makeEmbed({ description: '❌ Tenés que estar en un canal de voz para usar `-join` sin especificar un canal, o usá `-join vc` para ver los canales disponibles.', color: COLORS.err });
        return message.reply({ embeds: [embed] });
      }
    }

    // Check bot permissions for the target channel
    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const permissions = targetChannel.permissionsFor(botMember || message.guild.members.me || message.client.user);
    if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.Connect)) {
      const embed = makeEmbed({ description: '❌ No tengo permisos para entrar a ese canal. Necesito `View Channel` y `Connect`.', color: COLORS.err });
      return message.reply({ embeds: [embed] });
    }

    try {
      await joinAndStay(targetChannel);
      const embed = makeEmbed({ description: `✅ Me uní a **${targetChannel.name}** y voy a intentar mantenerme conectado.`, color: COLORS.ok });
      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error en -join:', error);
      const embed = makeEmbed({ description: `❌ No pude unirme al canal de voz. Error: **${error?.message || 'desconocido'}**`, color: COLORS.err });
      return message.reply({ embeds: [embed] });
    }
  },
};

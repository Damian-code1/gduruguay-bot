const { EmbedBuilder } = require('discord.js');
const { startLoop, stopLoop, getState } = require('../utils/anilistRecommender');

module.exports = {
  name: 'anisetup',
  aliases: ['anirecommend', 'anirec'],
  help: {
    purpose: 'Configura recomendaciones automáticas de anime (solo staff).',
    category: '🔧 Admin',
    usage: '-anisetup <intervalo_en_minutos>',
  },
  async execute(message, args) {
    // Require manage guild or administrator
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    if (!args || args.length === 0) {
      return message.reply('Uso: `-anisetup <intervalo> [#canal|channelId]` — ejemplos: `-anisetup 1m`, `-anisetup 1mo #recomendaciones`');
    }

    const rawInterval = String(args[0] || '').trim();
    const channelArg = args[1] ? args.slice(1).join(' ').trim() : null;

    function parseIntervalToMinutes(input) {
      const v = String(input || '').trim().toLowerCase();
      if (!v) return null;
      // match number + unit (unit optional)
      const m = v.match(/^([0-9]+)\s*([a-z]+)?$/);
      if (!m) return null;
      const num = Number(m[1]);
      const unit = m[2] || 'm';
      if (!Number.isFinite(num) || num <= 0) return null;

      // units: s (seconds), m (minutes), h hours, d days, w weeks, mo months (~30d), a or y years (~365d)
      if (unit === 's') return Math.max(1, Math.floor(num / 60));
      if (unit === 'm') return num;
      if (unit === 'h') return num * 60;
      if (unit === 'd') return num * 60 * 24;
      if (unit === 'w') return num * 60 * 24 * 7;
      if (unit === 'mo') return num * 60 * 24 * 30;
      if (unit === 'a' || unit === 'y') return num * 60 * 24 * 365;
      // fallback: treat as minutes
      return num;
    }

    const minutes = parseIntervalToMinutes(rawInterval);
    if (!minutes || !Number.isFinite(minutes) || minutes < 1) {
      return message.reply('Intervalo inválido. Usa unidades: `s` `m` `h` `d` `w` `mo` `a` (ej: `1m`, `1mo`, `1a`).');
    }

    // resolve channel if provided
    let targetChannelId = null;
    if (channelArg) {
      // channel mention <#id> or raw id
      const mentionMatch = channelArg.match(/^<#(\d+)>$/);
      const idMatch = channelArg.match(/^(\d{17,19})$/);
      if (mentionMatch) targetChannelId = mentionMatch[1];
      else if (idMatch) targetChannelId = idMatch[1];
      else {
        // try to find channel by name in the guild
        const found = message.guild.channels.cache.find((c) => c.name === channelArg || `<#${c.id}>` === channelArg);
        if (found) targetChannelId = found.id;
      }
    }

    // validate channel permissions if provided
    if (targetChannelId) {
      const ch = await message.client.channels.fetch(targetChannelId).catch(() => null);
      if (!ch) return message.reply('Canal no encontrado. Usa mención o ID.');
      const botPerms = ch.permissionsFor ? ch.permissionsFor(message.client.user) : null;
      if (botPerms && !botPerms.has('SendMessages')) {
        return message.reply('El bot no tiene permiso para enviar mensajes en ese canal.');
      }
    }

    // start loop with optional channel
    startLoop(message.client, Math.floor(minutes), targetChannelId || undefined);

    const embed = new EmbedBuilder().setColor(0x23272A).setTitle('✅ Recomendaciones activadas').setDescription(`Intervalo: **${Math.floor(minutes)}** minutos\nCanal destino: **${targetChannelId || '1502203819293937664 (por defecto)'}**`);
    return message.reply({ embeds: [embed] });
  },
};

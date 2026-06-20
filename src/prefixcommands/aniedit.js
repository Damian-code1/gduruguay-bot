const { EmbedBuilder } = require('discord.js');
const { startLoop, getState } = require('../utils/anilistRecommender');

module.exports = {
  name: 'aniedit',
  aliases: ['anieditar', 'anireconfig'],
  help: {
    purpose: 'Edita la configuración del recommender (intervalo y/o canal).',
    category: '🔧 Admin',
    usage: '-aniedit <intervalo|#canal|channelId> [otro]'
  },
  async execute(message, args) {
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    if (!args || args.length === 0) {
      return message.reply('Uso: `-aniedit <intervalo|#canal|channelId> [otro]` — ejemplos: `-aniedit 2h`, `-aniedit #recs`, `-aniedit 30m #recs`');
    }

    function parseIntervalToMinutes(input) {
      const v = String(input || '').trim().toLowerCase();
      if (!v) return null;
      const m = v.match(/^([0-9]+)\s*([a-z]+)?$/);
      if (!m) return null;
      const num = Number(m[1]);
      const unit = m[2] || 'm';
      if (!Number.isFinite(num) || num <= 0) return null;
      if (unit === 's') return Math.max(1, Math.floor(num / 60));
      if (unit === 'm') return num;
      if (unit === 'h') return num * 60;
      if (unit === 'd') return num * 60 * 24;
      if (unit === 'w') return num * 60 * 24 * 7;
      if (unit === 'mo') return num * 60 * 24 * 30;
      if (unit === 'a' || unit === 'y') return num * 60 * 24 * 365;
      return num;
    }

    // flexible parsing: look for an interval token and a channel token in args
    let foundInterval = null;
    let foundChannelId = null;

    for (const token of args) {
      const t = String(token || '').trim();
      // channel mention
      const mention = t.match(/^<#(\d{17,19})>$/);
      const idOnly = t.match(/^(\d{17,19})$/);
      if (mention) {
        foundChannelId = mention[1];
        continue;
      }
      if (idOnly) {
        foundChannelId = idOnly[1];
        continue;
      }

      // try parse interval
      const minutes = parseIntervalToMinutes(t);
      if (minutes) {
        foundInterval = minutes;
        continue;
      }

      // maybe channel name: try find in guild
      const found = message.guild.channels.cache.find((c) => c.name === t || `<#${c.id}>` === t);
      if (found) foundChannelId = found.id;
    }

    if (!foundInterval && !foundChannelId) {
      return message.reply('No se reconoció intervalo ni canal. Usa formato `30m`, `1h`, `#canal` o ID.');
    }

    // if channel provided, validate bot send permission
    if (foundChannelId) {
      const ch = await message.client.channels.fetch(foundChannelId).catch(() => null);
      if (!ch) return message.reply('Canal no encontrado. Usa mención o ID.');
      const botPerms = ch.permissionsFor ? ch.permissionsFor(message.client.user) : null;
      if (botPerms && !botPerms.has('SendMessages')) return message.reply('El bot no tiene permiso para enviar mensajes en ese canal.');
    }

    // get current state to fill missing values
    const state = getState ? getState() : {};
    const currentInterval = Number(state.intervalMinutes || 60);
    const currentChannel = state.channelId || '1502203819293937664';

    const newInterval = foundInterval || currentInterval;
    const newChannel = foundChannelId || currentChannel;

    // apply by restarting loop with new params
    startLoop(message.client, Math.floor(newInterval), newChannel);

    const embed = new EmbedBuilder().setColor(0x23272A).setTitle('✅ Recomendaciones actualizadas').setDescription(`Intervalo: **${Math.floor(newInterval)}** minutos\nCanal destino: **${newChannel}**`);
    return message.reply({ embeds: [embed] });
  },
};

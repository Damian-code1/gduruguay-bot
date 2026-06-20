const { EmbedBuilder } = require('discord.js');
const { getState } = require('../utils/anilistRecommender');

function fmtMinutes(mins) {
  if (!Number.isFinite(mins)) return String(mins);
  if (mins < 60) return `${mins} minutos`;
  if (mins < 60 * 24) return `${(mins / 60).toFixed(1)} horas`;
  if (mins < 60 * 24 * 30) return `${(mins / (60 * 24)).toFixed(1)} días`;
  return `${(mins / (60 * 24 * 30)).toFixed(1)} meses`;
}

function formatLastRun(lastRunAt) {
  if (!lastRunAt) return 'Nunca';

  const timestamp = Number(lastRunAt);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 'Nunca';

  const date = new Date(timestamp);
  const abs = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'full',
    timeStyle: 'medium',
  }).format(date);

  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  let relative = 'hace unos segundos';
  if (diffMinutes >= 60 * 24) {
    relative = `hace ${Math.round(diffMinutes / (60 * 24))} día(s)`;
  } else if (diffMinutes >= 60) {
    relative = `hace ${Math.round(diffMinutes / 60)} hora(s)`;
  } else if (diffMinutes >= 1) {
    relative = `hace ${diffMinutes} minuto(s)`;
  }

  return `${abs} (${relative})`;
}

module.exports = {
  name: 'anistatus',
  aliases: ['anistatus', 'anirecstatus'],
  help: {
    purpose: 'Muestra estado del sistema de recomendaciones AniList.',
    category: '🔧 Admin',
    usage: '-anistatus',
  },
  async execute(message) {
    if (!message.member.permissions.has('ManageGuild') && !message.member.permissions.has('Administrator')) {
      return message.reply({ content: '❌ Solo el staff puede usar este comando.', ephemeral: true });
    }

    const state = getState() || {};
    const enabled = !!state.enabled;
    const interval = Number(state.intervalMinutes) || 0;
    const channelId = state.channelId || '1502203819293937664 (por defecto)';
    const lastRun = formatLastRun(state.lastRunAt);

    const embed = new EmbedBuilder()
      .setColor(0x23272A)
      .setTitle('Estado de Recomendaciones AniList')
      .addFields(
        { name: 'Estado', value: enabled ? '🟢 Activo' : '🔴 Detenido', inline: true },
        { name: 'Intervalo', value: fmtMinutes(interval), inline: true },
        { name: 'Canal destino', value: String(channelId), inline: true },
        { name: 'Última ejecución', value: lastRun, inline: false }
      );

    return message.reply({ embeds: [embed] });
  },
};

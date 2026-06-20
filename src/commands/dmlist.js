const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getRecentDmLogs } = require('../utils/dmLogStore');

const OWNER_ID = '1407737422732853331';

function truncate(text, max = 120) {
  const value = String(text || '').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value || '—';
}

module.exports = {
  help: {
    purpose: 'Muestra los últimos DMs enviados por el bot.',
    category: '📦 Otros',
    visibleToUserIds: [OWNER_ID],
  },
  data: new SlashCommandBuilder()
    .setName('dmlist')
    .setDescription('Muestra los últimos DMs enviados por el bot')
    .setDMPermission(false),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Este comando es solo para el dueño del bot.', ephemeral: true });
    }

    const logs = getRecentDmLogs(20).reverse();
    if (!logs.length) {
      return interaction.reply({ content: 'ℹ️ No hay mensajes privados registrados todavía.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
      .setTitle('📨 Últimos DMs enviados')
      .setColor(0x5865F2)
      .setDescription(
        logs.map((log, index) => {
          const when = log.createdAt ? `<t:${Math.floor(Number(log.createdAt) / 1000)}:R>` : 'desconocido';
          const target = log.targetId ? `<@${log.targetId}>` : (log.targetTag || 'usuario desconocido');
          return `**${index + 1}.** ${target} · ${when}\n> ${truncate(log.content)}`;
        }).join('\n\n')
      )
      .addFields(
        { name: 'Total mostrado', value: `${logs.length}`, inline: true },
        { name: 'Filtro', value: 'Últimos 20 mensajes', inline: true },
      )
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};

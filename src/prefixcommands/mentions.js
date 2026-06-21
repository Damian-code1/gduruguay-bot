const { EmbedBuilder } = require('discord.js');
const { getLastAfkMentions } = require('../utils/afkStore');

module.exports = {
  name: 'mentions',
  help: {
    purpose: 'Muestra las menciones de tu último AFK.',
    category: '📊 Información',
  },
  async execute(message) {
    const record = await getLastAfkMentions(message.guild.id, message.author.id);

    if (!record) {
      return message.reply('❌ No tenés menciones guardadas de tu último AFK.');
    }

    const mentions = Array.isArray(record.mentions) ? record.mentions : [];
    const count = Number(record.mentionCount || mentions.length || 0);

    if (!mentions.length) {
      return message.reply(`ℹ️ Tu último AFK no tiene menciones guardadas. Total: **${count}**.`);
    }

    const lines = mentions.slice(-20).map((mention, index) => {
      const when = mention.timestamp ? `<t:${Math.floor(Number(mention.timestamp) / 1000)}:R>` : 'desconocido';
      const channel = mention.channelId ? `<#${mention.channelId}>` : (mention.channelName || 'canal desconocido');
      const content = String(mention.content || '').trim();
      const snippet = content.length > 120 ? `${content.slice(0, 120)}…` : content;
      return `**${index + 1}.** <@${mention.userId}> en ${channel} · ${when}${snippet ? `\n> ${snippet}` : ''}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('📎 Menciones de tu último AFK')
      .setDescription(lines.join('\n\n'))
      .addFields(
        { name: 'Total', value: `**${count}**`, inline: true },
        { name: 'Expira', value: record.expiresAt ? `<t:${Math.floor(Number(record.expiresAt) / 1000)}:R>` : 'No disponible', inline: true },
      )
      .setColor(0x5865F2)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

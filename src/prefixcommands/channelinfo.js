const { ChannelType, EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'channelinfo',
  help: {
    purpose: 'Muestra información de un canal.',
    category: '📊 Información',
  },
  async execute(message, args) {
    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(args[0]) || message.channel;

    const typeName = Object.entries(ChannelType).find(([, value]) => value === channel.type)?.[0] || String(channel.type);

    const embed = new EmbedBuilder()
      .setTitle(`📺 Info de canal: ${channel.name}`)
      .setColor(0x5865F2)
      .addFields(
        { name: 'ID', value: channel.id, inline: true },
        { name: 'Tipo', value: typeName, inline: true },
        { name: 'NSFW', value: channel.nsfw ? 'Sí' : 'No', inline: true },
        { name: 'Creado', value: `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'serverstats',
  help: {
    purpose: 'Muestra estadísticas generales del servidor.',
    category: '📊 Información',
  },
  async execute(message) {
    const guild = message.guild;

    const totalMembers = guild.memberCount;
    const bots = guild.members.cache.filter(m => m.user?.bot).size;
    const humans = Math.max(0, totalMembers - bots);

    const textChannels = guild.channels.cache.filter(c => c.isTextBased()).size;
    const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased()).size;

    const embed = new EmbedBuilder()
      .setTitle(`📈 Estadísticas de ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .addFields(
        { name: 'Miembros', value: `Total: **${totalMembers}**\nHumanos: **${humans}**\nBots: **${bots}**`, inline: true },
        { name: 'Canales', value: `Texto: **${textChannels}**\nVoz: **${voiceChannels}**`, inline: true },
        { name: 'Boosts', value: `Nivel: **${guild.premiumTier}**\nBoosts: **${guild.premiumSubscriptionCount || 0}**`, inline: true },
        { name: 'Creado', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setColor(0x5865F2)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

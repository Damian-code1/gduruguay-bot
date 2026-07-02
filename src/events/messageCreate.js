'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getAfk, clearAfk } = require('../utils/afkStore');

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    // Si el autor estaba AFK, se le quita el estado y se avisa (mensaje normal, pinguea).
    const authorAfk = await getAfk(message.guild.id, message.author.id);
    if (authorAfk) {
      await clearAfk(message.guild.id, message.author.id);
      const embed = new EmbedBuilder()
        .setColor(config.colors.info)
        .setDescription(`👋 Bienvenido de vuelta <@${message.author.id}>, te quité el estado AFK.`);
      await message.channel.send({ embeds: [embed] }).catch(() => null);
    }

    // Si se menciona a alguien AFK, avisar (mensaje normal, pinguea).
    if (message.mentions.users.size) {
      for (const [, user] of message.mentions.users) {
        if (user.bot) continue;
        const afk = await getAfk(message.guild.id, user.id);
        if (afk) {
          const embed = new EmbedBuilder()
            .setColor(config.colors.info)
            .setDescription(`💤 <@${user.id}> está AFK: ${afk.reason}`);
          await message.channel.send({ embeds: [embed] }).catch(() => null);
        }
      }
    }
  },
};

'use strict';

const { EmbedBuilder } = require('discord.js');

/**
 * Envía un DM informativo al usuario afectado por una acción de moderación.
 * Nunca lanza: si falla (DMs cerrados, etc.) simplemente no hace nada.
 * @param {import('discord.js').User} user
 * @param {{title: string, color: number, description: string, fields?: Array<{name:string,value:string,inline?:boolean}>, moderatorTag: string, guildName: string}} data
 */
async function sendModerationDm(user, data) {
  try {
    const embed = new EmbedBuilder()
      .setTitle(data.title)
      .setColor(data.color)
      .setDescription(data.description)
      .addFields(data.fields || [])
      .addFields(
        { name: 'Servidor', value: data.guildName, inline: true },
        { name: 'Moderador', value: data.moderatorTag, inline: true },
      )
      .setTimestamp();

    await user.send({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

module.exports = { sendModerationDm };

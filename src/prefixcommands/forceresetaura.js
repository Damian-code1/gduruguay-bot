const { PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { setCooldown } = require('../utils/economyStore');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

module.exports = {
  name: 'forceresetaura',
  aliases: ['frcdaura', 'resetaura'],
  help: {
    purpose: 'Resetea el cooldown de aura para testing.',
    category: '🎮 Diversión',
    adminOnly: true,
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const rawTarget = args?.[0];
    const target = rawTarget ? await resolveUserTarget(message, rawTarget) : message.author;

    if (!target) {
      return message.reply('❌ Uso: -forceresetaura [@user|userId]');
    }

    const isSelf = target.id === message.author.id;
    const canResetOthers = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!isSelf && !canResetOthers) {
      return message.reply('❌ Solo podés resetear tu propio cooldown de aura.');
    }

    setCooldown(guildId, target.id, 'aura_daily', 0);

    return message.reply(`✅ Cooldown de aura reseteado para <@${target.id}>.`);
  },
};
'use strict';

const { EmbedBuilder } = require('discord.js');
const config = require('../config');
const { getAfk, clearAfk } = require('../utils/afkStore');
const { getDepartmentChannel, findDepartment } = require('../utils/departmentStore');
const { assignDepartmentToMember } = require('../utils/departmentAssign');

const DEPT_COOLDOWN_MS = 3000;
const deptCooldowns = new Map();

const ASSIGN_FAIL_MESSAGES = {
  not_configured: null, // el mensaje no matcheó ningún departamento válido -> se ignora en silencio
  role_missing: '⚠️ El rol de ese departamento fue eliminado del servidor. Avisale a un admin.',
  not_manageable: '⚠️ No tengo permisos para asignarte ese rol (jerarquía).',
  hierarchy: '⚠️ El rol de ese departamento está por encima del mío, no lo puedo asignar. Avisale a un admin.',
};

async function handleDepartmentChannel(message) {
  const channelId = await getDepartmentChannel(message.guild.id);
  if (!channelId || message.channelId !== channelId) return false;

  const dept = findDepartment(message.content);
  if (!dept) return false; // no matcheó ningún departamento, se ignora sin ensuciar el canal

  const now = Date.now();
  const last = deptCooldowns.get(message.author.id) || 0;
  if (now - last < DEPT_COOLDOWN_MS) {
    return true; // en cooldown, se ignora en silencio para no ensuciar el canal
  }
  deptCooldowns.set(message.author.id, now);

  const result = await assignDepartmentToMember(message.member, dept.name);

  if (!result.ok) {
    const text = ASSIGN_FAIL_MESSAGES[result.reason];
    if (text) await message.reply({ content: text }).catch(() => null);
    return true;
  }

  if (result.alreadyHad) {
    await message.reply({ content: `📍 Ya tenías el departamento **${dept.name}**.` }).catch(() => null);
    return true;
  }

  const swapText = result.previousRoleId ? ` (se removió tu departamento anterior)` : '';
  await message.reply({ content: `✅ Te asigné el departamento **${dept.name}**${swapText}.` }).catch(() => null);
  return true;
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;

    try {
      const handled = await handleDepartmentChannel(message);
      if (handled) return; // no seguir con AFK si el mensaje era del canal de departamentos
    } catch (err) {
      console.error('Error en auto-detección de departamento:', err);
    }

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

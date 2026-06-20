const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');
const { ensureMuteRoleConfiguration } = require('../utils/muteRoleStore');
const { clearMuteTimer } = require('../utils/muteRuntime');
const { sendModerationDm } = require('../utils/moderationDm');
const fs = require('fs');
const path = require('path');

const logsPath = path.join(__dirname, '../logs.json');

function appendLog(data) {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

module.exports = {
  name: 'unmute',
  aliases: ['uto', 'untimeout'],
  help: {
    purpose: 'Quita el mute activo de un usuario.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const target = await resolveMemberTarget(message, args[0]);
    const objetivo = target?.member;
    if (!objetivo) {
      return message.reply('❌ Uso: `-unmute @usuario|userId`.');
    }

    if (objetivo.id === message.author.id) {
      return message.reply('❌ No te podés desmutear a vos mismo.');
    }

    const muteRoleResult = await ensureMuteRoleConfiguration(message.guild, {
      createIfMissing: false,
      syncChannels: false,
      cleanupDuplicates: false,
      syncReason: 'Mute role sync (unmute)',
      createReason: `Mute role recovered by ${message.author.tag}`,
    });

    if (!muteRoleResult.role) {
      return message.reply('❌ Primero creá el rol de mute con `-mute role create`.');
    }

    if (!objetivo.roles.cache.has(muteRoleResult.role.id)) {
      return message.reply(`❌ <@${objetivo.id}> no está muteado.`);
    }

    await objetivo.roles.remove(muteRoleResult.role.id, `Unmute by ${message.author.tag}`).catch(error => {
      console.error('Error removiendo mute role:', error);
      throw error;
    });

    await sendModerationDm(objetivo.user, {
      title: '✅ Has sido desmuteado',
      color: 0x2ECC71,
      description: 'Se removió el mute de tu cuenta.',
      fields: [
        { name: 'Razón', value: 'Desmuteado manualmente', inline: false },
      ],
      moderator: `${message.author.tag}`,
      guild: `${message.guild.name}`,
    }).catch(() => null);

    clearMuteTimer(message.guild.id, objetivo.id);

    appendLog({
      tipo: 'unmute',
      origen: 'bot',
      usuarioId: objetivo.id,
      usuarioNombre: objetivo.user.username,
      moderadorId: message.author.id,
      moderadorNombre: message.author.username,
      razon: 'Desmuteado manualmente',
      fecha: new Date().toISOString(),
      servidorId: message.guild.id,
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Mute removido')
          .setColor(0x2ECC71)
          .setDescription([
            `Usuario: <@${objetivo.id}>`,
            `Moderador: <@${message.author.id}>`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
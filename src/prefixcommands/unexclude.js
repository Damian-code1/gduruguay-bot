const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');

const excludePath = path.join(__dirname, '../exclude-list.json');

function readExcludes() {
  if (!fs.existsSync(excludePath)) {
    fs.writeFileSync(excludePath, JSON.stringify({}, null, 2));
  }
  return JSON.parse(fs.readFileSync(excludePath, 'utf8'));
}

function writeExcludes(data) {
  fs.writeFileSync(excludePath, JSON.stringify(data, null, 2));
}

function removeExclude(guildId, channelId, userId) {
  const data = readExcludes();
  const key = `${guildId}:${channelId}`;
  if (data[key]) {
    data[key] = data[key].filter(id => id !== userId);
    if (!data[key].length) delete data[key];
  }
  writeExcludes(data);
}

module.exports = {
  name: 'unexclude',
  aliases: ['unex', 'removexclude'],
  help: {
    purpose: 'Remueve la exclusión de usuario(s) de un canal.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },

  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    if (!args.length) {
      return message.reply('Uso: -unexclude <@usuario(s)|userId> [#canal]');
    }

    // Parsear usuarios mencionados
    let targetChannel = message.channel;
    const usersToUnexclude = [];

    // Recolectar usuarios de mentions
    message.mentions.members.forEach(m => {
      if (!usersToUnexclude.includes(m.id)) {
        usersToUnexclude.push(m.id);
      }
    });

    // Recolectar usuarios de args (no channels)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('<#') || arg.startsWith('#') || /^\d{17,20}$/.test(arg)) {
        // Es probablemente un canal
        const mentioned = message.mentions.channels.first();
        if (mentioned) {
          targetChannel = mentioned;
        } else {
          const mentionMatch = arg.match(/^<#(\d{17,20})>$/);
          if (mentionMatch) {
            const ch = message.guild.channels.cache.get(mentionMatch[1]);
            if (ch) targetChannel = ch;
          } else if (/^\d{17,20}$/.test(arg)) {
            const ch = message.guild.channels.cache.get(arg);
            if (ch) targetChannel = ch;
          }
        }
      } else {
        // Intentar resolver como usuario
        const res = await resolveMemberTarget(message, arg);
        if (res && res.id && !usersToUnexclude.includes(res.id)) {
          usersToUnexclude.push(res.id);
        }
      }
    }

    if (!usersToUnexclude.length) {
      return message.reply('❌ No encontré usuarios para desexcluir.');
    }

    if (!targetChannel.isTextBased()) {
      return message.reply('❌ El canal debe ser un canal de texto.');
    }

    // Remover exclusiones
    const results = [];
    for (const userId of usersToUnexclude) {
      try {
        await targetChannel.permissionOverwrites.delete(userId, `Unexcluded by ${message.author.tag}`);
        removeExclude(message.guild.id, targetChannel.id, userId);
        results.push(`✅ <@${userId}>`);
      } catch (err) {
        console.error('Error al remover exclusión:', err);
        results.push(`❌ <@${userId}>`);
      }
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔓 Usuarios desexcluidos')
          .setColor(0x2ECC71)
          .setDescription([
            `Canal: ${targetChannel.name}`,
            `Resultados:\n${results.join('\n')}`,
            `Por: <@${message.author.id}>`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};

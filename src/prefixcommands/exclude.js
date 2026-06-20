const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');

const excludePath = path.join(__dirname, '../exclude-list.json');

function ensureFile() {
  if (!fs.existsSync(excludePath)) {
    fs.writeFileSync(excludePath, JSON.stringify({}, null, 2));
  }
}

function readExcludes() {
  ensureFile();
  return JSON.parse(fs.readFileSync(excludePath, 'utf8'));
}

function writeExcludes(data) {
  fs.writeFileSync(excludePath, JSON.stringify(data, null, 2));
}

function addExclude(guildId, channelId, userId) {
  const data = readExcludes();
  const key = `${guildId}:${channelId}`;
  if (!data[key]) data[key] = [];
  if (!data[key].includes(userId)) {
    data[key].push(userId);
  }
  writeExcludes(data);
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

function getExcludes(guildId, channelId) {
  const data = readExcludes();
  const key = `${guildId}:${channelId}`;
  return data[key] || [];
}

module.exports = {
  name: 'exclude',
  aliases: ['ex', 'excludeuser'],
  help: {
    purpose: 'Excluye usuario(s) de un canal quitándoles permisos de escribir. Soporta list y remove.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },

  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = String(args?.[0] || '').toLowerCase();

    // Subcomando: list
    if (sub === 'list') {
      let targetChannel = message.channel;
      if (args?.[1]) {
        const channelArg = args[1];
        const mentioned = message.mentions.channels.first();
        if (mentioned) {
          targetChannel = mentioned;
        } else {
          const mentionMatch = channelArg.match(/^<#(\d{17,20})>$/);
          if (mentionMatch) {
            targetChannel = message.guild.channels.cache.get(mentionMatch[1]);
          } else if (/^\d{17,20}$/.test(channelArg)) {
            targetChannel = message.guild.channels.cache.get(channelArg);
          }

          if (!targetChannel) {
            return message.reply('❌ No pude resolver el canal. Usá #mención o ID válido.');
          }
        }
      }

      const excluded = getExcludes(message.guild.id, targetChannel.id);
      if (!excluded.length) {
        return message.reply({
          embeds: [new EmbedBuilder()
            .setTitle('📋 Usuarios excluidos')
            .setColor(0x3498DB)
            .setDescription(`No hay usuarios excluidos de ${targetChannel.name}.`)],
        });
      }

      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('📋 Usuarios excluidos')
          .setColor(0x3498DB)
          .setDescription(`**${targetChannel.name}**\n\n${excluded.map((id, i) => `${i + 1}. <@${id}>`).join('\n')}`)],
      });
    }

    // Subcomando: remove
    if (sub === 'remove') {
      const userArg = args?.[1];
      if (!userArg) {
        return message.reply('Uso: -exclude remove <@usuario|userId> [#canal]');
      }

      const resolved = await resolveMemberTarget(message, userArg);
      if (!resolved || !resolved.id) {
        return message.reply('❌ No pude resolver el usuario. Usá mención o ID válido.');
      }

      let targetChannel = message.channel;
      if (args?.[2]) {
        const channelArg = args[2];
        const mentioned = message.mentions.channels.first();
        if (mentioned) {
          targetChannel = mentioned;
        } else {
          const mentionMatch = channelArg.match(/^<#(\d{17,20})>$/);
          if (mentionMatch) {
            targetChannel = message.guild.channels.cache.get(mentionMatch[1]);
          } else if (/^\d{17,20}$/.test(channelArg)) {
            targetChannel = message.guild.channels.cache.get(channelArg);
          }

          if (!targetChannel) {
            return message.reply('❌ No pude resolver el canal. Usá #mención o ID válido.');
          }
        }
      }

      try {
        await targetChannel.permissionOverwrites.delete(resolved.id, `Unexcluded by ${message.author.tag}`);
      } catch (err) {
        console.error('Error al remover exclusión:', err);
        return message.reply('❌ Error al remover exclusión.');
      }

      removeExclude(message.guild.id, targetChannel.id, resolved.id);

      return message.reply({
        embeds: [new EmbedBuilder()
          .setTitle('✅ Exclusión removida')
          .setColor(0x2ECC71)
          .setDescription([`Usuario: <@${resolved.id}>`, `Canal: ${targetChannel.name}`, `Por: <@${message.author.id}>`].join('\n'))],
      });
    }

    // Comando principal: excluir usuarios
    if (!args.length) {
      return message.reply('Uso: -exclude <@usuario(s)|userId> [#canal]\n         -exclude list [#canal]\n         -exclude remove <@usuario|userId> [#canal]');
    }

    // Parsear todos los usuarios mencionados y en args
    let targetChannel = message.channel;
    const usersToExclude = [];

    // Recolectar usuarios de mentions
    message.mentions.members.forEach(m => {
      if (!usersToExclude.includes(m.id)) {
        usersToExclude.push(m.id);
      }
    });

    // Recolectar usuarios de args (no channels)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('<#') || arg.startsWith('#') || /^\d{17,20}$/.test(arg)) {
        // Es probablemente un canal
        const channelArg = arg;
        const mentioned = message.mentions.channels.first();
        if (mentioned) {
          targetChannel = mentioned;
        } else {
          const mentionMatch = channelArg.match(/^<#(\d{17,20})>$/);
          if (mentionMatch) {
            const ch = message.guild.channels.cache.get(mentionMatch[1]);
            if (ch) targetChannel = ch;
          } else if (/^\d{17,20}$/.test(channelArg)) {
            const ch = message.guild.channels.cache.get(channelArg);
            if (ch) targetChannel = ch;
          }
        }
      } else {
        // Intentar resolver como usuario
        const res = await resolveMemberTarget(message, arg);
        if (res && res.id && !usersToExclude.includes(res.id)) {
          usersToExclude.push(res.id);
        }
      }
    }

    if (!usersToExclude.length) {
      return message.reply('❌ No encontré usuarios para excluir.');
    }

    if (!targetChannel.isTextBased()) {
      return message.reply('❌ El canal debe ser un canal de texto.');
    }

    // Aplicar exclusiones
    const results = [];
    for (const userId of usersToExclude) {
      try {
        await targetChannel.permissionOverwrites.create(
          userId,
          {
            SendMessages: false,
            SendMessagesInThreads: false,
            CreatePublicThreads: false,
            CreatePrivateThreads: false,
          },
          { reason: `Excluded by ${message.author.tag} via -exclude` }
        );
        addExclude(message.guild.id, targetChannel.id, userId);
        results.push(`✅ <@${userId}>`);
      } catch (err) {
        console.error('Error al excluir usuario:', err);
        results.push(`❌ <@${userId}>`);
      }
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🚫 Usuarios excluidos')
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

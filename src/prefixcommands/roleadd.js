const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');
const { isStaff } = require('../utils/staffRolesStore');

// Limpia caracteres especiales y emojis del inicio del nombre
function cleanRoleName(name) {
  return String(name)
    .trim()
    // Remover caracteres especiales/emojis del inicio
    .replace(/^[^\w\s]+/g, '')
    .trim()
    .toLowerCase();
}

// Resuelve rol con búsqueda flexible: menciones, IDs, nombre exacto, o parcial
function resolveRoleFlexible(message, raw) {
  const text = String(raw || '').trim();
  if (!text || !message?.guild) return null;

  // Intentar mención
  const mentioned = message.mentions?.roles?.first?.();
  if (mentioned) return mentioned;

  // Intentar ID directo
  const mentionMatch = text.match(/^<@&(\d{17,20})>$/);
  if (mentionMatch) {
    return message.guild.roles.cache.get(mentionMatch[1]) || null;
  }

  if (/^\d{17,20}$/.test(text)) {
    return message.guild.roles.cache.get(text) || null;
  }

  const cleanInput = cleanRoleName(text);

  // Búsqueda exacta (con limpieza de emojis)
  const exact = message.guild.roles.cache.find(role => cleanRoleName(role.name) === cleanInput);
  if (exact) return exact;

  // Búsqueda parcial/substring
  const partial = message.guild.roles.cache.find(role => cleanRoleName(role.name).includes(cleanInput));
  if (partial) return partial;

  return null;
}

module.exports = {
  name: 'roleadd',
  aliases: ['ra', 'addrole'],
  help: {
    purpose: 'Asigna un rol a un usuario sin necesidad de pingear.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },

  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const userArg = args?.[0];
    const roleRaw = args?.slice(1).join(' ').trim();

    if (!userArg || !roleRaw) {
      return message.reply('Uso: -roleadd <@usuario|userId> <rol nombre|@rol|rolId>');
    }

    const resolved = await resolveMemberTarget(message, userArg);
    if (!resolved || !resolved.id) {
      return message.reply('❌ No pude resolver el usuario. Usá mencion o ID válido.');
    }

    // Si no está en el servidor no se puede asignar rol
    if (!resolved.member) {
      return message.reply('❌ El usuario no está en este servidor o no se pudo obtener el miembro.');
    }

    const objetivo = resolved.member;

    const role = resolveRoleFlexible(message, roleRaw);
    if (!role) {
      return message.reply(`❌ No encontré el rol '${roleRaw}'.`);
    }

    // Permisos básicos: comprobar que el bot puede asignar el rol
    const me = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
    if (!me) {
      return message.reply('❌ No pude comprobar los permisos del bot en el servidor.');
    }

    if (role.position >= me.roles.highest.position) {
      return message.reply('❌ No puedo asignar un rol que esté igual o por encima de mi rol más alto.');
    }

    // Comprobar que el autor pueda asignar el rol (no puede asignar roles por encima suyo)
    if (message.member.roles.highest && role.position >= message.member.roles.highest.position && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ No podés asignar un rol que esté igual o por encima de tu rol más alto.');
    }

    if (objetivo.roles.cache.has(role.id)) {
      return message.reply({ embeds: [new EmbedBuilder().setTitle('ℹ️ Ya tiene el rol').setColor(0xF1C40F).setDescription(`El usuario <@${objetivo.id}> ya posee el rol ${role.name}.`)] });
    }

    try {
      await objetivo.roles.add(role.id, `Assigned by ${message.author.tag} via -roleadd`).catch(err => { throw err; });
    } catch (err) {
      console.error('Error asignando rol:', err);
      return message.reply('❌ Ocurrió un error al asignar el rol. ¿Tengo permisos para `Manage Roles`?');
    }

    return message.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('✅ Rol asignado')
        .setColor(0x2ECC71)
        .setDescription([`Usuario: <@${objetivo.id}>`, `Rol: ${role.name}`, `Por: <@${message.author.id}>`].join('\n'))
        .setTimestamp(),
    ]});
  },
};

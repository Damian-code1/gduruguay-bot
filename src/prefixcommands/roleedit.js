const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildConfig, setRolePrice, removeRolePrice } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');
const { resolveRoleColor } = require('../utils/roleColorResolver');

function parsePrice(raw) {
  const clean = String(raw || '').replace(/[,_\.\s]/g, '');
  const value = Number(clean);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseBoolean(raw) {
  const value = String(raw || '').toLowerCase().trim();
  if (['true', 'on', 'yes', 'si', '1'].includes(value)) return true;
  if (['false', 'off', 'no', '0'].includes(value)) return false;
  return null;
}

function parseArgs(args) {
  const tokens = Array.isArray(args) ? [...args] : [];
  const firstFlagIndex = tokens.findIndex(token => String(token || '').startsWith('--'));

  const roleChunk = firstFlagIndex === -1 ? tokens : tokens.slice(0, firstFlagIndex);
  const roleRaw = roleChunk.join(' ').trim();

  const options = {
    roleRaw,
    name: null,
    colorRaw: null,
    mentionable: null,
    hoist: null,
    shopPrice: null,
    shopRemove: false,
  };

  const flags = firstFlagIndex === -1 ? [] : tokens.slice(firstFlagIndex);
  for (let i = 0; i < flags.length; i++) {
    const flag = String(flags[i] || '').toLowerCase();
    const value = String(flags[i + 1] || '');

    if (flag === '--name') {
      options.name = value.trim() || null;
      i += 1;
      continue;
    }

    if (flag === '--color') {
      options.colorRaw = value.trim() || null;
      i += 1;
      continue;
    }

    if (flag === '--mentionable') {
      options.mentionable = parseBoolean(value);
      i += 1;
      continue;
    }

    if (flag === '--hoist') {
      options.hoist = parseBoolean(value);
      i += 1;
      continue;
    }

    if (flag === '--shop') {
      const normalized = value.toLowerCase().trim();
      if (['remove', 'off', 'none', 'delete'].includes(normalized)) {
        options.shopRemove = true;
      } else {
        options.shopPrice = parsePrice(value);
      }
      i += 1;
    }
  }

  return options;
}

module.exports = {
  name: 'roleedit',
  aliases: ['editrole'],
  help: {
    purpose: 'Edita propiedades de un rol (nombre, color, mentionable, hoist y shop).',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
    if (!canManage) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos').setColor(0xED4245).setDescription('Necesitas ser admin o staff para editar roles.')],
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos del bot').setColor(0xED4245).setDescription('Necesito el permiso `Manage Roles` para editar roles.')],
      });
    }

    const parsed = parseArgs(args);
    const role = resolveRoleTarget(message, parsed.roleRaw);

    if (!role) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📖 Uso: -roleedit')
            .setColor(0x5865F2)
            .setDescription([
              '`-roleedit <@rol|rolId|nombre> --name <nuevo nombre>`',
              '`-roleedit <@rol|rolId|nombre> --color <dark blue|light purple|#hex|rgb()>`',
              '`-roleedit <@rol|rolId|nombre> --mentionable <on|off> --hoist <on|off>`',
              '`-roleedit <@rol|rolId|nombre> --shop <precio>`',
              '`-roleedit <@rol|rolId|nombre> --shop remove`',
            ].join('\n')),
        ],
      });
    }

    if (role.managed) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Rol gestionado').setColor(0xED4245).setDescription('Ese rol está gestionado por una integración y no se puede editar manualmente.')],
      });
    }

    if (!role.editable) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Rol no editable').setColor(0xED4245).setDescription('No puedo editar ese rol por jerarquía/permisos del bot.')],
      });
    }

    const changes = {};
    const summary = [];

    if (parsed.name) {
      if (parsed.name.length > 100) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Nombre muy largo').setColor(0xED4245).setDescription('El nombre del rol no puede superar 100 caracteres.')],
        });
      }
      changes.name = parsed.name;
      summary.push(`Nombre: **${parsed.name}**`);
    }

    if (parsed.colorRaw !== null) {
      const resolved = resolveRoleColor(parsed.colorRaw);
      if (!resolved.ok) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Color no reconocido').setColor(0xED4245).setDescription('Usa un color como `dark blue`, `light purple`, `purple`, `#7d3cff` o `rgb(125,60,255)`.')],
        });
      }
      changes.color = resolved.hex;
      summary.push(`Color: **${resolved.hex}**`);
    }

    if (parsed.mentionable !== null) {
      changes.mentionable = parsed.mentionable;
      summary.push(`Mentionable: **${parsed.mentionable ? 'on' : 'off'}**`);
    }

    if (parsed.hoist !== null) {
      changes.hoist = parsed.hoist;
      summary.push(`Separado (hoist): **${parsed.hoist ? 'on' : 'off'}**`);
    }

    const shouldEditRole = Object.keys(changes).length > 0;
    if (!shouldEditRole && parsed.shopPrice === null && !parsed.shopRemove) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('ℹ️ Sin cambios').setColor(0x5865F2).setDescription('No indicaste nada para editar.')],
      });
    }

    try {
      if (shouldEditRole) {
        await role.edit(changes, `Rol editado por ${message.author.tag} con -roleedit`);
      }

      if (parsed.shopPrice !== null) {
        setRolePrice(guildId, role, parsed.shopPrice, message.author.id);
        const config = getGuildConfig(guildId);
        summary.push(`Shop: **${formatCurrency(parsed.shopPrice, config)}**`);
      }

      if (parsed.shopRemove) {
        const removed = removeRolePrice(guildId, role.id);
        summary.push(removed ? 'Shop: **removido**' : 'Shop: **sin cambios**');
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Rol editado')
            .setColor(0x2ECC71)
            .setDescription([
              `Rol: ${role}`,
              ...summary,
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('Error en -roleedit:', error);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Error al editar rol').setColor(0xED4245).setDescription('No pude aplicar los cambios. Revisa jerarquía/permisos del bot.')],
      });
    }
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const emoji = require('node-emoji');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildConfig, setRolePrice } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { resolveRoleColor } = require('../utils/roleColorResolver');

function parsePrice(raw) {
  const clean = String(raw || '').replace(/[,_\.\s]/g, '');
  const value = Number(clean);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

function parseRoleCreateArgs(args) {
  const tokens = Array.isArray(args) ? [...args] : [];
  let shopPrice = null;
  let colorRaw = null;

  for (let i = 0; i < tokens.length; i++) {
    const current = String(tokens[i] || '').toLowerCase();
    if (current === '--shop' || current === '-s') {
      shopPrice = parsePrice(tokens[i + 1]);
      tokens.splice(i, 2);
      i -= 1;
      continue;
    }

    if (current === '--color' || current === '-c') {
      colorRaw = String(tokens[i + 1] || '').trim();
      tokens.splice(i, 2);
      i -= 1;
    }
  }

  const rawName = tokens.join(' ').trim();
  const roleName = emoji.emojify(rawName);

  return { rawName, roleName, shopPrice, colorRaw };
}

module.exports = {
  name: 'rolecreate',
  aliases: ['createrole'],
  help: {
    purpose: 'Crea un rol con soporte :emoji: y opcionalmente lo agrega a la shop.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!canManage) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos').setColor(0xED4245).setDescription('Necesitas ser admin o staff para crear roles.')],
      });
    }

    const botMember = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos del bot').setColor(0xED4245).setDescription('Necesito el permiso `Manage Roles` para crear roles.')],
      });
    }

    const { rawName, roleName, shopPrice, colorRaw } = parseRoleCreateArgs(args);
    if (!rawName || !roleName) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📖 Uso: -rolecreate')
            .setColor(0x5865F2)
            .setDescription([
              '`-rolecreate <nombre del rol>`',
              '`-rolecreate <nombre del rol> --shop <precio>`',
              '`-rolecreate <nombre del rol> --color <nombre|hex|rgb()>`',
              '`-rolecreate <nombre del rol> --color <dark blue|light purple> --shop <precio>`',
              '',
              'Ejemplo: `-rolecreate :money_bag: ➤ Magnate --color dark blue --shop 85000000`',
            ].join('\n')),
        ],
      });
    }

    if (rawName.length > 100 || roleName.length > 100) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Nombre muy largo').setColor(0xED4245).setDescription('El nombre del rol no puede superar 100 caracteres.')],
      });
    }

    const duplicated = message.guild.roles.cache.find(role => role.name.toLowerCase() === roleName.toLowerCase());
    if (duplicated) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('ℹ️ Ya existe').setColor(0x5865F2).setDescription(`Ya existe un rol con ese nombre: ${duplicated}.`)],
      });
    }

    if (args.includes('--shop') || args.includes('-s')) {
      if (!shopPrice) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Precio inválido').setColor(0xED4245).setDescription('Si usas `--shop`, debes poner un precio válido mayor a 0.')],
        });
      }
    }

    let roleColor = null;
    if ((args.includes('--color') || args.includes('-c')) && !colorRaw) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Color inválido').setColor(0xED4245).setDescription('Si usas `--color`, debes indicar un color válido.')],
      });
    }

    if (colorRaw) {
      const resolved = resolveRoleColor(colorRaw);
      if (!resolved.ok) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Color no reconocido').setColor(0xED4245).setDescription('Usa un color como `dark blue`, `light purple`, `purple`, `#7d3cff` o `rgb(125,60,255)`.')],
        });
      }

      roleColor = resolved.hex;
    }

    try {
      const createdRole = await message.guild.roles.create({
        name: roleName,
        color: roleColor || undefined,
        reason: `Rol creado por ${message.author.tag} con -rolecreate`,
      });

      let shopText = 'No agregado a shop.';
      if (shopPrice) {
        setRolePrice(guildId, createdRole, shopPrice, message.author.id);
        const config = getGuildConfig(guildId);
        shopText = `Agregado a shop por ${formatCurrency(shopPrice, config)}.`;
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Rol creado')
            .setColor(0x2ECC71)
            .setDescription([
              `Rol: ${createdRole}`,
              `Nombre final: **${roleName}**`,
              roleColor ? `Color aplicado: **${roleColor}**` : 'Color aplicado: color por defecto.',
              shopText,
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('Error en -rolecreate:', error);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Error al crear rol').setColor(0xED4245).setDescription('No pude crear el rol. Revisa jerarquía/permisos del bot.')],
      });
    }
  },
};

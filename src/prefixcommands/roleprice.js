const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const {
  getGuildConfig,
  setRolePrice,
  setRoleIncomeBonusPercent,
  removeRolePrice,
  getRolePrices,
  getRoleShopEntry,
  replaceRoleShopEntry,
} = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');

function resolveRoleFromInput(message, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const mentionMatch = text.match(/^<@&(\d{17,20})>$/);
  if (mentionMatch) {
    return message.guild.roles.cache.get(mentionMatch[1]) || null;
  }

  if (/^\d{17,20}$/.test(text)) {
    return message.guild.roles.cache.get(text) || null;
  }

  return message.guild.roles.cache.find(role => role.name.toLowerCase() === text.toLowerCase()) || null;
}

module.exports = {
  name: 'roleprice',
  help: {
    purpose: 'Configura precios de roles para la tienda de economía.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
    if (!canManage) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Sin permisos').setColor(0xED4245).setDescription('Necesitas ser admin o staff para configurar precios.')],
      });
    }

    const config = getGuildConfig(guildId);
    const sub = (args[0] || 'list').toLowerCase();

    if (sub === 'list') {
      const prices = getRolePrices(guildId);
      if (!prices.length) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('🛍️ Tienda de roles').setColor(0x5865F2).setDescription('No hay roles configurados aún.')],
        });
      }

      const lines = prices.map(item => {
        const role = message.guild.roles.cache.get(item.roleId);
        const displayName = role ? `${role}` : `**${item.roleName || 'Rol eliminado'}**`;
        const bonusLabel = Number(item.incomeBonusPercent) > 0 ? ` • Bonus income: +${item.incomeBonusPercent}%` : '';
        return `${displayName} — ${formatCurrency(item.price, config)}${bonusLabel} • ID: \`${item.roleId}\``;
      });

      return message.reply({
        embeds: [new EmbedBuilder().setTitle('🛍️ Tienda de roles').setColor(0x5865F2).setDescription(lines.join('\n')).setTimestamp()],
      });
    }

    if (sub === 'bonus' || sub === 'incomebonus') {
      const action = String(args[1] || 'list').toLowerCase();

      if (action === 'list') {
        const prices = getRolePrices(guildId);
        if (!prices.length) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('🛍️ Bonus income por rol').setColor(0x5865F2).setDescription('No hay roles configurados en la shop.')],
          });
        }

        const lines = prices.map(item => {
          const role = message.guild.roles.cache.get(item.roleId);
          const displayName = role ? `${role}` : `**${item.roleName || 'Rol eliminado'}**`;
          return `${displayName} — **+${Number(item.incomeBonusPercent) || 0}%**`;
        });

        return message.reply({
          embeds: [new EmbedBuilder().setTitle('🛍️ Bonus income por rol').setColor(0x5865F2).setDescription(lines.join('\n')).setTimestamp()],
        });
      }

      if (action === 'set' || action === 'edit') {
        const role = resolveRoleFromInput(message, args[2]);
        const percentRaw = String(args[3] || '').replace(',', '.');
        const percent = Number(percentRaw);

        if (!role || !Number.isFinite(percent) || percent < 0 || percent > 500) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-roleprice bonus set <@rol|rolId|nombre> <porcentaje>`\nEjemplo: `-roleprice bonus set 123456789012345678 15`')],
          });
        }

        const entry = getRoleShopEntry(guildId, role.id);
        if (!entry || !(Number(entry.price) > 0)) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ Rol fuera de la shop').setColor(0xED4245).setDescription('Ese rol no está en la shop. Primero configuralo con `-roleprice set <@rol|rolId|nombre> <precio>`.')],
          });
        }

        const saved = setRoleIncomeBonusPercent(guildId, role, percent, message.author.id);
        if (!saved) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ No se pudo guardar').setColor(0xED4245).setDescription('No pude guardar el bonus de income para ese rol.')],
          });
        }

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Bonus income configurado')
              .setColor(0x2ECC71)
              .setDescription(`${role} ahora da **+${saved.incomeBonusPercent}%** en comandos de income/work.`),
          ],
        });
      }

      if (action === 'remove' || action === 'delete') {
        const role = resolveRoleFromInput(message, args[2]);
        if (!role) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ Falta rol').setColor(0xED4245).setDescription('Uso: `-roleprice bonus remove <@rol|rolId|nombre>`')],
          });
        }

        const entry = getRoleShopEntry(guildId, role.id);
        if (!entry || !(Number(entry.price) > 0)) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ Rol fuera de la shop').setColor(0xED4245).setDescription('Ese rol no está en la shop.')],
          });
        }

        const saved = setRoleIncomeBonusPercent(guildId, role, 0, message.author.id);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🗑️ Bonus income removido')
              .setColor(0x5865F2)
              .setDescription(saved ? `${role} quedó con **+0%** de bonus income.` : 'No se pudo actualizar ese rol.'),
          ],
        });
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📖 Uso: -roleprice bonus')
            .setColor(0x5865F2)
            .setDescription('`-roleprice bonus list`\n`-roleprice bonus set <@rol|rolId|nombre> <porcentaje>`\n`-roleprice bonus edit <@rol|rolId|nombre> <porcentaje>`\n`-roleprice bonus remove <@rol|rolId|nombre>`'),
        ],
      });
    }

    if (sub === 'set' || sub === 'edit') {
      const role = resolveRoleFromInput(message, args[1]);
      const price = Number(String(args[2] || '').replace(/[,_\.\s]/g, ''));

      if (!role || !Number.isFinite(price) || price <= 0) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('📖 Uso: -roleprice')
              .setColor(0x5865F2)
              .setDescription('`-roleprice set <@rol|rolId|nombre> <precio>`\n`-roleprice edit <@rol|rolId|nombre> <precio>`\n`-roleprice replace <rol-viejo> <rol-nuevo> [precio]`\n`-roleprice remove <@rol|rolId|nombre>`\n`-roleprice list`\n`-roleprice bonus list`\n`-roleprice bonus set <@rol|rolId|nombre> <porcentaje>`\n`-roleprice bonus remove <@rol|rolId|nombre>`'),
          ],
        });
      }

      setRolePrice(guildId, role, Math.floor(price), message.author.id);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('✅ Precio configurado').setColor(0x2ECC71).setDescription(`${role} ahora cuesta ${formatCurrency(price, config)}.`)],
      });
    }

    if (sub === 'replace' || sub === 'swap') {
      const oldRole = resolveRoleFromInput(message, args[1]);
      const newRole = resolveRoleFromInput(message, args[2]);
      const overridePrice = Number(String(args[3] || '').replace(/[,_\.\s]/g, ''));

      if (!oldRole || !newRole) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-roleprice replace <rol-viejo> <rol-nuevo> [precio]`')],
        });
      }

      const replaced = replaceRoleShopEntry(
        guildId,
        oldRole.id,
        newRole,
        Number.isFinite(overridePrice) && overridePrice > 0 ? Math.floor(overridePrice) : null,
        message.author.id
      );

      if (!replaced) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Rol viejo no encontrado').setColor(0xED4245).setDescription('Ese rol viejo no está configurado en la tienda.')],
        });
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🔁 Rol reemplazado')
            .setColor(0x2ECC71)
            .setDescription(`Reemplacé ${oldRole} por ${newRole} con precio ${formatCurrency(replaced.price, config)}.`),
        ],
      });
    }

    if (sub === 'remove' || sub === 'delete') {
      const role = resolveRoleFromInput(message, args[1]);
      if (!role) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Falta rol').setColor(0xED4245).setDescription('Uso: `-roleprice remove <@rol|rolId|nombre>`')],
        });
      }

      const removed = removeRolePrice(guildId, role.id);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(removed ? '🗑️ Precio removido' : 'ℹ️ Sin cambios')
            .setColor(removed ? 0x2ECC71 : 0x5865F2)
            .setDescription(removed ? `${role} fue removido de la tienda.` : `${role} no tenía precio configurado.`),
        ],
      });
    }

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('📖 Uso: -roleprice')
          .setColor(0x5865F2)
          .setDescription('`-roleprice set <@rol|rolId|nombre> <precio>`\n`-roleprice edit <@rol|rolId|nombre> <precio>`\n`-roleprice replace <rol-viejo> <rol-nuevo> [precio]`\n`-roleprice remove <@rol|rolId|nombre>`\n`-roleprice list`\n`-roleprice bonus list`\n`-roleprice bonus set <@rol|rolId|nombre> <porcentaje>`\n`-roleprice bonus remove <@rol|rolId|nombre>`'),
      ],
    });
  },
};

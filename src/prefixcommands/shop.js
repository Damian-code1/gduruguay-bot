const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getGuildConfig,
  getRolePrices,
  canAfford,
  removeFromWallet,
  withdrawFromBank,
  getUserBalance,
  getIncomeBonusForMember,
} = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildPassiveConfig } = require('../utils/passiveIncomeStore');
const { formatDuration } = require('../utils/timeParser');

function resolveShopTarget(message, list, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const byMention = message.mentions.roles.first();
  if (byMention) {
    return list.find(item => item.roleId === byMention.id) || null;
  }

  if (/^\d{17,20}$/.test(text)) {
    const byId = list.find(item => item.roleId === text);
    if (byId) return byId;
  }

  const idx = Number(text);
  if (Number.isInteger(idx) && idx >= 1 && idx <= list.length) {
    return list[idx - 1];
  }

  const normalized = text.toLowerCase();
  return list.find(item => String(item.roleName || '').toLowerCase() === normalized) || null;
}

module.exports = {
  name: 'shop',
  help: {
    purpose: 'Muestra la tienda de roles y permite comprar desde el mismo comando.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const privileged = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);
    const config = getGuildConfig(guildId);
    const passiveConfig = getGuildPassiveConfig(guildId);
    const incomeBonus = getIncomeBonusForMember(guildId, message.member);
    const passiveEveryText = formatDuration(passiveConfig.intervalMs);
    const list = getRolePrices(guildId).sort((a, b) => b.price - a.price);

    if (!list.length) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('🛍️ Shop').setColor(0x5865F2).setDescription('No hay roles en la tienda todavía.')],
      });
    }

    const sub = String(args[0] || 'list').toLowerCase();
    const normalView = sub === 'normal';
    const showAdminDetails = privileged && !normalView;

    if (sub === 'list' || sub === 'normal' || !sub) {
      const lines = list.map((item, index) => {
        const role = message.guild.roles.cache.get(item.roleId);
        const roleText = role ? `${role}` : `**${item.roleName || 'Rol eliminado'}**`;
        const passiveAmount = Number(passiveConfig.roleRewards?.[item.roleId]) || 0;
        const passiveText = passiveAmount > 0
          ? `${formatCurrency(passiveAmount, config)} cada ${passiveEveryText}`
          : 'No configurado';

        const block = [
          `**${index + 1}.** ${roleText} — ${formatCurrency(item.price, config)}`,
          `↳ Pasivo: ${passiveText}`,
          showAdminDetails ? `↳ ID: \`${item.roleId}\`` : null,
        ].filter(Boolean);

        return block.join('\n');
      });

      const embed = new EmbedBuilder()
        .setTitle(normalView ? '🛍️ Shop de Roles (Vista Miembro)' : '🛍️ Shop de Roles')
        .setColor(0xF1C40F)
        .setDescription(lines.join('\n\n'))
        .addFields({
          name: 'Comprar',
          value: '`-shop buy <numero|@rol|id|nombre>`\n`-shop buy all`\nEjemplo: `-shop buy 1`',
          inline: false,
        })
        .setTimestamp();

      if (showAdminDetails) {
        embed.addFields({
          name: 'Admin/Staff',
          value: '`-shop normal` (ver como miembro)\n`-shop take <numero|@rol|id|nombre>`\n`-shop take @usuario <numero|@rol|id|nombre>`',
          inline: false,
        });
      }

      embed.addFields({
        name: 'Ingresos pasivos',
        value: `Los roles con pasivo pagan automáticamente cada **${formatDuration(passiveConfig.intervalMs)}**.`,
        inline: false,
      });

      embed.addFields({
        name: 'Tu bonus de income (shop)',
        value: `Bonus actual: **+${incomeBonus.percent || 0}%** (${incomeBonus.roles.length} rol(es)).`,
        inline: false,
      });

      return message.reply({ embeds: [embed] });
    }

    if (sub === 'take' || sub === 'remove') {
      if (!privileged) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Sin permisos').setColor(0xED4245).setDescription('Solo admin/staff puede usar este subcomando.')],
        });
      }

      const mentionedMember = message.mentions.members.first();
      const targetMember = mentionedMember || message.member;
      const roleRaw = mentionedMember ? args.slice(2).join(' ') : args.slice(1).join(' ');

      const target = resolveShopTarget(message, list, roleRaw);
      if (!target) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Ítem no encontrado').setColor(0xED4245).setDescription('No encontré ese rol en la shop.')],
        });
      }

      const role = message.guild.roles.cache.get(target.roleId);
      if (!role) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Rol no disponible').setColor(0xED4245).setDescription('Ese rol ya no existe en el servidor.')],
        });
      }

      if (!targetMember.roles.cache.has(role.id)) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('ℹ️ Sin cambios').setColor(0x5865F2).setDescription(`<@${targetMember.id}> no tiene el rol ${role}.`)],
        });
      }

      try {
        await targetMember.roles.remove(role, `Rol removido de shop por ${message.author.tag}`);
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🧹 Rol removido')
              .setColor(0x2ECC71)
              .setDescription(`Le removí ${role} a <@${targetMember.id}>.`)
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error('Error en -shop take:', error);
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Error al remover rol').setColor(0xED4245).setDescription('No pude remover ese rol. Revisa jerarquía/permisos del bot.')],
        });
      }
    }

    if (sub !== 'buy') {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('📖 Uso: -shop').setColor(0x5865F2).setDescription('`-shop`\n`-shop normal`\n`-shop buy <numero|@rol|id|nombre>`\n`-shop buy all`\n`-shop take <numero|@rol|id|nombre>`\n`-shop take @usuario <numero|@rol|id|nombre>`')],
      });
    }

    const buyArg = String(args[1] || '').trim().toLowerCase();
    if (buyArg === 'all') {
      const member = message.member;
      const availableRoles = list
        .map(item => ({ item, role: message.guild.roles.cache.get(item.roleId) }))
        .filter(({ item, role }) => role && role.editable && !member.roles.cache.has(role.id))
        .sort((a, b) => (Number(b.item.price) || 0) - (Number(a.item.price) || 0));

      if (!availableRoles.length) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('ℹ️ Nada para comprar').setColor(0x5865F2).setDescription('Ya tienes todos los roles comprables de la shop.')],
        });
      }

      const balance = getUserBalance(guildId, member.id);
      let remainingBudget = balance.total;

      const plannedRoles = [];
      for (const entry of availableRoles) {
        const price = Number(entry.item.price) || 0;
        if (price <= 0) continue;
        if (price <= remainingBudget) {
          plannedRoles.push(entry);
          remainingBudget -= price;
        }
      }

      if (!plannedRoles.length) {
        const cheapest = availableRoles[availableRoles.length - 1];
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('❌ Fondos insuficientes')
              .setColor(0xED4245)
              .setDescription([
                `Tenés en total: ${formatCurrency(balance.total, config)}`,
                `El rol más barato disponible cuesta ${formatCurrency(cheapest.item.price, config)}.`,
              ].join('\n')),
          ],
        });
      }

      const grantedRoles = [];
      const failedRoles = [];

      for (const { item, role } of plannedRoles) {
        try {
          await member.roles.add(role, `Compra masiva de shop por ${member.user.tag}`);
          grantedRoles.push({ role, item });
        } catch (error) {
          console.error('Error en -shop buy all:', error);
          failedRoles.push(role);
        }
      }

      const spent = grantedRoles.reduce((sum, entry) => sum + (Number(entry.item.price) || 0), 0);
      if (spent > 0) {
        const currentBalance = getUserBalance(guildId, member.id);
        const missingInWallet = Math.max(0, spent - currentBalance.wallet);
        if (missingInWallet > 0) {
          withdrawFromBank(guildId, member.id, missingInWallet);
        }
        removeFromWallet(guildId, member.id, spent);
      }

      if (!grantedRoles.length) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Error al comprar').setColor(0xED4245).setDescription('No pude asignarte ningún rol. Revisa jerarquía/permisos del bot.')],
        });
      }

      const names = grantedRoles.slice(0, 10).map(entry => `${entry.role}`).join(', ');
      const moreText = grantedRoles.length > 10 ? ` y ${grantedRoles.length - 10} más` : '';
      const skippedByBudget = Math.max(0, availableRoles.length - plannedRoles.length);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Compra masiva realizada')
            .setColor(0x2ECC71)
            .setDescription([
              `Compraste **${grantedRoles.length}** rol(es) por ${formatCurrency(spent, config)} (priorizando los más caros).`,
              names ? `Roles: ${names}${moreText}` : null,
              skippedByBudget > 0 ? `Quedaron **${skippedByBudget}** rol(es) fuera por presupuesto.` : null,
              failedRoles.length ? `No pude asignar **${failedRoles.length}** rol(es) por permisos/jerarquía.` : null,
            ].filter(Boolean).join('\n'))
            .setTimestamp(),
        ],
      });
    }

    const target = resolveShopTarget(message, list, args.slice(1).join(' '));
    if (!target) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Ítem no encontrado').setColor(0xED4245).setDescription('No encontré ese rol en la shop.')],
      });
    }

    const role = message.guild.roles.cache.get(target.roleId);
    if (!role) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Rol no disponible').setColor(0xED4245).setDescription('Ese rol ya no existe en el servidor, pero sigue en tienda. Reconfigúralo con `-roleprice`.')],
      });
    }

    const member = message.member;
    if (member.roles.cache.has(role.id)) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('ℹ️ Ya lo tienes').setColor(0x5865F2).setDescription(`Ya tienes el rol ${role}.`)],
      });
    }

    if (!canAfford(guildId, member.id, target.price)) {
      const balance = getUserBalance(guildId, member.id);
      const missingInWallet = Math.max(0, target.price - balance.wallet);
      const missingTotal = Math.max(0, target.price - balance.total);

      const lines = [
        `Precio: ${formatCurrency(target.price, config)}`,
        `Tenés en mano: ${formatCurrency(balance.wallet, config)}`,
        `Tenés en banco: ${formatCurrency(balance.bank, config)}`,
        `Total actual: ${formatCurrency(balance.total, config)}`,
        '',
      ];

      if (missingTotal <= 0) {
        lines.push(`Te alcanza en total, pero te faltan ${formatCurrency(missingInWallet, config)} en mano.`);
        lines.push('Usá `-withdraw` para sacar del banco y comprar.');
      } else {
        lines.push(`Te faltan ${formatCurrency(missingTotal, config)} en total para poder comprar ese rol.`);
      }

      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Fondos insuficientes').setColor(0xED4245).setDescription(lines.join('\n'))],
      });
    }

    try {
      await member.roles.add(role, `Compra de shop por ${member.user.tag}`);
      removeFromWallet(guildId, member.id, target.price);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('✅ Compra realizada')
            .setColor(0x2ECC71)
            .setDescription(`Compraste ${role} por ${formatCurrency(target.price, config)}.`)
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('Error en -shop buy:', error);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Error al comprar').setColor(0xED4245).setDescription('No pude asignarte ese rol. Revisa jerarquía/permisos del bot.')],
      });
    }
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildConfig } = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const {
  getGuildPassiveConfig,
  setPassiveInterval,
  setPassiveRoleReward,
  removePassiveRoleReward,
  getPassiveRoleRewards,
  tryGrantPassiveIncome,
  getPassiveStatus,
} = require('../utils/passiveIncomeStore');

function resolveRole(message, raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const mentioned = message.mentions.roles.first();
  if (mentioned) return mentioned;

  if (/^\d{17,20}$/.test(text)) return message.guild.roles.cache.get(text) || null;
  return message.guild.roles.cache.find(role => role.name.toLowerCase() === text.toLowerCase()) || null;
}

module.exports = {
  name: 'passiveincome',
  aliases: ['passive', 'pi'],
  help: {
    purpose: 'Gestiona y reclama ingresos pasivos por roles.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const config = getGuildConfig(guildId);
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    const sub = String(args[0] || 'status').toLowerCase();

    if (sub === 'status' || sub === 'list') {
      const passiveConfig = getGuildPassiveConfig(guildId);
      const rewards = getPassiveRoleRewards(guildId);
      const status = getPassiveStatus(guildId, message.member);

      const memberRoleIds = message.member.roles.cache;
      const myRewards = rewards.filter(entry => memberRoleIds.has(entry.roleId));
      const roleLines = myRewards.length
        ? myRewards.map(entry => `${message.guild.roles.cache.get(entry.roleId) || `ID ${entry.roleId}`} — ${formatCurrency(entry.amount, config)} por ciclo`).join('\n')
        : 'No tenés roles con ingreso pasivo.';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('💤 Ingreso pasivo')
            .setColor(0x5865F2)
            .setDescription([
              `Intervalo global: **${formatDuration(passiveConfig.intervalMs)}**`,
              `Tu ingreso por ciclo: ${status.perInterval > 0 ? formatCurrency(status.perInterval, config) : 'No aplica'}`,
              `Stack de roles pasivos: **${status.matchedRoles || 0}** rol(es) sumando por ciclo`,
              `Total ganado por pasivo: ${formatCurrency(status.totalEarned || 0, config)}`,
              status.claimableIntervals > 0
                ? `Podés reclamar ahora: **${status.claimableIntervals}** ciclo(s) = ${formatCurrency(status.claimableAmount, config)}`
                : `Siguiente en: **${cooldownText(status.remainingMs || passiveConfig.intervalMs)}**`,
            ].join('\n'))
            .addFields({ name: 'Tus roles con pasivo', value: roleLines.slice(0, 1024) })
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'claim' || sub === 'collect') {
      // Modo manual opcional: el scheduler automático también paga sin claim.
      const result = tryGrantPassiveIncome(guildId, message.member);

      if (!result.granted) {
        if (result.reason === 'no_roles') {
          return message.reply('❌ No tenés roles configurados para ingreso pasivo.');
        }

        if (result.reason === 'initialized') {
          return message.reply(`✅ Sistema pasivo activado para vos. Podés reclamar en **${cooldownText(result.remainingMs || result.intervalMs)}**.`);
        }

        return message.reply(`⏳ Todavía no podés reclamar. Volvé en **${cooldownText(result.remainingMs || result.intervalMs)}**.`);
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('💸 Ingreso pasivo reclamado')
            .setColor(0x2ECC71)
            .setDescription(`Recibiste ${formatCurrency(result.amount, config)} por **${result.intervals}** ciclo(s).`)
            .addFields(
              { name: 'Próximo ciclo', value: cooldownText(result.intervalMs), inline: true },
              { name: 'Tip', value: 'No necesitás claimear: ahora se acredita automático.', inline: false },
            )
            .setTimestamp(),
        ],
      });
    }

    if (!canManage) {
      return message.reply('❌ Solo staff/admin puede configurar ingresos pasivos. Usá `-passive status` o `-passive claim`.');
    }

    if (sub === 'interval' || sub === 'setinterval') {
      const intervalText = args.slice(1).join(' ');
      const intervalMs = parseDuration(intervalText);
      if (!intervalMs || intervalMs < 60_000) {
        return message.reply('❌ Intervalo inválido. Ejemplos: `-passive interval 1m`, `-passive interval 2h`, `-passive interval 1d`.');
      }

      const saved = setPassiveInterval(guildId, intervalMs);
      return message.reply(`✅ Intervalo pasivo configurado a **${formatDuration(saved)}**.`);
    }

    if (sub === 'setrole' || sub === 'role') {
      const action = String(args[1] || '').toLowerCase();

      if (action === 'set' || action === 'edit') {
        const role = resolveRole(message, args[2]);
        const amount = Number(String(args[3] || '').replace(/[,_\.\s]/g, ''));

        if (!role || !Number.isFinite(amount) || amount <= 0) {
          return message.reply('❌ Uso: `-passive role set <@rol|rolId|nombre> <monto>` o `-passive role edit <@rol|rolId|nombre> <monto>`');
        }

        if (action === 'edit') {
          const current = getGuildPassiveConfig(guildId);
          const exists = Number(current.roleRewards?.[role.id]) > 0;
          if (!exists) {
            return message.reply(`❌ ${role} no tiene ingreso pasivo configurado. Usá \`-passive role set <@rol|rolId|nombre> <monto>\` primero.`);
          }
        }

        const saved = setPassiveRoleReward(guildId, role.id, Math.floor(amount));
        return message.reply(`✅ ${role} ahora recibe ${formatCurrency(saved, config)} por ciclo pasivo.${action === 'edit' ? ' (editado)' : ''}`);
      }

      if (action === 'remove' || action === 'delete') {
        const role = resolveRole(message, args[2]);
        if (!role) {
          return message.reply('❌ Uso: `-passive role remove <@rol|rolId|nombre>`');
        }

        const removed = removePassiveRoleReward(guildId, role.id);
        return message.reply(removed ? `🗑️ Quité el ingreso pasivo para ${role}.` : `ℹ️ ${role} no tenía ingreso pasivo configurado.`);
      }

      if (action === 'list') {
        const rewards = getPassiveRoleRewards(guildId);
        if (!rewards.length) {
          return message.reply('ℹ️ No hay roles con ingreso pasivo configurado.');
        }

        const lines = rewards.map(entry => `${message.guild.roles.cache.get(entry.roleId) || `ID ${entry.roleId}`} — ${formatCurrency(entry.amount, config)} por ciclo`);
        return message.reply({ embeds: [new EmbedBuilder().setTitle('💤 Roles pasivos').setColor(0x5865F2).setDescription(lines.join('\n'))] });
      }
    }

    return message.reply([
      '📖 Uso de `-passive` / `-passiveincome`',
      '`-passive status`',
      '`-passive claim`',
      '`-passive interval <tiempo>`',
      '`-passive role set <@rol|rolId|nombre> <monto>`',
      '`-passive role edit <@rol|rolId|nombre> <monto>`',
      '`-passive role remove <@rol|rolId|nombre>`',
      '`-passive role list`',
    ].join('\n'));
  },
};

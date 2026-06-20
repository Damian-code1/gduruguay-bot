const { EmbedBuilder } = require('discord.js');
const { getGuildConfig, getRemainingCooldown } = require('../utils/economyStore');
const { cooldownText } = require('../utils/economyHelpers');
const { listIncomeActions } = require('../utils/incomeActions');
const { getChicken } = require('../utils/chickenFightStore');
const { getGuildPassiveConfig, getPassiveStatus } = require('../utils/passiveIncomeStore');

const AURA_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const ROB_COOLDOWN_MS = 20 * 60 * 1000;
const COINFLIP_COOLDOWN_MS = 10 * 60 * 1000;
const RULETA_DAILY_MS = 24 * 60 * 60 * 1000;
const TRAIN_COOLDOWN_MS = 30 * 60 * 1000;
const FIGHT_COOLDOWN_MS = 10 * 60 * 1000;

function formatStatus(remainingMs) {
  return remainingMs > 0
    ? `⏳ En ${cooldownText(remainingMs)}`
    : '✅ Disponible';
}

function formatAmount(value) {
  return new Intl.NumberFormat('es-UY').format(Math.max(0, Math.floor(value || 0)));
}

function line(name, status, extra = '') {
  return `• ${name} — ${status}${extra ? ` ${extra}` : ''}`;
}

function hasPassiveRole(member, roleRewards) {
  if (!member?.roles?.cache || !roleRewards) return false;
  return Object.keys(roleRewards).some(roleId => member.roles.cache.has(roleId));
}

function sectionTitle(title, emoji) {
  return `${emoji} ${title}`;
}

module.exports = {
  name: 'cooldowns',
  aliases: ['cds'],
  help: {
    purpose: 'Muestra todos tus cooldowns activos y sus tiempos restantes.',
    category: '💰 Economía',
  },
  async execute(message) {
    if (!message.guild) {
      return message.reply('Este comando solo se puede usar dentro de un servidor.');
    }

    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = getGuildConfig(guildId);
    const passiveConfig = getGuildPassiveConfig(guildId);
    const chicken = getChicken(guildId, userId);
    const showPassive = hasPassiveRole(message.member, passiveConfig.roleRewards);

    const coreLines = [
      line('-daily', formatStatus(getRemainingCooldown(guildId, userId, 'daily', config.dailyCooldownMs)), `(base: ${cooldownText(config.dailyCooldownMs)})`),
      line('-work', formatStatus(getRemainingCooldown(guildId, userId, 'work', config.workCooldownMs)), `(base: ${cooldownText(config.workCooldownMs)})`),
      line('-aura', formatStatus(getRemainingCooldown(guildId, userId, 'aura_daily', AURA_COOLDOWN_MS)), `(base: ${cooldownText(AURA_COOLDOWN_MS)})`),
      line('-rob', formatStatus(getRemainingCooldown(guildId, userId, 'rob_cmd', ROB_COOLDOWN_MS)), `(base: ${cooldownText(ROB_COOLDOWN_MS)})`),
      line('-coinflip', formatStatus(getRemainingCooldown(guildId, userId, 'coinflip_cmd', COINFLIP_COOLDOWN_MS)), `(base: ${cooldownText(COINFLIP_COOLDOWN_MS)})`),
      line('/ruleta', formatStatus(getRemainingCooldown(guildId, userId, 'ruleta_daily', RULETA_DAILY_MS)), `(base: ${cooldownText(RULETA_DAILY_MS)})`),
    ];

    const incomeLines = listIncomeActions().map(action => {
      const remaining = getRemainingCooldown(guildId, userId, `income_${action.key}`, action.cooldownMs);
      return line(`-${action.key}`, formatStatus(remaining), `(base: ${cooldownText(action.cooldownMs)})`);
    });

    const extraLines = [
      config.messageReward?.enabled
        ? line('-message reward', formatStatus(getRemainingCooldown(guildId, userId, 'message', config.messageReward.cooldownMs)), `(base: ${cooldownText(config.messageReward.cooldownMs)})`)
        : '• -message reward — Desactivado',
      chicken
        ? line('-pollito train', formatStatus(Math.max(0, TRAIN_COOLDOWN_MS - (Date.now() - (chicken.lastTrainAt || 0)))), `(base: ${cooldownText(TRAIN_COOLDOWN_MS)})`)
        : '• -pollito train — No tenés pollito',
      chicken
        ? line('-pollito fight', formatStatus(Math.max(0, FIGHT_COOLDOWN_MS - (Date.now() - (chicken.lastFightAt || 0)))), `(base: ${cooldownText(FIGHT_COOLDOWN_MS)})`)
        : '• -pollito fight — No tenés pollito',
    ];

    const passiveStatus = getPassiveStatus(guildId, message.member);
    const passiveLines = showPassive
      ? [
          passiveStatus.perInterval > 0
            ? line('-passive claim', passiveStatus.claimableIntervals > 0 ? `Disponible ahora (${formatAmount(passiveStatus.claimableAmount)} monedas)` : formatStatus(passiveStatus.remainingMs), `(base: ${cooldownText(passiveStatus.intervalMs)})`)
            : '• -passive claim — Sin roles configurados para pasivo',
          `• Pasivo del servidor — Intervalo ${cooldownText(passiveConfig.intervalMs)}`,
        ]
      : [];

    const systemLines = [
      '—',
    ];

    const embed = new EmbedBuilder()
      .setTitle('⏳ Panel de Cooldowns')
      .setColor(0xF1C40F)
      .setDescription('Resumen visual de tus tiempos de espera y acciones disponibles.')
      .setAuthor({
        name: `${message.author.username} • Cooldowns`,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setThumbnail(message.guild.iconURL({ dynamic: true, size: 128 }) || null)
      .addFields(
        { name: sectionTitle('Base de economía', '💠'), value: coreLines.join('\n'), inline: false },
        { name: sectionTitle('Ingresos', '💸'), value: incomeLines.join('\n'), inline: false },
        { name: sectionTitle('Extras', '🎛️'), value: [...extraLines, ...passiveLines].join('\n'), inline: false },
      )
      .setFooter({ text: 'Usá -cooldowns o -cds • ✅ disponible / ⏳ en espera' })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};
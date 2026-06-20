const { EmbedBuilder } = require('discord.js');
const {
  getGuildConfig,
  getUserBalance,
  getRemainingCooldown,
  setCooldown,
  addToWallet,
  removeFromWallet,
  randomInt,
  recordRobbery,
  getRevengeBonusPercent,
  getVictimRobberyCooldown,
} = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { runRobberyChallenge } = require('../utils/robberyGame');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const ROB_COOLDOWN_MS = 20 * 60 * 1000;
const ROB_VICTIM_COOLDOWN_MS = 40 * 60 * 1000;
const MIN_THIEF_BALANCE_FOR_FAIL = 150;

function buildCooldownEmbed(victimLock) {
  const robbedBy = victimLock?.record?.thiefId ? `<@${victimLock.record.thiefId}>` : 'alguien';
  const robberLabel = victimLock?.record?.command === 'forcerob' ? 'forcerob' : 'rob';

  return new EmbedBuilder()
    .setTitle('⏳ Ese usuario ya fue robado')
    .setColor(0xE67E22)
    .setDescription([
      `Ese usuario ya fue robado por ${robbedBy} con \`${robberLabel}\`.`,
      `Podés intentarlo de nuevo en **${cooldownText(victimLock.remaining)}**.`,
    ].join('\n'));
}

module.exports = {
  name: 'rob',
  aliases: ['rb'],
  help: {
    purpose: 'Roba monedas en mano a otro usuario completando un minijuego. Incluye sistema de venganza.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const thiefId = message.author.id;
    const victim = await resolveUserTarget(message, args[0]);

    if (!victim || victim.user.bot || victim.id === thiefId) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-rob @usuario|userId`')],
      });
    }

    const config = getGuildConfig(guildId);
    const thiefBalance = getUserBalance(guildId, thiefId);
    const victimBalance = getUserBalance(guildId, victim.id);

    if (victimBalance.wallet <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Objetivo sin fondos')
            .setColor(0x5865F2)
            .setDescription('Ese usuario debe tener monedas en mano para poder ser robado.'),
        ],
      });
    }

    const victimLock = getVictimRobberyCooldown(guildId, victim.id);
    if (victimLock.remaining > 0) {
      return message.reply({ embeds: [buildCooldownEmbed(victimLock)] });
    }

    const remaining = getRemainingCooldown(guildId, thiefId, 'rob_cmd', ROB_COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Rob en cooldown')
            .setColor(0xE67E22)
            .setDescription(`Podés volver a usar \`-rob\` en **${cooldownText(remaining)}**.`),
        ],
      });
    }

    setCooldown(guildId, thiefId, 'rob_cmd', Date.now());

    const miniGameSuccess = await runRobberyChallenge(message, victim.id, { hard: false });
    if (!miniGameSuccess) {
      const failPenalty = thiefBalance.wallet <= 0
        ? 0
        : Math.min(
          thiefBalance.wallet,
          Math.max(MIN_THIEF_BALANCE_FOR_FAIL, Math.floor(thiefBalance.wallet * (randomInt(4, 8) / 100)))
        );

      if (failPenalty > 0) {
        removeFromWallet(guildId, thiefId, failPenalty);
        addToWallet(guildId, victim.id, failPenalty);
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚨 Robo fallido')
            .setColor(0xED4245)
            .setDescription([
              'Fallaste el minijuego y te descubrieron.',
              failPenalty > 0
                ? `Pagaste ${formatCurrency(failPenalty, config)} a <@${victim.id}>.`
                : 'No tenías monedas en mano, así que no perdiste nada.',
            ].join('\n')),
        ],
      });
    }

    const currentLock = getVictimRobberyCooldown(guildId, victim.id);
    if (currentLock.remaining > 0) {
      return message.reply({ embeds: [buildCooldownEmbed(currentLock)] });
    }

    const victimNow = getUserBalance(guildId, victim.id);
    if (victimNow.wallet <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Objetivo sin fondos')
            .setColor(0x5865F2)
            .setDescription('Ese usuario ya no tiene monedas en mano para robar.'),
        ],
      });
    }

    const basePercent = randomInt(4, 10) / 100;
    const revengeBonus = getRevengeBonusPercent(guildId, thiefId, victim.id);
    const totalPercent = Math.min(0.25, basePercent + revengeBonus);

    const stolen = Math.min(victimNow.wallet, Math.floor(victimNow.wallet * totalPercent));
    if (stolen <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Robo sin botín')
            .setColor(0x5865F2)
            .setDescription('No había suficiente saldo en mano para robar en este intento.'),
        ],
      });
    }

    removeFromWallet(guildId, victim.id, stolen);
    addToWallet(guildId, thiefId, stolen);
    recordRobbery(guildId, thiefId, victim.id, stolen, {
      amountWallet: stolen,
      amountBank: 0,
      command: 'rob',
      victimCooldownMs: ROB_VICTIM_COOLDOWN_MS,
    });

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🦹 Robo exitoso')
          .setColor(0x2ECC71)
          .setDescription([
            `Le robaste ${formatCurrency(stolen, config)} a <@${victim.id}>.`,
            `Porcentaje aplicado: **${Math.round(totalPercent * 100)}%**`,
            revengeBonus > 0
              ? `Bonus de venganza: **+${Math.round(revengeBonus * 100)}%**`
              : 'Sin bonus de venganza en este robo.',
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
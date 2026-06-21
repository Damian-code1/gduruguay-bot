const { EmbedBuilder } = require('discord.js');
const {
  getGuildConfig,
  getUserBalance,
  getRemainingCooldown,
  setCooldown,
  addToWallet,
  removeFromWallet,
  removeFromBank,
  randomInt,
  recordRobbery,
  getRevengeBonusPercent,
  getVictimRobberyCooldown,
} = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { runRobberyChallenge } = require('../utils/robberyGame');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const FORCEROB_COOLDOWN_MS = 35 * 60 * 1000;
const FORCEROB_VICTIM_COOLDOWN_MS = 60 * 60 * 1000;
const MIN_THIEF_BALANCE_FOR_FAIL = 200;
const FORCEROB_BASE_REVENGE_BONUS = 0.12;

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
  name: 'forcerob',
  aliases: ['fr'],
  help: {
    purpose: 'Robo más difícil que puede saquear mano y banco. Tiene más riesgo y cooldown.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const thiefId = message.author.id;
    const victim = await resolveUserTarget(message, args[0]);

    if (!victim || victim.user.bot || victim.id === thiefId) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-forcerob @usuario|userId`')],
      });
    }

    const config = await getGuildConfig(guildId);
    const thiefBalance = await getUserBalance(guildId, thiefId);

    const victimLock = await getVictimRobberyCooldown(guildId, victim.id);
    if (victimLock.remaining > 0) {
      return message.reply({ embeds: [buildCooldownEmbed(victimLock)] });
    }

    const remaining = await getRemainingCooldown(guildId, thiefId, 'forcerob_cmd', FORCEROB_COOLDOWN_MS);
    if (remaining > 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Forcerob en cooldown')
            .setColor(0xE67E22)
            .setDescription(`Podés volver a usar \`-forcerob\` en **${cooldownText(remaining)}**.`),
        ],
      });
    }

    await setCooldown(guildId, thiefId, 'forcerob_cmd', Date.now());

    const miniGameSuccess = await runRobberyChallenge(message, victim.id, { hard: true });
    if (!miniGameSuccess) {
      const failPenalty = thiefBalance.wallet <= 0
        ? 0
        : Math.min(
          thiefBalance.wallet,
          Math.max(MIN_THIEF_BALANCE_FOR_FAIL, Math.floor(thiefBalance.wallet * (randomInt(4, 8) / 100)))
        );

      if (failPenalty > 0) {
        await removeFromWallet(guildId, thiefId, failPenalty);
        await addToWallet(guildId, victim.id, failPenalty);
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🚨 Forcerob fallido')
            .setColor(0xED4245)
            .setDescription([
              'Fallaste el minijuego reforzado y te descubrieron.',
              failPenalty > 0
                ? `Pagaste ${formatCurrency(failPenalty, config)} a <@${victim.id}>.`
                : 'No tenías monedas en mano, así que no perdiste nada.',
            ].join('\n')),
        ],
      });
    }

    const currentLock = await getVictimRobberyCooldown(guildId, victim.id);
    if (currentLock.remaining > 0) {
      return message.reply({ embeds: [buildCooldownEmbed(currentLock)] });
    }

    const victimNow = await getUserBalance(guildId, victim.id);
    if (victimNow.wallet <= 0 && victimNow.bank <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Objetivo sin fondos')
            .setColor(0x5865F2)
            .setDescription('Ese usuario no tiene monedas en mano ni en banco para forzar el robo.'),
        ],
      });
    }

    const revengeBonus = Math.max(FORCEROB_BASE_REVENGE_BONUS, await getRevengeBonusPercent(guildId, thiefId, victim.id));

    let stolenWallet = 0;
    let stolenBank = 0;

    if (victimNow.wallet > 0) {
      const walletPercent = Math.min(0.18, (randomInt(5, 10) / 100) + Math.min(revengeBonus, 0.15));
      stolenWallet = Math.min(victimNow.wallet, Math.max(1, Math.floor(victimNow.wallet * walletPercent)));
      if (stolenWallet > 0) {
        await removeFromWallet(guildId, victim.id, stolenWallet);
        await addToWallet(guildId, thiefId, stolenWallet);
      }
    }

    if (victimNow.bank > 0) {
      const bankPercent = Math.min(0.12, (randomInt(3, 8) / 100) + Math.min(revengeBonus, 0.1));
      stolenBank = Math.min(victimNow.bank, Math.max(1, Math.floor(victimNow.bank * bankPercent)));
      if (stolenBank > 0) {
        // remove directly from victim's bank (do not deposit to victim wallet)
        await removeFromBank(guildId, victim.id, stolenBank);
        await addToWallet(guildId, thiefId, stolenBank);
      }
    }

    const totalStolen = stolenWallet + stolenBank;
    if (totalStolen <= 0) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🛡️ Forcerob sin botín')
            .setColor(0x5865F2)
            .setDescription('No se pudo extraer botín útil de ese objetivo.'),
        ],
      });
    }

    await recordRobbery(guildId, thiefId, victim.id, totalStolen, {
      amountWallet: stolenWallet,
      amountBank: stolenBank,
      command: 'forcerob',
      victimCooldownMs: FORCEROB_VICTIM_COOLDOWN_MS,
    });

    const parts = [];
    if (stolenWallet > 0) parts.push(`manos: ${formatCurrency(stolenWallet, config)}`);
    if (stolenBank > 0) parts.push(`banco: ${formatCurrency(stolenBank, config)}`);

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🦹 Forcerob exitoso')
          .setColor(0x2ECC71)
          .setDescription([
            `Le sacaste ${formatCurrency(totalStolen, config)} a <@${victim.id}>.`,
            parts.length ? `Desglose: ${parts.join(' • ')}` : null,
            'Este robo afecta tanto el banco como las monedas en mano.',
            `Bonus de venganza aplicado: **+${Math.round(revengeBonus * 100)}%**`,
          ].filter(Boolean).join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
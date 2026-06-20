const { EmbedBuilder } = require('discord.js');
const {
  getChicken,
  createChicken,
  setChickenName,
  gainExp,
  setTrainCooldown,
  setFightCooldown,
  addWin,
  addLoss,
  addStat,
  getChickenLeaderboard,
} = require('../utils/chickenFightStore');
const { getGuildConfig, getUserBalance, transferWallet, randomInt } = require('../utils/economyStore');
const { parseAmountInput, formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { resolveUserTarget } = require('../utils/resolveUserTarget');

const TRAIN_COOLDOWN_MS = 30 * 60 * 1000;
const FIGHT_COOLDOWN_MS = 10 * 60 * 1000;

function statsBlock(chicken) {
  return [
    `Nivel: **${chicken.level}**`,
    `EXP: **${chicken.exp}/${chicken.level * 120}**`,
    `ATK: **${chicken.atk}**  | DEF: **${chicken.def}**  | SPD: **${chicken.spd}**`,
    `HP base: **${chicken.hp}**`,
    `W/L: **${chicken.wins}/${chicken.losses}**`,
  ].join('\n');
}

function simulateFight(chA, chB) {
  const a = { ...chA, currentHp: chA.hp + (chA.level * 8) };
  const b = { ...chB, currentHp: chB.hp + (chB.level * 8) };
  const logs = [];

  const firstA = (a.spd + randomInt(0, 8)) >= (b.spd + randomInt(0, 8));

  const attack = (attacker, defender, attackerLabel) => {
    const base = attacker.atk + randomInt(3, 12);
    const reduced = Math.max(4, base - Math.floor(defender.def * 0.55));
    defender.currentHp = Math.max(0, defender.currentHp - reduced);
    logs.push(`${attackerLabel} pega **${reduced}** de daño.`);
  };

  for (let round = 1; round <= 20; round++) {
    logs.push(`\n**Ronda ${round}**`);

    if (firstA) {
      attack(a, b, '🐥 Tu pollito');
      if (b.currentHp <= 0) return { winner: 'A', logs, a, b };
      attack(b, a, '🐔 Rival');
      if (a.currentHp <= 0) return { winner: 'B', logs, a, b };
    } else {
      attack(b, a, '🐔 Rival');
      if (a.currentHp <= 0) return { winner: 'B', logs, a, b };
      attack(a, b, '🐥 Tu pollito');
      if (b.currentHp <= 0) return { winner: 'A', logs, a, b };
    }
  }

  if (a.currentHp === b.currentHp) return { winner: 'draw', logs, a, b };
  return a.currentHp > b.currentHp
    ? { winner: 'A', logs, a, b }
    : { winner: 'B', logs, a, b };
}

module.exports = {
  name: 'pollito',
  help: {
    purpose: 'Sistema de pollito de pelea estilo UnbelievaBoat.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = getGuildConfig(guildId);

    const sub = String(args[0] || 'stats').toLowerCase();

    if (sub === 'help' || sub === 'ayuda') {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🐥 Comandos de Pollito')
            .setColor(0xF1C40F)
            .setDescription([
              '`-pollito hatch <nombre>`',
              '`-pollito stats`',
              '`-pollito rename <nombre>`',
              '`-pollito train`',
              '`-pollito fight @usuario [apuesta]`',
              '`-pollito top`',
            ].join('\n')),
        ],
      });
    }

    if (sub === 'hatch' || sub === 'create') {
      const name = String(args.slice(1).join(' ').trim() || 'Pollito').slice(0, 24);
      const created = createChicken(guildId, userId, name);
      if (!created) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('ℹ️ Ya tienes pollito').setColor(0x5865F2).setDescription('Usa `-pollito stats` para verlo.')],
        });
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🐣 ¡Nació tu pollito!')
            .setColor(0x2ECC71)
            .setDescription(`Tu pollito se llama **${created.name}**.`)
            .addFields({ name: 'Stats iniciales', value: statsBlock(created), inline: false }),
        ],
      });
    }

    const chicken = getChicken(guildId, userId);
    if (!chicken) {
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('❌ No tienes pollito').setColor(0xED4245).setDescription('Crea uno primero con `-pollito hatch <nombre>`.')],
      });
    }

    if (sub === 'stats') {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle(`🐥 ${chicken.name}`)
            .setColor(0xF1C40F)
            .setDescription(statsBlock(chicken))
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'rename' || sub === 'name') {
      const newName = String(args.slice(1).join(' ').trim() || '').slice(0, 24);
      if (!newName) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Falta nombre').setColor(0xED4245).setDescription('Uso: `-pollito rename <nombre>`')],
        });
      }

      const updated = setChickenName(guildId, userId, newName);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('✅ Nombre actualizado').setColor(0x2ECC71).setDescription(`Tu pollito ahora se llama **${updated.name}**.`)],
      });
    }

    if (sub === 'train') {
      const remaining = Math.max(0, TRAIN_COOLDOWN_MS - (Date.now() - (chicken.lastTrainAt || 0)));
      if (remaining > 0) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('⏳ Entrenamiento en cooldown').setColor(0xE67E22).setDescription(`Podés entrenar de nuevo en **${cooldownText(remaining)}**.`)],
        });
      }

      const expGain = randomInt(30, 70);
      const statOptions = ['atk', 'def', 'spd', 'hp'];
      const chosenStat = statOptions[randomInt(0, statOptions.length - 1)];
      const statGain = chosenStat === 'hp' ? randomInt(4, 10) : randomInt(1, 3);

      addStat(guildId, userId, chosenStat, statGain);
      gainExp(guildId, userId, expGain);
      setTrainCooldown(guildId, userId, Date.now());

      const updated = getChicken(guildId, userId);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏋️ Entrenamiento completado')
            .setColor(0x3498DB)
            .setDescription([
              `Ganaste **${expGain} EXP**.`,
              `Subida de stat: **${chosenStat.toUpperCase()} +${statGain}**`,
              '',
              statsBlock(updated),
            ].join('\n')),
        ],
      });
    }

    if (sub === 'top') {
      const ranking = getChickenLeaderboard(guildId, 10);
      if (!ranking.length) {
        return message.reply({ embeds: [new EmbedBuilder().setTitle('🏆 Top Pollitos').setColor(0x5865F2).setDescription('No hay pollitos registrados aún.')] });
      }

      const lines = ranking.map((item, idx) => `${idx + 1}. <@${item.userId}> — **${item.name}** (Lv.${item.level}) • Score ${item.score}`);
      return message.reply({
        embeds: [new EmbedBuilder().setTitle('🏆 Top Pollitos').setColor(0xF1C40F).setDescription(lines.join('\n')).setTimestamp()],
      });
    }

    if (sub === 'fight') {
      const target = await resolveUserTarget(message, args[1]);
      if (!target || target.user?.bot || target.id === userId) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ Uso inválido').setColor(0xED4245).setDescription('Uso: `-pollito fight @usuario|userId [apuesta]`')],
        });
      }

      const rival = getChicken(guildId, target.id);
      if (!rival) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('❌ El rival no tiene pollito').setColor(0xED4245).setDescription('Ese usuario debe crear su pollito primero.')],
        });
      }

      const remaining = Math.max(0, FIGHT_COOLDOWN_MS - (Date.now() - (chicken.lastFightAt || 0)));
      if (remaining > 0) {
        return message.reply({
          embeds: [new EmbedBuilder().setTitle('⏳ Pelea en cooldown').setColor(0xE67E22).setDescription(`Podés pelear de nuevo en **${cooldownText(remaining)}**.`)],
        });
      }

      let betAmount = 0;
      if (args[2]) {
        const parsed = parseAmountInput(args.slice(2).join(' '), getUserBalance(guildId, userId).wallet);
        betAmount = parsed || 0;
      }

      if (betAmount > 0) {
        const yourBalance = getUserBalance(guildId, userId);
        const rivalBalance = getUserBalance(guildId, target.id);
        if (yourBalance.wallet < betAmount || rivalBalance.wallet < betAmount) {
          return message.reply({
            embeds: [new EmbedBuilder().setTitle('❌ Apuesta inválida').setColor(0xED4245).setDescription('Ambos usuarios deben tener saldo suficiente para esa apuesta.')],
          });
        }
      }

      setFightCooldown(guildId, userId, Date.now());
      const result = simulateFight(chicken, rival);

      if (result.winner === 'A') {
        addWin(guildId, userId);
        addLoss(guildId, target.id);
        gainExp(guildId, userId, randomInt(60, 120));
        gainExp(guildId, target.id, randomInt(20, 45));
        if (betAmount > 0) transferWallet(guildId, target.id, userId, betAmount);
      } else if (result.winner === 'B') {
        addLoss(guildId, userId);
        addWin(guildId, target.id);
        gainExp(guildId, target.id, randomInt(60, 120));
        gainExp(guildId, userId, randomInt(20, 45));
        if (betAmount > 0) transferWallet(guildId, userId, target.id, betAmount);
      } else {
        gainExp(guildId, userId, randomInt(30, 55));
        gainExp(guildId, target.id, randomInt(30, 55));
      }

      const summary = result.logs.slice(0, 12).join('\n');
      const verdict = result.winner === 'A'
        ? `🏆 Ganó **${chicken.name}**`
        : result.winner === 'B'
          ? `💥 Perdiste contra **${rival.name}**`
          : '🤝 Empate total';

      const betText = betAmount > 0
        ? `\nApuesta: ${formatCurrency(betAmount, config)} (${result.winner === 'A' ? 'la ganaste' : result.winner === 'B' ? 'la perdiste' : 'sin cambios'})`
        : '';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🐔 Pelea de Pollitos')
            .setColor(result.winner === 'A' ? 0x2ECC71 : result.winner === 'B' ? 0xED4245 : 0x5865F2)
            .setDescription(`${verdict}${betText}\n\n${summary}`.slice(0, 3900))
            .setTimestamp(),
        ],
      });
    }

    return message.reply({
      embeds: [new EmbedBuilder().setTitle('📖 Uso: -pollito').setColor(0x5865F2).setDescription('Usa `-pollito help` para ver comandos.')],
    });
  },
};

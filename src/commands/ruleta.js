const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, getRemainingCooldown, setCooldown } = require('../utils/economyStore');
const { formatCurrency, cooldownText } = require('../utils/economyHelpers');
const { getRuletaState, bumpRuletaChance, resetRuletaChance, DEFAULT_CHANCE } = require('../utils/ruletaStore');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const MIN_TIMEOUT_MS = 60 * 1000;
const RULETA_DAILY_MS = 24 * 60 * 60 * 1000;

async function animateReply(interaction, frames, delayMs) {
  for (const frame of frames) {
    const edited = await interaction.editReply({ embeds: [frame] }).catch(() => null);
    if (!edited) break;
    await wait(delayMs);
  }
}

const SAFE_OUTCOMES = [
  {
    key: 'click_saved',
    title: '😮‍💨 Click... salvado',
    description: username => `**${username}** apretó el gatillo y solo sonó *click*. Hoy zafaste de una.`,
    color: 0x2ECC71,
  },
  {
    key: 'adrenaline',
    title: '🫀 Subidón de adrenalina',
    description: username => `**${username}** sobrevivió y ahora está temblando como hoja.`,
    color: 0x1ABC9C,
  },
  {
    key: 'crowd_laugh',
    title: '😂 El chat se ríe',
    description: username => `**${username}** se creyó protagonista y el server lo descansó fuerte.`,
    color: 0xF1C40F,
  },
  {
    key: 'tiny_timeout',
    title: '🫥 Mini blackout',
    description: username => `**${username}** no explotó, pero quedó en blanco unos segundos mirando al vacío.`,
    color: 0xE67E22,
  },
];

function pickSafeOutcome() {
  const index = Math.floor(Math.random() * SAFE_OUTCOMES.length);
  return SAFE_OUTCOMES[index];
}

async function getGuildMember(interaction) {
  if (!interaction.guild) return null;

  const cached = interaction.member;
  if (cached && typeof cached.timeout === 'function') {
    return cached;
  }

  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

async function applyTimeout(member, durationMs, reason) {
  if (!member || typeof member.timeout !== 'function') {
    return { ok: false, reason: 'missing_member' };
  }

  const guild = member.guild;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    return { ok: false, reason: 'missing_bot_member' };
  }

  if (!me.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return { ok: false, reason: 'bot_missing_permission' };
  }

  if (member.id === member.guild.ownerId) {
    return { ok: false, reason: 'target_is_owner' };
  }

  if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) {
    return { ok: false, reason: 'target_is_admin' };
  }

  if (!member.moderatable) {
    return { ok: false, reason: 'not_moderatable' };
  }

  const safeDuration = Math.max(MIN_TIMEOUT_MS, Math.floor(durationMs || 0));

  try {
    await member.timeout(safeDuration, reason);
    const refreshed = await member.guild.members.fetch(member.id).catch(() => null);
    const until = refreshed?.communicationDisabledUntilTimestamp || 0;
    const now = Date.now();
    const remaining = Math.max(0, until - now);

    if (remaining <= 2_000) {
      return { ok: false, reason: 'not_applied' };
    }

    const minimumExpected = Math.floor(safeDuration * 0.85);
    if (remaining < minimumExpected) {
      return {
        ok: false,
        reason: 'applied_too_low',
        requestedMs: safeDuration,
        remainingMs: remaining,
      };
    }

    return { ok: true, requestedMs: safeDuration, remainingMs: remaining };
  } catch (error) {
    return { ok: false, reason: 'error', errorMessage: error?.message || null };
  }
}

function formatTimeoutFailure(timeoutResult) {
  const reason = timeoutResult?.reason;
  if (reason === 'bot_missing_permission') return '⚠️ Me falta permiso de timeout (`Moderate Members`).';
  if (reason === 'missing_bot_member') return '⚠️ No pude resolver mi miembro del servidor para moderar.';
  if (reason === 'target_is_owner') return '⚠️ No se puede aplicar timeout al owner del servidor.';
  if (reason === 'target_is_admin') return '⚠️ No se puede aplicar timeout a un usuario con admin.';
  if (reason === 'not_moderatable') return '⚠️ No pude aplicar timeout por jerarquía/permisos.';
  if (reason === 'not_applied') return '⚠️ Discord no confirmó el timeout en este intento.';
  if (reason === 'applied_too_low') {
    const secs = Math.round((timeoutResult?.remainingMs || 0) / 1000);
    return `⚠️ Discord aplicó un timeout más corto de lo esperado (${secs}s).`;
  }
  return '⚠️ No pude aplicar timeout (permisos/jerarquía).';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ruleta')
    .setDescription('Ruleta rusa — ¿te animás?'),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({
        content: 'Este comando solo se puede usar dentro de un servidor.',
        ephemeral: true,
      });
    }

    const member = await getGuildMember(interaction);
    const config = getGuildConfig(interaction.guild.id);
    const remaining = getRemainingCooldown(interaction.guild.id, interaction.user.id, 'ruleta_daily', RULETA_DAILY_MS);
    if (remaining > 0) {
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('⏳ Ruleta en cooldown')
            .setColor(0xE67E22)
            .setDescription(`Podés volver a usar /ruleta en **${cooldownText(remaining)}**.`),
        ],
        ephemeral: true,
      });
    }

    const stateBefore = getRuletaState(interaction.guild.id);
    const bangChance = stateBefore.currentChance;
    const isBang = Math.random() < bangChance;

    setCooldown(interaction.guild.id, interaction.user.id, 'ruleta_daily', Date.now());

    await interaction.deferReply();

    const animFrames = [
      new EmbedBuilder()
        .setTitle('🔫 Ruleta Rusa')
        .setDescription(`**${interaction.user.username}** gira el tambor...`)
        .setColor(0x5865F2),
      new EmbedBuilder()
        .setTitle('🔫 Ruleta Rusa')
        .setDescription(`**${interaction.user.username}** apunta y respira hondo...`)
        .setColor(0x5865F2),
      new EmbedBuilder()
        .setTitle('🔫 Ruleta Rusa')
        .setDescription(`**${interaction.user.username}** aprieta el gatillo...`)
        .setColor(0x5865F2),
    ];

    await animateReply(interaction, animFrames, 550);

    let resultEmbed;

    if (isBang) {
      resetRuletaChance(interaction.guild.id);
      const timeoutMs = FIFTEEN_MINUTES_MS;
      const timeoutLabel = 15;

      const timeoutResult = await applyTimeout(member, timeoutMs, `Ruleta rusa: BANG (${timeoutLabel} minutos)`)
        .catch(() => ({ ok: false, reason: 'error' }));

      const timeoutText = timeoutResult.ok
        ? `⛔ Castigo: timeout por **${timeoutLabel} minutos** aplicado.`
        : formatTimeoutFailure(timeoutResult);

      resultEmbed = new EmbedBuilder()
        .setTitle('🔫 Ruleta Rusa • BANG')
        .setDescription([
          `💥 **${interaction.user.username}** apretó el gatillo y... **BANG**.`,
          timeoutText,
          '',
          'Dolió, pero no hubo recompensa.',
        ].join('\n'))
        .setColor(0xE74C3C)
        .setFooter({ text: `Chance de BANG: ${(bangChance * 100).toFixed(2)}% • Cooldown: 24h` })
        .setTimestamp();
    } else {
      const stateAfter = bumpRuletaChance(interaction.guild.id);
      const outcome = pickSafeOutcome();
      let extraLine = '';

      if (outcome.timeoutMs) {
        const timeoutResult = await applyTimeout(member, outcome.timeoutMs, outcome.timeoutReason)
          .catch(() => ({ ok: false, reason: 'error' }));
        extraLine = timeoutResult.ok
          ? `\n⏱️ Efecto: timeout por **${Math.round((timeoutResult.requestedMs || outcome.timeoutMs) / 1000)}s** aplicado.`
          : `\n${formatTimeoutFailure(timeoutResult)}`;
      }

      resultEmbed = new EmbedBuilder()
        .setTitle(`🔫 Ruleta Rusa • ${outcome.title}`)
        .setDescription([
          outcome.description(interaction.user.username),
          `🎯 Chance actual de BANG: **${(bangChance * 100).toFixed(2)}%**`,
          `📈 Próxima chance del servidor: **${(stateAfter.currentChance * 100).toFixed(2)}%**`,
          extraLine ? extraLine.trim() : null,
        ].filter(Boolean).join('\n'))
        .setColor(outcome.color)
        .setFooter({ text: `Chance de BANG: ${(bangChance * 100).toFixed(2)}% • Cooldown: 24h` })
        .setTimestamp();
    }

    await interaction.editReply({ embeds: [resultEmbed] });
  }
};
'use strict';

const {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const config = require('../config');
const { replyEmbed, replyError } = require('../utils/respond');
const {
  getAura,
  addAura,
  setAura,
  setBanned,
  setLastClaim,
  resetUser,
  getAuraLeaderboard,
} = require('../utils/auraStore');

const AURA_COOLDOWN_MS = 20 * 60 * 60 * 1000; // 20h
const TOP_LIMIT = 10;

// ── Rangos rebalanceados: nada de números astronómicos.
// Rango total realista: -500 a +1500 por claim. Cap de vida: -5000 a +50000.
const AURA_BUCKETS = [
  { weight: 8,  label: 'Aura drenada',   roll: () => -randomInt(50, 500) },
  { weight: 22, label: 'Aura baja',      roll: () => randomInt(10, 80) },
  { weight: 30, label: 'Aura normal',    roll: () => randomInt(80, 250) },
  { weight: 22, label: 'Aura buena',     roll: () => randomInt(250, 500) },
  { weight: 12, label: 'Aura alta',      roll: () => randomInt(500, 900) },
  { weight: 5,  label: 'Aura épica',     roll: () => randomInt(900, 1300) },
  { weight: 1,  label: 'Aura legendaria',roll: () => randomInt(1300, 1500) },
];

const AURA_CAP_MIN = -5000;
const AURA_CAP_MAX = 50000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPick(items) {
  const total = items.reduce((acc, item) => acc + item.weight, 0);
  const roll = Math.random() * total;
  let cursor = 0;
  for (const item of items) {
    cursor += item.weight;
    if (roll <= cursor) return item;
  }
  return items[items.length - 1];
}

function rollAuraDelta() {
  const totalWeight = AURA_BUCKETS.reduce((a, b) => a + b.weight, 0);
  const picked = weightedPick(AURA_BUCKETS);
  return { delta: picked.roll(), label: picked.label, chance: picked.weight / totalWeight };
}

function clampAura(value) {
  return Math.max(AURA_CAP_MIN, Math.min(AURA_CAP_MAX, value));
}

function formatAura(value) {
  const num = Number(value) || 0;
  return new Intl.NumberFormat('es-UY').format(num);
}

function cooldownText(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function getResultTitle(delta) {
  if (delta < 0) return '🧿 Aura drenada';
  if (delta < 100) return '✨ Aura humilde';
  if (delta < 400) return '🌟 Aura decente';
  if (delta < 900) return '🔥 Buena racha';
  return '🛸 Racha legendaria';
}

module.exports = {
  visibility: 'public',
  data: new SlashCommandBuilder()
    .setName('aura')
    .setDescription('Sistema de aura del servidor.')
    .addSubcommand((sub) => sub.setName('claim').setDescription('Reclamá tu aura diaria (cada 20h).'))
    .addSubcommand((sub) => sub.setName('status').setDescription('Ve tu aura actual y tu cooldown.'))
    .addSubcommand((sub) => sub.setName('top').setDescription('Muestra el ranking de aura del servidor.'))
    .addSubcommand((sub) =>
      sub
        .setName('reset')
        .setDescription('[Admin] Resetea el aura de un usuario a 0.')
        .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a resetear').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('ban')
        .setDescription('[Admin] Banea o desbanea a un usuario del sistema de aura.')
        .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a banear/desbanear').setRequired(true))
        .addBooleanOption((opt) => opt.setName('activo').setDescription('true = banear, false = desbanear').setRequired(true)),
    )
    .addSubcommandGroup((group) =>
      group
        .setName('cd')
        .setDescription('[Admin] Gestión de cooldown de aura.')
        .addSubcommand((sub) =>
          sub
            .setName('reset')
            .setDescription('[Admin] Resetea el cooldown de un usuario.')
            .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario').setRequired(true)),
        ),
    )
    .setDMPermission(false),

  async execute(interaction) {
    const sub = interaction.options.getSubcommand();
    const group = interaction.options.getSubcommandGroup(false);
    const guildId = interaction.guildId;

    // ── Subcomandos de administrador ──
    if (sub === 'reset' || sub === 'ban' || (group === 'cd' && sub === 'reset')) {
      if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return replyError(interaction, 'Este comando requiere permisos de **Administrador**.');
      }

      const target = interaction.options.getUser('usuario', true);

      if (sub === 'reset') {
        await resetUser(guildId, target.id);
        const embed = new EmbedBuilder()
          .setTitle('🧹 Aura reseteada')
          .setColor(config.colors.warning)
          .setDescription(`El aura de <@${target.id}> fue reseteada a **0**.`);
        return replyEmbed(interaction, { embed, pings: false });
      }

      if (sub === 'ban') {
        const activo = interaction.options.getBoolean('activo', true);
        await setBanned(guildId, target.id, activo);
        const embed = new EmbedBuilder()
          .setTitle(activo ? '🚫 Usuario baneado de aura' : '✅ Usuario desbaneado de aura')
          .setColor(activo ? config.colors.danger : config.colors.success)
          .setDescription(`<@${target.id}> ${activo ? 'ya no puede usar el sistema de aura ni aparecer en el top.' : 'puede volver a usar el sistema de aura.'}`);
        return replyEmbed(interaction, { embed, pings: false });
      }

      if (group === 'cd' && sub === 'reset') {
        await setLastClaim(guildId, target.id, 0);
        const embed = new EmbedBuilder()
          .setTitle('⏱️ Cooldown reseteado')
          .setColor(config.colors.success)
          .setDescription(`<@${target.id}> ya puede usar \`/aura claim\` de nuevo.`);
        return replyEmbed(interaction, { embed, pings: false });
      }
    }

    // ── Top: embed normal público con 2 columnas (positiva / negativa) ──
    if (sub === 'top') {
      const [positivos, negativos] = await Promise.all([
        getAuraLeaderboard(guildId, TOP_LIMIT, 'desc'),
        getAuraLeaderboard(guildId, TOP_LIMIT, 'asc'),
      ]);

      const positivosFiltrados = positivos.filter((e) => e.aura > 0);
      const negativosFiltrados = negativos.filter((e) => e.aura < 0).reverse();

      const colPositiva = positivosFiltrados.length
        ? positivosFiltrados.map((e, i) => `**${i + 1}.** <@${e.userId}> — **${formatAura(e.aura)}**`).join('\n')
        : 'Sin datos todavía.';

      const colNegativa = negativosFiltrados.length
        ? negativosFiltrados.map((e, i) => `**${i + 1}.** <@${e.userId}> — **${formatAura(e.aura)}**`).join('\n')
        : 'Sin datos todavía.';

      const embed = new EmbedBuilder()
        .setTitle('🏆 Top Aura')
        .setColor(config.colors.primary)
        .addFields(
          { name: '✨ Aura Positiva', value: colPositiva, inline: true },
          { name: '🧿 Aura Negativa', value: colNegativa, inline: true },
        )
        .setFooter({ text: interaction.guild.name })
        .setTimestamp();
      return replyEmbed(interaction, { embed, pings: true });
    }

    // ── Status ──
    if (sub === 'status') {
      const data = await getAura(guildId, interaction.user.id);
      const remaining = data.lastClaim ? Math.max(0, AURA_COOLDOWN_MS - (Date.now() - data.lastClaim)) : 0;

      if (data.banned) {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Estás baneado del sistema de aura')
          .setColor(config.colors.danger);
        return replyEmbed(interaction, { embed, pings: false });
      }

      const embed = new EmbedBuilder()
        .setTitle('🧿 Tu Aura')
        .setColor(config.colors.primary)
        .addFields(
          { name: 'Aura actual', value: `**${formatAura(data.aura)}**`, inline: true },
          {
            name: 'Próximo claim',
            value: remaining > 0 ? `En **${cooldownText(remaining)}**` : '**Disponible ahora**',
            inline: true,
          },
        );
      return replyEmbed(interaction, { embed, pings: false });
    }

    // ── Claim ──
    if (sub === 'claim') {
      const data = await getAura(guildId, interaction.user.id);

      if (data.banned) {
        const embed = new EmbedBuilder()
          .setTitle('🚫 Estás baneado del sistema de aura')
          .setColor(config.colors.danger);
        return replyEmbed(interaction, { embed, pings: false });
      }

      const remaining = data.lastClaim ? Math.max(0, AURA_COOLDOWN_MS - (Date.now() - data.lastClaim)) : 0;
      if (remaining > 0) {
        const embed = new EmbedBuilder()
          .setTitle('⏳ Aura en cooldown')
          .setColor(config.colors.warning)
          .setDescription(`Podés reclamar de nuevo en **${cooldownText(remaining)}**.`);
        return replyEmbed(interaction, { embed, pings: false });
      }

      const roll = rollAuraDelta();
      const nextValue = clampAura(data.aura + roll.delta);
      const applied = nextValue - data.aura;

      await setAura(guildId, interaction.user.id, nextValue);
      await setLastClaim(guildId, interaction.user.id, Date.now());

      const embed = new EmbedBuilder()
        .setTitle(getResultTitle(applied))
        .setColor(applied >= 0 ? config.colors.success : config.colors.danger)
        .setDescription(
          [
            `Obtuviste: **${applied >= 0 ? '+' : ''}${formatAura(applied)} aura**`,
            `Rango: **${roll.label}** (${(roll.chance * 100).toFixed(1)}% de probabilidad)`,
            '',
            `Aura total: **${formatAura(nextValue)}**`,
          ].join('\n'),
        )
        .setFooter({ text: interaction.user.tag })
        .setTimestamp();
      return replyEmbed(interaction, { embed, pings: true });
    }

    return replyError(interaction, 'Subcomando desconocido.');
  },
};
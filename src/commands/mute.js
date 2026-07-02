'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { sendModerationDm } = require('../utils/moderationDm');
const { addModerationLog } = require('../utils/moderationLogStore');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const { ensureMuteRole } = require('../utils/muteRoleStore');
const { setMuteTimer, clearMuteTimer } = require('../utils/muteRuntime');
const { query } = require('../utils/database');

const MAX_MUTE_MS = 365 * 24 * 60 * 60 * 1000;

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Sistema de mute por rol.')
    .addSubcommand((sub) =>
      sub
        .setName('usuario')
        .setDescription('Mutea a un usuario por un tiempo determinado.')
        .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a mutear').setRequired(true))
        .addStringOption((opt) =>
          opt
            .setName('duracion')
            .setDescription('Ej: 30m, 1h, 1d, 1mo, 1a (combinable: "1h30m")')
            .setRequired(true),
        )
        .addStringOption((opt) => opt.setName('razon').setDescription('Razón del mute').setRequired(false)),
    )
    .addSubcommand((sub) => sub.setName('role-create').setDescription('Crea o recupera el rol de mute y sincroniza permisos en todos los canales.'))
    .addSubcommand((sub) => sub.setName('role-check').setDescription('Verifica el estado actual del rol de mute.'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const sub = interaction.options.getSubcommand();

    if (sub === 'role-create') return handleRoleCreate(interaction);
    if (sub === 'role-check') return handleRoleCheck(interaction);
    return handleMuteUser(interaction);
  },
};

async function handleRoleCreate(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }); // ephemeral

  const result = await ensureMuteRole(interaction.guild, {
    createIfMissing: true,
    syncChannels: true,
    reason: `Mute role creado por ${interaction.user.tag}`,
  });

  const embed = new EmbedBuilder()
    .setTitle('🔇 Rol de mute listo')
    .setColor(config.colors.warning)
    .setDescription(
      [
        result.created ? 'Se creó el rol de mute.' : 'El rol de mute ya existía (recuperado).',
        `Rol: <@&${result.role.id}>`,
        `Canales sincronizados: **${result.channelsSynced}**`,
        `Canales con error: **${result.channelsFailed}**`,
      ].join('\n'),
    )
    .setTimestamp();

  return replyEmbed(interaction, { embed });
}

async function handleRoleCheck(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const result = await ensureMuteRole(interaction.guild, { createIfMissing: false, syncChannels: false });

  if (!result.role) {
    const embed = new EmbedBuilder()
      .setTitle('⚠️ Rol de mute no encontrado')
      .setColor(config.colors.danger)
      .setDescription('No hay un rol de mute configurado. Usá `/mute role-create` para crearlo.');
    return replyEmbed(interaction, { embed });
  }

  const embed = new EmbedBuilder()
    .setTitle('🔎 Estado del rol de mute')
    .setColor(config.colors.info)
    .setDescription(`Rol: <@&${result.role.id}>\nMiembros con el rol: **${result.role.members.size}**`)
    .setTimestamp();

  return replyEmbed(interaction, { embed });
}

async function handleMuteUser(interaction) {
  const targetUser = interaction.options.getUser('usuario', true);
  const durationRaw = interaction.options.getString('duracion', true);
  const razon = interaction.options.getString('razon') || 'Sin razón especificada';

  if (targetUser.id === interaction.user.id) {
    return replyError(interaction, 'No te podés mutear a vos mismo.');
  }

  const durationMs = parseDuration(durationRaw);
  if (!durationMs) {
    return replyError(interaction, 'Duración inválida. Ejemplos válidos: `30m`, `1h`, `1d`, `1mo`, `1a`, `1h30m`.');
  }
  if (durationMs > MAX_MUTE_MS) {
    return replyError(interaction, 'La duración máxima es 1 año.');
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
  if (!targetMember) {
    return replyError(interaction, 'Ese usuario no está en el servidor.');
  }
  if (!targetMember.manageable) {
    return replyError(interaction, 'No puedo mutear a ese usuario (jerarquía de roles o permisos).');
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const muteRoleResult = await ensureMuteRole(interaction.guild, {
    createIfMissing: true,
    syncChannels: false,
    reason: `Mute role recuperado por ${interaction.user.tag}`,
  });

  if (!muteRoleResult.role) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setColor(config.colors.danger)
      .setDescription('Primero creá el rol de mute con `/mute role-create`.');
    return replyEmbed(interaction, { embed });
  }

  const botMember = interaction.guild.members.me;
  if (botMember.roles.highest.comparePositionTo(muteRoleResult.role) <= 0) {
    const embed = new EmbedBuilder()
      .setTitle('❌ Error')
      .setColor(config.colors.danger)
      .setDescription('El rol de mute está por encima de mi rol más alto. Subilo en la jerarquía y probá de nuevo.');
    return replyEmbed(interaction, { embed });
  }

  await targetMember.roles.add(muteRoleResult.role.id, `${razon} | Mod: ${interaction.user.tag}`);

  if (targetMember.voice?.channelId) {
    await targetMember.voice.disconnect().catch(() => null);
  }

  const expiresAt = new Date(Date.now() + durationMs);

  await query(
    `INSERT INTO active_mutes (guild_id, user_id, expires_at, role_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE expires_at = VALUES(expires_at), role_id = VALUES(role_id)`,
    [interaction.guildId, targetUser.id, expiresAt, muteRoleResult.role.id],
  );

  clearMuteTimer(interaction.guildId, targetUser.id);
  setMuteTimer(interaction.guildId, targetUser.id, durationMs, async () => {
    const guild = interaction.client.guilds.cache.get(interaction.guildId);
    if (!guild) return;
    const member = guild.members.cache.get(targetUser.id) || (await guild.members.fetch(targetUser.id).catch(() => null));
    if (member?.roles.cache.has(muteRoleResult.role.id)) {
      await member.roles.remove(muteRoleResult.role.id, 'Mute expirado').catch(() => null);
    }
    await query('DELETE FROM active_mutes WHERE guild_id = ? AND user_id = ?', [interaction.guildId, targetUser.id]);

    const expiredEmbed = new EmbedBuilder()
      .setTitle('🔊 Mute expirado')
      .setColor(config.colors.success)
      .setDescription(`<@${targetUser.id}> fue desmuteado automáticamente (mute expirado).`)
      .setTimestamp();
    await postToModLog(interaction.client, config.modLogChannelId, expiredEmbed);
  });

  await sendModerationDm(targetUser, {
    title: '🔇 Has sido muteado en el servidor',
    color: config.colors.warning,
    description: 'Se aplicó un mute a tu cuenta.',
    fields: [
      { name: 'Duración', value: formatDuration(durationMs), inline: true },
      { name: 'Razón', value: razon },
    ],
    moderatorTag: interaction.user.tag,
    guildName: interaction.guild.name,
  });

  await addModerationLog({
    tipo: 'mute',
    guildId: interaction.guildId,
    targetId: targetUser.id,
    targetTag: targetUser.tag,
    moderatorId: interaction.user.id,
    moderatorTag: interaction.user.tag,
    razon,
    durationMs,
    durationText: formatDuration(durationMs),
    expiresAt,
  });

  const publicEmbed = new EmbedBuilder()
    .setTitle('🔇 Mute aplicado')
    .setColor(config.colors.warning)
    .addFields(
      { name: 'Usuario', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
      { name: 'Moderador', value: interaction.user.tag, inline: true },
      { name: 'Duración', value: formatDuration(durationMs), inline: true },
      { name: 'Razón', value: razon },
      { name: 'Desmutea', value: `<t:${Math.floor(expiresAt.getTime() / 1000)}:F>` },
    )
    .setTimestamp();

  // Pinguea al usuario -> respuesta pública
  await replyEmbed(interaction, { embed: publicEmbed, pings: true, content: `<@${targetUser.id}>` });
  await postToModLog(interaction.client, config.modLogChannelId, publicEmbed);
}

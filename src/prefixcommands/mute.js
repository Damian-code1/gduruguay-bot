const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const {
  ensureMuteRoleConfiguration,
} = require('../utils/muteRoleStore');
const { setMuteTimer, clearMuteTimer } = require('../utils/muteRuntime');
const { sendModerationDm } = require('../utils/moderationDm');

const MAX_MUTE_DURATION_MS = 365 * 24 * 60 * 60 * 1000;

function getReadableDiscordError(error) {
  const code = error?.code;
  const message = String(error?.message || '');

  if (code === 50013) {
    return 'No tengo permisos suficientes para aplicar ese mute. Revisá la jerarquía de roles y los permisos del bot.';
  }

  if (message.includes('Missing Permissions')) {
    return 'No tengo permisos suficientes para aplicar ese mute. Revisá la jerarquía de roles y los permisos del bot.';
  }

  if (message.includes('Missing Access')) {
    return 'No tengo acceso suficiente para completar esa acción en el servidor.';
  }

  return null;
}

function isDurationToken(token) {
  return /^\d+\s*(?:mo|a|[smhd])$/i.test(String(token || '').trim());
}

function parseDurationTokens(args) {
  const durationArgs = [];
  const reasonArgs = [];
  let parsingDuration = true;

  for (const arg of args) {
    if (parsingDuration && isDurationToken(arg)) {
      durationArgs.push(arg);
      continue;
    }
    parsingDuration = false;
    reasonArgs.push(arg);
  }

  const durationRaw = durationArgs.join('');
  const durationMs = parseDuration(durationRaw);
  return {
    durationMs,
    durationText: durationArgs.join(' '),
    reason: reasonArgs.join(' ').trim() || 'Sin razón especificada',
  };
}

function formatHelp() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -mute')
    .setDescription('Aplica mute por rol con permisos por canal y voz.')
    .addFields(
      {
        name: 'Uso',
        value: [
          '`-mute @usuario <duración> [razón]`',
          '`-mute role create`',
          '`-mute role check`',
          '`-mute logs [@usuario]`',
          '`-unmute @usuario`',
        ].join('\n'),
      },
      {
        name: 'Formatos de duración',
        value: [
          '`1s` = 1 segundo',
          '`1m` = 1 minuto',
          '`1h` = 1 hora',
          '`1d` = 1 día',
          '`1mo` = 1 mes aprox. (30 días)',
          '`1a` = 1 año aprox. (365 días)',
          'Se pueden combinar: `1h 30m`, `2d 4h`, `1mo 2d`, etc.',
        ].join('\n'),
      },
      {
        name: 'Notas',
        value: 'Primero hay que crear el rol con `-mute role create`. El bot aplicará permisos para que no pueda escribir ni entrar a canales de voz.',
      },
      {
        name: 'Ejemplos',
        value: [
          '`-mute @pepito 30m spam`',
          '`-mute @pepito 1mo flood`',
          '`-mute @pepito 1a acoso`',
          '`-mute role create`',
          '`-mute logs @pepito`',
        ].join('\n'),
      },
    )
    .setColor(0xE67E22)
    .setFooter({ text: 'gduruguay bot' });
}

async function createMuteRole(message) {
  const result = await ensureMuteRoleConfiguration(message.guild, {
    createIfMissing: true,
    syncReason: 'Mute role sync (create)',
    createReason: `Mute role created by ${message.author.tag}`,
  });

  const statusLine = result.created
    ? 'Se creó el rol de mute.'
    : 'El rol de mute ya existía o fue recuperado.';

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🔇 Rol de mute listo')
        .setColor(0xE67E22)
        .setDescription([
          statusLine,
          `Rol: <@&${result.role.id}>`,
          `Canales sincronizados: **${result.channelsSynced}**`,
          `Canales con error: **${result.channelsFailed}**`,
          result.duplicatesFound > 0
            ? `Roles duplicados eliminados: **${result.duplicatesDeleted}**${result.duplicatesFailed ? ` | Fallaron: **${result.duplicatesFailed}**` : ''}`
            : 'No había roles duplicados.',
          'Ahora puedes usar `-mute @usuario <duración> [razón]`.',
        ].join('\n'))
        .setTimestamp(),
    ],
  });
}

async function checkMuteRole(message) {
  const result = await ensureMuteRoleConfiguration(message.guild, {
    createIfMissing: false,
    syncReason: 'Mute role sync (check)',
    createReason: `Mute role checked by ${message.author.tag}`,
  });

  if (!result.role) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Rol de mute no encontrado')
          .setColor(0xE74C3C)
          .setDescription('No hay un rol de mute configurado. Usá `-mute role create` para crearlo.')
          .setTimestamp(),
      ],
    });
  }

  const lines = [];
  lines.push(result.created ? 'Se creó el rol de mute.' : 'El rol de mute ya estaba creado.');
  if (result.adopted) lines.push('Se recuperó un rol existente y se guardó su ID.');
  lines.push(`Rol: <@&${result.role.id}>`);
  lines.push(`Canales sincronizados: **${result.channelsSynced}**`);
  lines.push(`Canales con error: **${result.channelsFailed}**`);

  if (result.duplicatesFound > 0) {
    lines.push(`Roles duplicados eliminados: **${result.duplicatesDeleted}**`);
    if (result.duplicatesFailed > 0) {
      lines.push(`Roles duplicados que no se pudieron borrar: **${result.duplicatesFailed}**`);
    }
  } else {
    lines.push('No se encontraron roles duplicados.');
  }

  return message.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle('🔎 Estado del rol de mute')
        .setColor(0x3498DB)
        .setDescription(lines.join('\n'))
        .setTimestamp(),
    ],
  });
}

module.exports = {
  name: 'mute',
  aliases: ['to', 'timeout'],
  help: {
    purpose: 'Aplica mute por rol a un usuario y configura el rol de mute del servidor.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = String(args[0] || '').toLowerCase();

    if (!sub || sub === 'help' || sub === 'ayuda' || sub === '?') {
      return message.reply({ embeds: [formatHelp()] });
    }

    if (sub === 'role' && String(args[1] || '').toLowerCase() === 'create') {
      return createMuteRole(message);
    }

    if (sub === 'role' && String(args[1] || '').toLowerCase() === 'check') {
      return checkMuteRole(message);
    }

    if (sub === 'logs') {
      const logsCommand = message.client.prefixCommands?.get('mutelogs');
      if (logsCommand) return logsCommand.execute(message, args.slice(1));
      return message.reply('❌ No se encontró el comando de logs de mute.');
    }

    const target = await resolveMemberTarget(message, args[0]);
    const objetivo = target?.member;
    if (!objetivo) {
      return message.reply({ embeds: [formatHelp()] });
    }

    if (objetivo.id === message.author.id) {
      return message.reply('❌ No te podés mutear a vos mismo.');
    }

    const muteRoleResult = await ensureMuteRoleConfiguration(message.guild, {
      createIfMissing: true,
      syncChannels: false,
      cleanupDuplicates: false,
      syncReason: 'Mute role sync (mute)',
      createReason: `Mute role recovered by ${message.author.tag}`,
    });

    if (!muteRoleResult.role) {
      return message.reply('❌ Primero creá el rol de mute con `-mute role create`.');
    }

    const { durationMs, reason } = parseDurationTokens(args.slice(1));
    if (!durationMs) {
      return message.reply('❌ Tenés que indicar una duración válida. Ej: `30m`, `1h`, `1mo`, `1a`.');
    }

    if (durationMs < 1000) {
      return message.reply('❌ La duración mínima es 1 segundo.');
    }

    if (durationMs > MAX_MUTE_DURATION_MS) {
      return message.reply('❌ La duración máxima es 1 año.');
    }

    if (!objetivo.manageable) {
      return message.reply('❌ No puedo mutear a ese usuario.');
    }

    const botMember = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
    if (!botMember) {
      return message.reply('❌ No pude comprobar mis permisos en el servidor.');
    }

    if (botMember.roles.highest.comparePositionTo(muteRoleResult.role) <= 0) {
      return message.reply('❌ El rol de mute está por encima de mi rol. Subilo en la jerarquía y probá de nuevo.');
    }

    const targetMember = message.guild.members.cache.get(objetivo.id) || await message.guild.members.fetch(objetivo.id).catch(() => objetivo);
    if (!targetMember) {
      return message.reply('❌ No pude volver a obtener ese usuario del servidor.');
    }

    try {
      await sendModerationDm(objetivo.user, {
        title: '🔇 Has sido muteado en el servidor',
        color: 0xE67E22,
        description: 'Se aplicó un mute a tu cuenta.',
        fields: [
          { name: 'Duración', value: formatDuration(durationMs), inline: true },
          { name: 'Razón', value: reason, inline: false },
        ],
        moderator: `${message.author.tag}`,
        guild: `${message.guild.name}`,
      }).catch(() => null);

      await targetMember.roles.add(muteRoleResult.role.id, reason);
      const verifiedMember = await message.guild.members.fetch({ user: targetMember.id, force: true }).catch(() => null);
      if (!verifiedMember || !verifiedMember.roles.cache.has(muteRoleResult.role.id)) {
        await targetMember.roles.add(muteRoleResult.role.id, `${reason} (retry)`).catch(() => null);
        const retryMember = await message.guild.members.fetch({ user: targetMember.id, force: true }).catch(() => null);
        if (!retryMember || !retryMember.roles.cache.has(muteRoleResult.role.id)) {
          throw new Error('El rol Muted no quedó asignado al usuario.');
        }
      }
    } catch (error) {
      console.error('Error aplicando mute role:', error);
      const readableError = getReadableDiscordError(error);
      return message.reply(readableError ? `❌ ${readableError}` : '❌ No pude aplicar el mute.');
    }

    if (objetivo.voice?.channelId && typeof objetivo.voice.setChannel === 'function') {
      await objetivo.voice.setChannel(null).catch(() => null);
    }

    clearMuteTimer(message.guild.id, objetivo.id);

    const now = Date.now();
    const unmuteAt = now + durationMs;

    setMuteTimer(message.guild.id, objetivo.id, durationMs, async () => {
      const guild = message.client.guilds.cache.get(message.guild.id) || await message.client.guilds.fetch(message.guild.id).catch(() => null);
      if (!guild) return;

      const member = guild.members.cache.get(objetivo.id) || await guild.members.fetch(objetivo.id).catch(() => null);
      if (!member) return;

      if (member.roles.cache.has(muteRoleResult.role.id)) {
        await member.roles.remove(muteRoleResult.role.id, 'Mute expirado').catch(() => null);
      }

      const logs = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../logs.json'), 'utf8'));
      logs.push({
        tipo: 'unmute',
        origen: 'bot',
        usuarioId: member.id,
        usuarioNombre: member.user.username,
        moderadorId: message.client.user.id,
        moderadorNombre: 'Sistema Mute',
        razon: 'Mute expirado',
        fecha: new Date().toISOString(),
        servidorId: guild.id,
      });
      require('fs').writeFileSync(require('path').join(__dirname, '../logs.json'), JSON.stringify(logs, null, 2));
    });

    const logs = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../logs.json'), 'utf8'));
    logs.push({
      tipo: 'mute',
      origen: 'bot',
      usuarioId: objetivo.id,
      usuarioNombre: objetivo.user.username,
      moderadorId: message.author.id,
      moderadorNombre: message.author.username,
      duracionMs: durationMs,
      duracionTexto: formatDuration(durationMs),
      razon: reason,
      fecha: new Date().toISOString(),
      servidorId: message.guild.id,
      expiresAt: unmuteAt,
      muteRoleId: muteRoleResult.role.id,
    });
    require('fs').writeFileSync(require('path').join(__dirname, '../logs.json'), JSON.stringify(logs, null, 2));

    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🔇 Mute aplicado')
          .setColor(0xE67E22)
          .setDescription([
            `Usuario: <@${objetivo.id}>`,
            `Duración: **${formatDuration(durationMs)}**`,
            `Razón: ${reason}`,
            `Desmutea: <t:${Math.floor(unmuteAt / 1000)}:F>`,
            `Rol: <@&${muteRoleResult.role.id}>`,
          ].join('\n'))
          .setTimestamp(),
      ],
    });
  },
};
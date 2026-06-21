const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isCommandAllowed, getAllowedChannels, formatAllowedChannels } = require('../utils/commandChannelManager');
const { getAfk, clearAfk, recordAfkMention } = require('../utils/afkStore');
const { getTargetReply, getAllTargetReplies } = require('../utils/targetReplyStore');
const { recordMessage, isRaiding, resetUser, BAN_COOLDOWN } = require('../utils/raidDetection');
const { hasDiscordInvite, findAllInvites } = require('../utils/inviteDetector');
const { addWarning } = require('../utils/warningsStore');
const { isStaff } = require('../utils/staffRolesStore');
const { tryGrantMessageReward } = require('../utils/economyStore');
const { isEconomySeasonLocked } = require('../utils/economySeasonStore');
const { getIncomeAction } = require('../utils/incomeActions');
const { tryGrantPassiveIncome } = require('../utils/passiveIncomeStore');
const { processOverdueLoan } = require('../utils/loanStore');
const { getEconomyBanStatus, isEconomyCommand } = require('../utils/economyBanStore');
const { formatDuration } = require('../utils/timeParser');
const { findDepartment, getDepartmentRoles } = require('../utils/departmentStore');
const { makeV2UsageReply } = require('../utils/usageReplyV2');
const { handleGiveawayMessage } = require('../utils/giveawayService');
const fs = require('fs');
const path = require('path');

const banCooldowns = new Map();
const processedMessages = new Set();
const recentCommandSignatures = new Map();
const spamTracker = new Map();
const spamWarningCooldowns = new Map();
const spamLoggedUsers = new Set();
const logsPath = path.join(__dirname, '../logs.json');
const LOG_CHANNEL_ID = '1496348718558089216';
const DEPARTMENT_CHANNEL_ID = '1502843326448013504';
const URUDASHER_ROLE_ID = '1487919461100163163';
const COMPONENTS_V2_FLAG = 32768;
const SPAM_WINDOW_MS = 12_000;
const SPAM_THRESHOLD = 8;
const SPAM_WARNING_COOLDOWN_MS = 90_000;

function isLikelyThirdPartyBotCommand(content) {
  const trimmed = String(content || '').trim();
  if (!trimmed) return false;
  if (/^[\$!.;?\/]/.test(trimmed)) return true;
  return /^([a-z0-9_-]+\s+)?\$[a-z0-9]/i.test(trimmed);
}

function registerSpamHit(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const current = (spamTracker.get(key) || []).filter(ts => now - ts < SPAM_WINDOW_MS);
  current.push(now);
  spamTracker.set(key, current);

  setTimeout(() => {
    const next = (spamTracker.get(key) || []).filter(ts => Date.now() - ts < SPAM_WINDOW_MS);
    if (next.length) spamTracker.set(key, next);
    else spamTracker.delete(key);
  }, SPAM_WINDOW_MS + 1000).unref?.();

  return current.length;
}

function canIssueSpamWarning(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const now = Date.now();
  const lastWarningAt = spamWarningCooldowns.get(key) || 0;
  if (now - lastWarningAt < SPAM_WARNING_COOLDOWN_MS) return false;
  spamWarningCooldowns.set(key, now);

  setTimeout(() => {
    if (spamWarningCooldowns.get(key) === now) {
      spamWarningCooldowns.delete(key);
    }
  }, SPAM_WARNING_COOLDOWN_MS + 1000).unref?.();

  return true;
}

function guardarLog(data) {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

async function sendAlertLog(message, embed) {
  const logChannel =
    message.guild.channels.cache.get(LOG_CHANNEL_ID) ||
    (await message.guild.channels.fetch(LOG_CHANNEL_ID).catch(() => null));
  if (!logChannel?.isTextBased?.()) return;

  const ping = message.guild.ownerId ? `<@${message.guild.ownerId}> ` : '';
  await logChannel.send({ content: ping, embeds: [embed] }).catch(() => null);
}

// ─── Helper: asignar departamento ────────────────────────────────────────────
async function assignDepartment(member, guild, department) {
  const departmentRoles = getDepartmentRoles();
  const roleId = departmentRoles[department.name];

  if (!roleId) return { ok: false, reason: 'no_role' };

  const role = guild.roles.cache.get(roleId);
  if (!role) return { ok: false, reason: 'role_deleted' };

  const userDeptRoles = member.roles.cache.filter(r =>
    Object.values(departmentRoles).includes(r.id)
  );

  const previousRole = userDeptRoles.first() ?? null;

  if (previousRole?.id === roleId) {
    return { ok: true, role, previousRole, same: true };
  }

  // Remover otros departamentos
  for (const [, deptRole] of userDeptRoles) {
    if (deptRole.id !== roleId) {
      await member.roles.remove(deptRole).catch(() => null);
    }
  }

  await member.roles.add(role).catch(() => null);

  return { ok: true, role, previousRole, same: false };
}

// ─── Helper: embed de éxito de departamento ───────────────────────────────────
function buildSuccessEmbed(department, role, previousRole, member) {
  return new EmbedBuilder()
    .setTitle('✅ Departamento asignado')
    .setDescription(`Has sido asignado al departamento **${department.name}**`)
    .setColor(0x57F287)
    .addFields(
      {
        name: '📍 Tu departamento',
        value: role.toString(),
        inline: true,
      },
      previousRole
        ? { name: '🔄 Anterior', value: previousRole.toString(), inline: true }
        : { name: '🆕 Primer departamento', value: 'Bienvenido', inline: true },
      {
        name: '⏰ Asignado',
        value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
        inline: false,
      }
    )
    .setFooter({ text: `Sistema de departamentos • ${member.user.tag}` })
    .setTimestamp();
}

function buildSameDepartmentEmbed(department, role, member) {
  return new EmbedBuilder()
    .setTitle('ℹ️ Ya tenías ese departamento')
    .setDescription(`Ya estabas en **${department.name}**.`)
    .setColor(0xFAA61A)
    .addFields(
      { name: '📍 Tu departamento', value: role.toString(), inline: true },
      {
        name: '⏰ Revisado',
        value: `<t:${Math.floor(Date.now() / 1000)}:f>`,
        inline: false,
      }
    )
    .setFooter({ text: `Sistema de departamentos • ${member.user.tag}` })
    .setTimestamp();
}

// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot) return;

    // ── Sistema de departamentos (canal dedicado) ─────────────────────────────
    if (message.channelId === DEPARTMENT_CHANNEL_ID && !message.content.startsWith('-')) {
      try {
        const hasUrudasherRole = message.member?.roles.cache.has(URUDASHER_ROLE_ID);
        if (!hasUrudasherRole) {
          const embed = new EmbedBuilder()
            .setTitle('🚫 Acceso denegado')
            .setDescription('Debes tener el rol de **urudasher** para asignar departamentos.')
            .setColor(0xED4245)
            .addFields({
              name: '📢 Información',
              value: 'Los turistas no pueden participar en este sistema.',
              inline: false,
            })
            .setFooter({ text: 'Sistema de departamentos' });
          return message.reply({ embeds: [embed] }).catch(() => null);
        }

        const input = message.content.trim();

        // Ignorar mensajes claramente irrelevantes
        if (input.length > 50 || input.includes('\n') || /^[#@!?<]/.test(input)) {
          return;
        }

        // Buscar departamento con match estricto propio antes de usar fuzzy:
        // el input debe contener al menos la mitad de los caracteres del nombre
        // del departamento Y el departamento debe contener el input (o viceversa).
        const { getAllDepartments } = require('../utils/departmentStore');
        const allDepts = getAllDepartments();
        const inputLower = input.toLowerCase().replace(/\s+/g, ' ');

        const strictMatch = allDepts.find(dept => {
          const deptLower = dept.toLowerCase();
          // Match exacto o el input es subcadena del nombre (ej: "mont" en "montevideo")
          // pero el input debe tener al menos 4 caracteres o ser igual al nombre completo
          if (deptLower === inputLower) return true;
          if (inputLower.length < 4) return false;
          if (deptLower.includes(inputLower)) return true;
          if (inputLower.includes(deptLower)) return true;
          return false;
        });

        if (!strictMatch) return;

        // Solo llamar a findDepartment si pasó el filtro estricto
        const department = findDepartment(input);
        if (!department) return;

        const result = await assignDepartment(message.member, message.guild, department);

        if (!result.ok) {
          const descriptions = {
            no_role: `El rol para **${department.name}** no está configurado. Contactá a un admin.`,
            role_deleted: `El rol de **${department.name}** fue eliminado. Contactá a un admin.`,
          };
          const embed = new EmbedBuilder()
            .setTitle('⚠️ Rol no disponible')
            .setDescription(descriptions[result.reason] ?? 'Error desconocido.')
            .setColor(0xFAA61A)
            .setFooter({ text: 'Sistema de departamentos' });
          return message.reply({ embeds: [embed] }).catch(() => null);
        }

        const embed = result.same
          ? buildSameDepartmentEmbed(department, result.role, message.member)
          : buildSuccessEmbed(department, result.role, result.previousRole, message.member);
        return message.reply({ embeds: [embed] }).catch(() => null);

      } catch (error) {
        console.error('Error en department assignment:', error);
        const embed = new EmbedBuilder()
          .setTitle('❌ Error del sistema')
          .setDescription('Ocurrió un error inesperado al procesar tu solicitud.')
          .setColor(0xED4245)
          .addFields({ name: '🔧 Detalle', value: `\`${error.message}\``, inline: false })
          .setFooter({ text: 'Sistema de departamentos' });
        return message.reply({ embeds: [embed] }).catch(() => null);
      }
    }

    const guildId = message.guild?.id;
    if (guildId && !message.author.bot && !isLikelyThirdPartyBotCommand(message.content)) {
      const spamHits = registerSpamHit(guildId, message.author.id);
      if (spamHits >= SPAM_THRESHOLD) {
        if (!canIssueSpamWarning(guildId, message.author.id)) return;

        addWarning(guildId, message.author.id, {
          reason: 'Spam de mensajes detectado',
          moderatorId: message.client.user.id,
          moderatorName: 'Sistema Anti-Spam',
          createdAt: new Date().toISOString(),
        });

        const spamEmbed = new EmbedBuilder()
          .setTitle('⚠️ Anti-Spam')
          .setDescription(`<@${message.author.id}> está enviando demasiados mensajes en poco tiempo.`)
          .addFields(
            { name: 'Acción', value: 'Warning automático' },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Servidor', value: message.guild.name, inline: true },
          )
          .setColor(0xED4245)
          .setTimestamp();

        const spamKey = `${guildId}:${message.author.id}`;
        if (!spamLoggedUsers.has(spamKey)) {
          spamLoggedUsers.add(spamKey);
          await sendAlertLog(message, spamEmbed);
        }
      }
    }

    // ── Monkeypatch message.reply → siempre embeds ────────────────────────────
    try {
      const originalReply = message.reply.bind(message);
      const originalSend = message.channel?.send?.bind(message.channel);

      const isComponentsV2Payload = (payload) => {
        if (!payload || typeof payload !== 'object') return false;
        if (payload.flags === COMPONENTS_V2_FLAG) return true;
        if (Array.isArray(payload.flags) && payload.flags.includes(COMPONENTS_V2_FLAG)) return true;
        if (!Array.isArray(payload.components)) return false;
        return payload.components.some(component => {
          const type = component?.type;
          return type === 17 || type === 10 || type === 14 || type === 9;
        });
      };

      message.reply = (payload) => {
        try {
          if (!payload) return originalReply(payload);

          if (isComponentsV2Payload(payload)) {
            return originalReply(payload);
          }

          const usagePayload = makeV2UsageReply(payload);
          if (usagePayload !== payload) {
            return originalReply(usagePayload).catch(() => null);
          }

          if (typeof payload === 'object' && Array.isArray(payload.embeds)) {
            return originalReply(payload);
          }

          if (typeof payload === 'string') {
            const eb = new EmbedBuilder().setDescription(payload).setColor(0x5865F2);
            return originalReply({ embeds: [eb] }).catch(() => null);
          }

          if (typeof payload === 'object') {
            const desc = payload.content || payload.description || '';
            const eb = new EmbedBuilder();
            if (payload.title) eb.setTitle(payload.title);
            if (desc) eb.setDescription(desc);
            if (payload.color) eb.setColor(payload.color);
            return originalReply({ embeds: [eb] }).catch(() => null);
          }

          return originalReply(payload);
        } catch (e) {
          return originalReply(payload);
        }
      };

      if (originalSend) {
        message.channel.send = (payload) => {
          try {
            if (isComponentsV2Payload(payload)) {
              return originalSend(payload);
            }

            const usagePayload = makeV2UsageReply(payload);
            if (usagePayload !== payload) {
              return originalSend(usagePayload).catch(() => null);
            }
            return originalSend(payload);
          } catch (e) {
            return originalSend(payload);
          }
        };
      }
    } catch (e) {
      // ignorar si el monkeypatching falla
    }

    if (processedMessages.has(message.id)) return;
    processedMessages.add(message.id);
    setTimeout(() => processedMessages.delete(message.id), 2 * 60 * 1000).unref?.();

    if (!guildId) return;

    handleGiveawayMessage(message).catch(() => null);

    processOverdueLoan(guildId, message.author.id).catch(err => console.error('Error en processOverdueLoan (messageCreate):', err));

    // ── Anti-raid ─────────────────────────────────────────────────────────────
    const messageCount = recordMessage(message.author.id, guildId, message.content);
    const isRaid = isRaiding(message.author.id, guildId);

    if (isRaid && message.member?.manageable === true) {
      const now = Date.now();
      const lastBan = banCooldowns.get(message.author.id) || 0;

      if (now - lastBan > BAN_COOLDOWN) {
        try {
          await message.author.send('⛔ Has sido baneado por spam masivo de links a servidores de Discord.');
        } catch (e) { /* sin DM */ }

        await message.guild.members.ban(message.author.id, {
          reason: `Auto-ban: Spam de links detectado (${messageCount} links de Discord en poco tiempo)`,
        });

        banCooldowns.set(message.author.id, now);
        resetUser(message.author.id, guildId);

        guardarLog({
          tipo: 'ban',
          usuarioId: message.author.id,
          usuarioNombre: message.author.username,
          razon: `Spam de links de Discord automático (${messageCount} links)`,
          moderadorId: message.client.user.id,
          moderadorNombre: 'Sistema Anti-Raid',
          servidorId: guildId,
          fecha: new Date().toISOString(),
        });

        const raidEmbed = new EmbedBuilder()
          .setTitle('🚨 Anti-Raid')
          .setColor(0xED4245)
          .addFields(
            { name: 'Usuario baneado', value: `<@${message.author.id}> (${message.author.tag})`, inline: false },
            { name: 'Motivo', value: `Spam de links de Discord (${messageCount} links en poco tiempo)`, inline: false },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Servidor', value: message.guild.name, inline: true },
          )
          .setTimestamp();

        await sendAlertLog(message, raidEmbed);
        return;
      }
    }

    // ── Link detection ────────────────────────────────────────────────────────
    if (hasDiscordInvite(message.content)) {
      const invites = findAllInvites(message.content);

      if (invites.length > 0) {
        addWarning(guildId, message.author.id, {
          reason: 'Link a servidor de Discord detectado',
          moderatorId: message.client.user.id,
          moderatorName: 'Sistema Anti-Raid',
          createdAt: new Date().toISOString(),
        });

        await message.delete().catch(() => null);

        const embed = new EmbedBuilder()
          .setTitle('⛔ Link bloqueado')
          .setDescription(`<@${message.author.id}> intentó compartir un link a otro servidor de Discord.`)
          .addFields(
            { name: 'Acción', value: 'Mensaje eliminado + warning automático' },
            { name: 'Enlaces detectados', value: invites.slice(0, 3).join('\n') },
            { name: 'Canal', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Servidor', value: message.guild.name, inline: true },
          )
          .setColor(0xED4245)
          .setTimestamp();

        await sendAlertLog(message, embed);
        return;
      }
    }

    // ── AFK ───────────────────────────────────────────────────────────────────
    const afkRecord = await getAfk(guildId, message.author.id);
    const removedAfk = await clearAfk(guildId, message.author.id);
    if (removedAfk) {
      if (message.member?.manageable) {
        const restoreNickname = afkRecord?.previousNickname || null;
        const nextNickname =
          restoreNickname && restoreNickname !== message.member.nickname ? restoreNickname : null;
        await message.member.setNickname(nextNickname).catch(() => null);
      }
      const mentionCount = Number(afkRecord?.mentionCount || 0);
      message.reply(
        mentionCount > 0
          ? `👋 Ya no estás AFK. Tienes **${mentionCount}** menciones en tu último AFK. Usá -mentions para verlas.`
          : '👋 Ya no estás AFK.'
      ).catch(() => null);
    }

    const mentionedAfk = [];
    for (const [, user] of message.mentions.users) {
      if (user.id === message.author.id) continue;
      const afk = await getAfk(guildId, user.id);
      if (afk) {
        await recordAfkMention(guildId, user.id, {
          userId: message.author.id,
          username: message.author.username,
          content: message.content,
          channelId: message.channel.id,
          channelName: message.channel.name || '',
          timestamp: Date.now(),
        });
        mentionedAfk.push(`💤 **${user.username}** está AFK: ${afk.reason}`);
      }
      if (mentionedAfk.length >= 3) break;
    }
    if (mentionedAfk.length) message.reply(mentionedAfk.join('\n')).catch(() => null);

    // ── Mención directa al bot ────────────────────────────────────────────────
    const botId = message.client.user?.id;
    if (botId) {
      const mentionPattern = `<@!?${botId}>`;
      const mentionOnlyRegex = new RegExp(`^${mentionPattern}$`);
      const mentionWithArgRegex = new RegExp(`^${mentionPattern}\\s+(.+)$`, 'i');
      const trimmed = message.content.trim();

      if (mentionOnlyRegex.test(trimmed)) {
        return message.reply('👋 Poné `-cmds` para ver la guía de comandos.');
      }

      const mentionArgMatch = trimmed.match(mentionWithArgRegex);
      if (mentionArgMatch) {
        const asked = String(mentionArgMatch[1] || '').trim().toLowerCase();
        if (['help', 'cmds', 'comandos', 'ayuda'].includes(asked)) {
          const cmdsCommand = message.client.prefixCommands?.get('cmds');
          if (cmdsCommand) return cmdsCommand.execute(message, []);
          return message.reply('👋 Poné `-cmds` para ver la guía de comandos.');
        }
      }
    }

    // ── Target reply ──────────────────────────────────────────────────────────
    const targetReply = getTargetReply(guildId, message.author.id);
    if (targetReply && message.channel.id === targetReply.channelId) {
      const embed = new EmbedBuilder()
        .setTitle('⚠️ Auto Reply')
        .setDescription(targetReply.replyText)
        .setColor(0xED4245)
        .setFooter({ text: 'Respuesta automática del servidor' });
      message.reply({ embeds: [embed] }).catch(() => null);
    }

    // ── Sin prefijo → economía pasiva ─────────────────────────────────────────
    if (!message.content.startsWith('-')) {
      if (!(await isEconomySeasonLocked(guildId))) {
        await tryGrantMessageReward(guildId, message.author.id);
        if (message.member) await tryGrantPassiveIncome(guildId, message.member);
      }
      return;
    }

    // ── Resolver comando ──────────────────────────────────────────────────────
    const args = message.content.slice(1).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    if (!commandName || commandName.length === 0) return;

    const commandSignature = [
      guildId,
      message.channel.id,
      message.author.id,
      message.content.trim().toLowerCase(),
    ].join(':');
    const signatureLastSeen = recentCommandSignatures.get(commandSignature) || 0;
    if (Date.now() - signatureLastSeen < 1500) return;
    recentCommandSignatures.set(commandSignature, Date.now());
    setTimeout(() => recentCommandSignatures.delete(commandSignature), 10_000).unref?.();

    let command = message.client.prefixCommands?.get(commandName);
    let forwardedArgs = args;

    if (!command) {
      const incomeAction = getIncomeAction(commandName);
      const incomeCommand = message.client.prefixCommands?.get('income');
      if (incomeAction && incomeCommand) {
        command = incomeCommand;
        forwardedArgs = [commandName, ...args];
      }
    }

    if (!command && commandName.length >= 2) {
      const primaryNames = [
        ...new Set(
          [...(message.client.prefixCommands?.values() || [])].map(cmd =>
            String(cmd?.name || '').toLowerCase()
          )
        ),
      ].filter(Boolean);
      const matches = primaryNames.filter(name => name.startsWith(commandName));
      if (matches.length === 1 && commandName.length >= 3) {
        command = message.client.prefixCommands?.get(matches[0]);
      }
    }

    if (!command) {
      return message
        .reply('No encontré ese comando. Usá `-cmds` para ver la guía de comandos.')
        .catch(() => null);
    }

    const canonicalName = String(command.name || commandName).toLowerCase();

    // ── Economy checks ────────────────────────────────────────────────────────
    if (isEconomyCommand(command, canonicalName)) {
      if (await isEconomySeasonLocked(guildId)) {
        return message.reply(
          '⛔ La economía está cerrada por fin de season. Esperá a que el dueño use `-openseason`.'
        );
      }
      const economyBan = await getEconomyBanStatus(guildId, message.author.id);
      if (economyBan.banned) {
        const ban = economyBan.ban;
        return message.reply(
          [
            '⛔ Tenés bloqueados los comandos de economía.',
            `Motivo: **${ban.reason}**`,
            `Vencimiento: <t:${Math.floor(ban.expiresAt / 1000)}:F>`,
            `Tiempo restante: **${formatDuration(ban.remainingMs)}**`,
          ].join('\n')
        );
      }
    }

    // ── Channel allowlist ─────────────────────────────────────────────────────
if (
  !message.member?.permissions?.has(PermissionFlagsBits.Administrator) &&
  !isStaff(message.member, guildId) &&
  !isCommandAllowed(guildId, message.channel.id)
) {
  const allowed = getAllowedChannels(guildId);
  const embed = new EmbedBuilder()
    .setTitle('🚫 Canal incorrecto')
    .setDescription('No podés usar comandos en este canal.')
    .addFields({ name: 'Canales permitidos', value: formatAllowedChannels(allowed) })
    .setColor(0xED4245)
    .setFooter({ text: 'Configuración de comandos del servidor' });
  return message.reply({ embeds: [embed] });
}

    // ── Ejecutar ──────────────────────────────────────────────────────────────
    try {
      await command.execute(message, forwardedArgs);
    } catch (error) {
      console.error(error);
      const detail = String(error?.message || '').trim();
      message
        .reply(
          detail
            ? `Ocurrió un error ejecutando ese comando: ${detail}`
            : 'Ocurrió un error ejecutando ese comando.'
        )
        .catch(() => null);
    }
  },
};
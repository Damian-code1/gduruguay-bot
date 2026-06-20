const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const { setLock, getLock, removeLock, isLockedTemporary, getActiveLocks } = require('../utils/lockStore');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -lock')
    .setDescription('Bloquea el canal temporalmente.')
    .addFields(
      { name: 'Uso', value: '`-lock <duración>` - Bloquear por X tiempo\n`-lock off` - Desbloquear inmediatamente\n`-lock status` - Ver estado' },
      { name: 'Formato de tiempo', value: '`m` = minutos\n`h` = horas\n`d` = días\nEj: 10m, 1h, 2h 30m' },
      { name: 'Ejemplos', value: '`-lock 30m`\n`-lock 2h`\n`-lock 1d`' },
      { name: 'Permisos', value: 'Solo administradores/staff' }
    )
    .setColor(0xE74C3C)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'lock',
  help: {
    purpose: 'Bloquea el canal temporalmente por una duración especificada.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const timeArg = (args[0] || '').toLowerCase();

    if (!timeArg) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    if (timeArg === 'status') {
      const activeLocks = getActiveLocks(message.guild.id);
      
      if (activeLocks.length === 0) {
        return message.reply('🔓 No hay canales bloqueados en el servidor.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🔒 Canales bloqueados')
        .setColor(0xE74C3C)
        .setFooter({ text: `Total: ${activeLocks.length}` });

      const fields = activeLocks.map(lock => {
        const timeLeft = lock.unlocksAt - Date.now();
        return {
          name: `<#${lock.channelId}>`,
          value: `⏱️ ${formatDuration(timeLeft)}\nDesbloquea: <t:${Math.floor(lock.unlocksAt / 1000)}:R>`,
          inline: false,
        };
      });

      embed.addFields(...fields);
      return message.reply({ embeds: [embed] });
    }

    if (timeArg === 'off') {
      await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
        SendMessages: null,
      });

      removeLock(message.channel.id);
      return message.reply('🔓 Canal desbloqueado.');
    }

    // Parsear duración
    const durationMs = parseDuration(timeArg);
    if (durationMs < 60000 || durationMs > 604800000) { // 1 minuto a 7 días
      return message.reply({ embeds: [usageEmbed().setDescription('❌ La duración debe estar entre 1 minuto y 7 días.')] });
    }

    // Bloquear canal
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      SendMessages: false,
    });

    const unlocksAt = Date.now() + durationMs;
    setLock(message.channel.id, message.guild.id, durationMs, unlocksAt);

    const embed = new EmbedBuilder()
      .setTitle('🔒 Canal bloqueado')
      .addFields(
        { name: 'Duración', value: formatDuration(durationMs) },
        { name: 'Se desbloquea', value: `<t:${Math.floor(unlocksAt / 1000)}:F>` }
      )
      .setColor(0xE74C3C)
      .setTimestamp();

    await message.reply({ embeds: [embed] });

    // Auto-unlock después de la duración
    setTimeout(async () => {
      try {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
          SendMessages: null,
        });
        removeLock(message.channel.id);
        await message.channel.send('🔓 Canal desbloqueado automáticamente.').catch(() => null);
      } catch (error) {
        console.error('Error al desbloquear canal:', error);
      }
    }, durationMs);
  },
};

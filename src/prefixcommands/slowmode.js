const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -slowmode')
    .setDescription('Configura el slowmode del canal en minutos u horas.')
    .addFields(
      { name: 'Uso', value: '`-slowmode <minutos|horas>` o `-slowmode off`' },
      { name: 'Formato de tiempo', value: '`m` = minutos\n`h` = horas\n`off` = desactivar' },
      { name: 'Ejemplos', value: '`-slowmode 10m`\n`-slowmode 1h`\n`-slowmode off`' },
      { name: 'Límite', value: 'Mínimo: 0s | Máximo: 6 horas' },
      { name: 'Permisos', value: 'Solo administradores' }
    )
    .setColor(0xE67E22)
    .setFooter({ text: 'gduruguay bot' });
}

module.exports = {
  name: 'slowmode',
  help: {
    purpose: 'Configura el slowmode del canal en minutos u horas (ej: 10m, 1h).',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const raw = (args[0] || '').toLowerCase();
    if (!raw) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    let seconds = 0;

    if (raw === 'off' || raw === '0') {
      seconds = 0;
    } else {
      const match = raw.match(/^(\d+)\s*([mh])$/i);
      if (!match) {
        return message.reply({ embeds: [usageEmbed()] });
      }

      const amount = Number(match[1]);
      const unit = match[2].toLowerCase();
      seconds = unit === 'h' ? amount * 3600 : amount * 60;
    }

    if (seconds < 0 || seconds > 21600) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    await message.channel.setRateLimitPerUser(seconds);
    if (seconds === 0) {
      return message.reply('⏱️ Slowmode desactivado.');
    }

    const label = seconds % 3600 === 0
      ? `${seconds / 3600}h`
      : `${seconds / 60}m`;

    return message.reply(`⏱️ Slowmode actualizado a **${label}**.`);
  },
};

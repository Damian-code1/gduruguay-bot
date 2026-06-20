const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { getGuildConfig } = require('../utils/economyStore');
const { formatCurrency } = require('../utils/economyHelpers');
const { getRemoveCoinsLogs } = require('../utils/removeCoinsLogStore');

const PAGE_SIZE = 8;

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -rclog')
    .setColor(0x5865F2)
    .setDescription('Muestra el historial de `-removecoins` en el servidor (staff/admin).')
    .addFields(
      { name: 'Uso', value: '`-rclog`\n`-rclog <página>`' },
      { name: 'Ejemplo', value: '`-rclog 2`' },
      { name: 'Permisos', value: 'Staff o administrador' },
    )
    .setTimestamp();
}

module.exports = {
  name: 'rclog',
  aliases: ['removecoinslog', 'rclogs'],
  help: {
    purpose: 'Muestra logs de transferencias hechas con -removecoins.',
    category: '💰 Economía',
    adminOnly: true,
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const canManage = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    if (!canManage) {
      return message.reply('❌ Este comando es solo para staff/admin.');
    }

    if (String(args[0] || '').toLowerCase() === 'help') {
      return message.reply({ embeds: [buildUsageEmbed()] });
    }

    const logs = getRemoveCoinsLogs(guildId);
    if (!logs.length) {
      return message.reply('📭 No hay registros de `-removecoins` en este servidor.');
    }

    const config = getGuildConfig(guildId);
    const totalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
    const pageInput = Number(args[0]);
    const page = Number.isFinite(pageInput) ? Math.min(totalPages, Math.max(1, Math.floor(pageInput))) : 1;
    const start = (page - 1) * PAGE_SIZE;
    const pageItems = logs.slice(start, start + PAGE_SIZE);

    const lines = pageItems.map((entry, index) => {
      const number = start + index + 1;
      const when = entry.at ? `<t:${Math.floor(Number(entry.at) / 1000)}:R>` : 'N/A';
      const staff = entry.staffId ? `<@${entry.staffId}>` : (entry.staffTag || 'Staff desconocido');
      const target = entry.targetId ? `<@${entry.targetId}>` : (entry.targetTag || 'Usuario desconocido');
      return `**${number}.** ${staff} ← ${target} • ${formatCurrency(entry.amount, config)} • ${when}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Log de RemoveCoins')
      .setColor(0xED4245)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Página ${page}/${totalPages} • Total registros: ${logs.length}` })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const {
  getAllowedChannels,
  setAllowedChannels,
  addAllowedChannels,
  removeAllowedChannels,
  clearAllowedChannels,
  formatAllowedChannels,
} = require('../utils/commandChannelManager');
const { isStaff } = require('../utils/staffRolesStore');

function parseChannelIds(message, args) {
  const ids = [];

  for (const ch of message.mentions.channels.values()) {
    ids.push(ch.id);
  }

  for (const arg of args) {
    if (/^\d{17,20}$/.test(arg)) ids.push(arg);
  }

  return [...new Set(ids)];
}

function usageEmbed(guildId) {
  const assigned = getAllowedChannels(guildId);

  return new EmbedBuilder()
    .setTitle('⚙️ Configurar canales de comandos')
    .setDescription('Limita dónde se pueden usar comandos del bot.')
    .addFields(
      { name: 'Comandos', value: '`-cmdchannel set #canal [#canal2]`\n`-cmdchannel add #canal [#canal2]`\n`-cmdchannel remove #canal [#canal2]`\n`-cmdchannel list`\n`-cmdchannel clear`' },
      { name: 'Ejemplo', value: '`-cmdchannel set #bot-commands #moderacion`' },
      {
        name: 'Canales asignados actualmente',
        value: assigned.length
          ? formatAllowedChannels(assigned)
          : 'No hay canales asignados. Los comandos funcionan en cualquier canal.'
      }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'Solo administradores' });
}

module.exports = {
  name: 'cmdchannel',
  help: {
    purpose: 'Define en qué canal(es) se pueden usar todos los comandos del bot.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const sub = (args[0] || '').toLowerCase();
    const guildId = message.guild.id;

    if (!sub) {
      return message.reply({ embeds: [usageEmbed(guildId)] });
    }

    if (sub === 'list') {
      const allowed = getAllowedChannels(guildId);
      const embed = new EmbedBuilder()
        .setTitle('📌 Canales permitidos para comandos')
        .setDescription(allowed.length
          ? formatAllowedChannels(allowed)
          : 'No hay restricción activa. Los comandos funcionan en cualquier canal.')
        .setColor(0x5865F2);
      return message.reply({ embeds: [embed] });
    }

    if (sub === 'clear') {
      clearAllowedChannels(guildId);
      return message.reply('✅ Restricción desactivada. Ahora los comandos se pueden usar en cualquier canal.');
    }

    const channelIds = parseChannelIds(message, args.slice(1));
    if (!channelIds.length) {
      return message.reply({ embeds: [usageEmbed(guildId)] });
    }

    let updated = [];
    if (sub === 'set') {
      updated = setAllowedChannels(guildId, channelIds);
    } else if (sub === 'add') {
      updated = addAllowedChannels(guildId, channelIds);
    } else if (sub === 'remove') {
      updated = removeAllowedChannels(guildId, channelIds);
    } else {
      return message.reply({ embeds: [usageEmbed(guildId)] });
    }

    const embed = new EmbedBuilder()
      .setTitle('✅ Canales de comandos actualizados')
      .setDescription(updated.length
        ? `Ahora se permiten comandos en: ${formatAllowedChannels(updated)}`
        : 'No quedó ningún canal configurado. Los comandos se pueden usar en cualquier canal.')
      .setColor(0x57F287);

    return message.reply({ embeds: [embed] });
  },
};

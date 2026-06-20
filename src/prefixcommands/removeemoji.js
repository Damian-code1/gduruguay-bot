const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -removeemoji')
    .setColor(0x5865F2)
    .setDescription('Elimina un emoji del servidor por nombre, ID o escribiendo el emoji.')
    .addFields(
      { name: 'Por nombre', value: '`-removeemoji pepe`' },
      { name: 'Por ID', value: '`-removeemoji 123456789012345678`' },
      { name: 'Directo', value: '`-removeemoji <:pepe:123456789012345678>`' }
    )
    .setFooter({ text: 'gduruguay bot' });
}

function parseEmojiId(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const directId = /^\d{17,20}$/.test(text) ? text : null;
  if (directId) return directId;

  const customMatch = text.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  if (customMatch) return customMatch[1];

  return null;
}

module.exports = {
  name: 'removeemoji',
  help: {
    purpose: 'Elimina un emoji del servidor por nombre o ID.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const botMember = message.guild.members.me;
    const botHasPermission = botMember?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions);
    if (!botHasPermission) {
      return message.reply('❌ Me falta el permiso `Manage Expressions` para borrar emojis.');
    }

    const input = String(args[0] || '').trim();
    if (!input) {
      return message.reply({ embeds: [usageEmbed()] });
    }

    const emojiId = parseEmojiId(input);
    let emoji = null;

    if (emojiId) {
      emoji = message.guild.emojis.cache.get(emojiId) || null;
    } else {
      const normalized = input.toLowerCase();
      emoji = message.guild.emojis.cache.find(e => e.name.toLowerCase() === normalized) || null;
    }

    if (!emoji) {
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Emoji no encontrado')
            .setColor(0xED4245)
            .setDescription('No encontré ese emoji en este servidor.'),
        ],
      });
    }

    try {
      const oldName = emoji.name;
      const oldId = emoji.id;
      await emoji.delete(`Eliminado por ${message.author.tag} (${message.author.id})`);

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🗑️ Emoji eliminado')
            .setColor(0x2ECC71)
            .setDescription(`Se eliminó **:${oldName}:**`)
            .addFields({ name: 'ID', value: `\`${oldId}\``, inline: true })
            .setTimestamp(),
        ],
      });
    } catch (error) {
      console.error('Error en -removeemoji:', error);
      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ No se pudo eliminar')
            .setColor(0xED4245)
            .setDescription('Revisa permisos del bot o jerarquía del servidor.'),
        ],
      });
    }
  },
};

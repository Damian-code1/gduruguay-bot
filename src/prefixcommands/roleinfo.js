const { EmbedBuilder } = require('discord.js');
const { resolveRoleTarget } = require('../utils/resolveRoleTarget');

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -roleinfo')
    .setDescription('Muestra información detallada de un rol.')
    .addFields(
      { name: 'Uso', value: '`-roleinfo <@rol|rolId|nombre>`\n`-roleinfo list`' },
      { name: 'Ejemplo', value: '`-roleinfo emprend`\n`-roleinfo list`' },
      { name: 'Información mostrada', value: 'ID, miembros, posición, color, fecha de creación' }
    )
    .setColor(0x5865F2)
    .setFooter({ text: 'gduruguay bot' });
}

function buildRoleListEmbeds(guild, roles) {
  const sorted = [...roles].sort((a, b) => b.position - a.position);
  const lines = sorted.map((role, index) => `${index + 1}. ${role.name} — ID: \`${role.id}\``);
  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of lines) {
    if (currentLength + line.length + 1 > 3800) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }

    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) chunks.push(current);

  return chunks.slice(0, 10).map((chunk, index) => new EmbedBuilder()
    .setTitle(`📚 Roles del servidor (${roles.length})`)
    .setColor(0x5865F2)
    .setDescription(chunk.join('\n'))
    .setFooter({ text: `Página ${index + 1}/${Math.min(chunks.length, 10)}` })
    .setTimestamp());
}

module.exports = {
  name: 'roleinfo',
  help: {
    purpose: 'Muestra información detallada de un rol.',
    category: '📊 Información',
  },
  async execute(message, args) {
    const query = String(args.join(' ') || '').trim();
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'list') {
      const roles = [...message.guild.roles.cache.values()].filter(role => role.id !== message.guild.id);
      if (!roles.length) {
        return message.reply('ℹ️ No hay roles para mostrar.');
      }

      return message.reply({ embeds: buildRoleListEmbeds(message.guild, roles) });
    }

    const role = resolveRoleTarget(message, query);
    if (!role) {
      if (query) {
        const matches = [...message.guild.roles.cache.values()]
          .filter(item => item.id !== message.guild.id)
          .filter(item => item.name.toLowerCase().includes(query.toLowerCase()))
          .sort((a, b) => b.position - a.position)
          .slice(0, 15);

        if (matches.length === 1) {
          const singleRole = matches[0];
          const membersWithRole = singleRole.members.size;
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle(`🏷️ Info del rol: ${singleRole.name}`)
                .setColor(singleRole.color || 0x5865F2)
                .addFields(
                  { name: 'ID', value: singleRole.id, inline: true },
                  { name: 'Miembros', value: `${membersWithRole}`, inline: true },
                  { name: 'Mencionable', value: singleRole.mentionable ? 'Sí' : 'No', inline: true },
                  { name: 'Posición', value: `${singleRole.position}`, inline: true },
                  { name: 'Color', value: singleRole.hexColor, inline: true },
                  { name: 'Creado', value: `<t:${Math.floor(singleRole.createdTimestamp / 1000)}:F>`, inline: false }
                )
                .setTimestamp(),
            ],
          });
        }

        if (matches.length > 1) {
          const lines = matches.map(item => `• ${item.name} — ID: \`${item.id}\``);
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setTitle('🔎 Coincidencias de roles')
                .setColor(0x5865F2)
                .setDescription(lines.join('\n'))
                .setFooter({ text: 'Usá -roleinfo <rolId> para ver uno exacto.' })
                .setTimestamp(),
            ],
          });
        }
      }

      return message.reply({ embeds: [usageEmbed()] });
    }

    const membersWithRole = role.members.size;

    const embed = new EmbedBuilder()
      .setTitle(`🏷️ Info del rol: ${role.name}`)
      .setColor(role.color || 0x5865F2)
      .addFields(
        { name: 'ID', value: role.id, inline: true },
        { name: 'Miembros', value: `${membersWithRole}`, inline: true },
        { name: 'Mencionable', value: role.mentionable ? 'Sí' : 'No', inline: true },
        { name: 'Posición', value: `${role.position}`, inline: true },
        { name: 'Color', value: role.hexColor, inline: true },
        { name: 'Creado', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: false }
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const { isStaff } = require('../utils/staffRolesStore');
const { sendModerationDm } = require('../utils/moderationDm');
const logsPath = path.join(__dirname, '../logs.json');
const guardarLog = (data) => {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
};
const ayuda = (message) => {
  const embed = new EmbedBuilder()
    .setTitle('📖 Uso: -kick')
    .setDescription('Expulsa a un usuario del servidor.')
    .addFields(
      { name: 'Uso', value: '`-kick @usuario [razón]` o `-kick <userId> [razón]`' },
      { name: 'Ejemplo', value: '`-kick @pepito flood`\n`-kick 123456789012345678 flood`' },
      { name: 'Permisos', value: 'Solo administradores' },
    )
    .setColor(0xE74C3C)
    .setFooter({ text: 'gduruguay bot' });
  return message.reply({ embeds: [embed] });
};

module.exports = {
  name: 'kick',
  help: {
    purpose: 'Expulsa a un usuario del servidor.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message, args) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse)
      return message.reply('❌ No tenés permisos para usar este comando.');

    if (!args.length) return ayuda(message);

    const target = await resolveMemberTarget(message, args[0]);
    if (!target?.member) return ayuda(message);

    const objetivo = target.member;

    const razon = args.slice(1).join(' ') || 'Sin razón especificada';

    if (!objetivo.kickable)
      return message.reply('❌ No puedo kickear a ese usuario.');
    if (objetivo.id === message.author.id)
      return message.reply('❌ No te podés kickear a vos mismo.');

    await sendModerationDm(objetivo.user, {
      title: '👢 Has sido expulsado del servidor',
      color: 0xE74C3C,
      description: 'Has sido expulsado del servidor por moderación.',
      fields: [
        { name: 'Razón', value: razon, inline: false },
      ],
      moderator: `${message.author.tag}`,
      guild: `${message.guild.name}`,
    }).catch(() => null);

    await objetivo.kick(razon);
    guardarLog({
  tipo: 'kick',
  origen: 'bot',
  usuarioId: objetivo.id,
  usuarioNombre: objetivo.user.username,
  moderadorId: message.author.id,
  moderadorNombre: message.author.username,
  razon,
  fecha: new Date().toISOString(),
  servidorId: message.guild.id,
});

    const embed = new EmbedBuilder()
      .setTitle('👢 Usuario kickeado')
      .addFields(
        { name: 'Usuario', value: objetivo.user.username, inline: true },
        { name: 'Razón', value: razon },
        { name: 'Moderador', value: message.author.username, inline: true },
      )
      .setColor(0xE74C3C)
      .setTimestamp();

    message.reply({ embeds: [embed] });
  }
};
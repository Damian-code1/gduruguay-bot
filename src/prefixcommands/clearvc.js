const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { isStaff } = require('../utils/staffRolesStore');

const logsPath = path.join(__dirname, '../logs.json');

function leerLogs() {
  return JSON.parse(fs.readFileSync(logsPath, 'utf8'));
}

function guardarLogs(logs) {
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

module.exports = {
  name: 'clearvc',
  help: {
    purpose: 'Borra los logs de actividad de voz del servidor actual.',
    category: '📋 Logs',
    adminOnly: true,
  },
  async execute(message) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
    if (!canUse) {
      return message.reply('❌ No tenés permisos para usar este comando.');
    }

    const logs = leerLogs();
    const antes = logs.length;

    const filtrados = logs.filter(log => {
      const esLogDeVoz = ['voicejoin', 'voiceleave', 'voicemove'].includes(log.tipo);
      return !(esLogDeVoz && log.servidorId === message.guild.id);
    });

    const eliminados = antes - filtrados.length;

    if (!eliminados) {
      const embed = new EmbedBuilder()
        .setTitle('🧹 Clear VC')
        .setDescription('No había logs de voz para borrar en este servidor.')
        .setColor(0x5865F2);

      return message.reply({ embeds: [embed] });
    }

    guardarLogs(filtrados);

    const embed = new EmbedBuilder()
      .setTitle('🧹 Clear VC')
      .setDescription(`Se eliminaron **${eliminados}** log(s) de voz de este servidor.`)
      .setColor(0x2ECC71)
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

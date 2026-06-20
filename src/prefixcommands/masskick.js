const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { sendModerationDm } = require('../utils/moderationDm');
const { resolveMassTargetsAndRest } = require('../utils/massActionResolver');

const logsPath = path.join(__dirname, '../logs.json');
const MAX_TARGETS = 20;

function appendLog(data) {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
}

function parseMassKickInput(message) {
  const raw = message.content.slice(1).trim();
  const rest = raw.slice('masskick'.length).trim();
  return { rest };
}

function usageEmbed() {
  return new EmbedBuilder()
    .setTitle('📖 Uso: -masskick')
    .setDescription('Expulsa varias personas al mismo tiempo.')
    .addFields(
      { name: 'Uso', value: '`-masskick usuario1 usuario2 [motivo]`' },
      { name: 'Ejemplo', value: '`-masskick @pepito 123456789012345678 flood`\n`-masskick @pepito otroUsuario spam`' },
      { name: 'Notas', value: 'Personas primero y después el motivo. Si no ponés motivo, se ejecuta igual.' },
    )
    .setColor(0xE74C3C);
}

module.exports = {
  name: 'masskick',
  help: {
    purpose: 'Expulsa varias personas al mismo tiempo.',
    category: '🛡️ Moderación',
    adminOnly: true,
    requiredPermissions: [PermissionFlagsBits.Administrator],
    usage: '-masskick usuario1 usuario2 [motivo]'
  },
  async execute(message) {
    const canUse = message.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!canUse) return message.reply('❌ No tenés permisos para usar este comando.');

    const { rest } = parseMassKickInput(message);
    if (!rest) return message.reply({ embeds: [usageEmbed()] });

    const { targets, remainder } = await resolveMassTargetsAndRest(message, rest);
    const resolved = targets.slice(0, MAX_TARGETS);

    if (!resolved.length) return message.reply({ embeds: [usageEmbed()] });

    const reason = String(remainder || '').trim() || 'Sin razón especificada';

    let success = 0;
    let failed = 0;
    const results = [];

    for (const target of resolved) {
      if (!target.member) {
        failed += 1;
        results.push(`❌ <@${target.id}>: no está en el servidor.`);
        continue;
      }

      if (target.id === message.author.id) {
        failed += 1;
        results.push(`❌ <@${target.id}>: no te podés kickear a vos mismo.`);
        continue;
      }

      if (!target.member.kickable) {
        failed += 1;
        results.push(`❌ <@${target.id}>: no puedo kickearlo.`);
        continue;
      }

      await sendModerationDm(target.user, {
        title: '👢 Has sido expulsado del servidor',
        color: 0xE74C3C,
        description: 'Has sido expulsado del servidor por moderación.',
        fields: [
          { name: 'Razón', value: reason, inline: false },
        ],
        moderator: `${message.author.tag}`,
        guild: `${message.guild.name}`,
      }).catch(() => null);

      try {
        await target.member.kick(reason);
        appendLog({
          tipo: 'kick',
          origen: 'bot',
          usuarioId: target.id,
          usuarioNombre: target.user?.username || target.id,
          moderadorId: message.author.id,
          moderadorNombre: message.author.username,
          razon,
          fecha: new Date().toISOString(),
          servidorId: message.guild.id,
          mass: true,
        });

        success += 1;
        results.push(`✅ <@${target.id}> expulsado.`);
      } catch (error) {
        console.error('[masskick]', error);
        failed += 1;
        results.push(`❌ <@${target.id}>: no se pudo kickear.`);
      }
    }

    const embed = new EmbedBuilder()
      .setTitle('👢 Masskick ejecutado')
      .setColor(0xE74C3C)
      .addFields(
        { name: 'Éxitos', value: `${success}`, inline: true },
        { name: 'Fallos', value: `${failed}`, inline: true },
        { name: 'Motivo', value: reason },
        { name: 'Resultado', value: results.slice(0, 20).join('\n').slice(0, 3500) || 'Sin detalles' },
      )
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  },
};

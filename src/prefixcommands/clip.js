const { AttachmentBuilder } = require('discord.js');
const { parseDuration, formatDuration } = require('../utils/timeParser');
const { getVoiceConnection, buildWavByAllUsers } = require('../utils/voiceManager');

const MIN_CLIP_MS = 5_000;
const MAX_CLIP_MS = 120_000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  name: 'clip',
  help: {
    purpose: 'Genera un clip mezclado de todo el canal de voz con duración configurable (máximo 2m).',
    category: '🛡️ Moderación',
  },
  async execute(message, args) {
    try {
      const guildId = message.guild?.id;
      const connection = getVoiceConnection(guildId);
      
      if (!connection) {
        return message.reply('❌ No estoy en ningún canal de voz o la conexión se perdió. Usa `-join` primero.');
      }

      // 1. Validar si hay alguien hablando o si el bot tiene receptores activos
      const receiver = connection.receiver;
      if (!receiver) {
        return message.reply('❌ El receptor de audio no está activo. Intenta reconectar al bot.');
      }

      const durationText = Array.isArray(args) ? args.join(' ').trim() : '';
      let durationMs = 30_000;

      if (durationText) {
        const parsed = parseDuration(durationText);
        if (!parsed) {
          return message.reply('❌ Duración inválida. Ejemplos: `-clip 30s`, `-clip 1m`.');
        }
        durationMs = parsed;
      }

      if (durationMs < MIN_CLIP_MS || durationMs > MAX_CLIP_MS) {
        return message.reply(`❌ La duración debe estar entre **${formatDuration(MIN_CLIP_MS)}** y **${formatDuration(MAX_CLIP_MS)}**.`);
      }

      // Mensaje de estado para que el usuario sepa que el bot está procesando (útil si el WAV es pesado)
      const statusMsg = await message.reply('⏳ Procesando audio y generando clip...').catch(() => null);

      let mixed = await buildWavByAllUsers(guildId, durationMs);

      // Tolerancia extra: a veces el buffer entra con un pequeño retraso
      // o el usuario terminó de hablar justo antes de ejecutar el comando.
      if (!mixed?.wav?.length) {
        for (let attempt = 0; attempt < 3 && !mixed?.wav?.length; attempt += 1) {
          await sleep(450);
          mixed = await buildWavByAllUsers(guildId, durationMs);
        }
      }

      if (!mixed?.wav?.length) {
        if (statusMsg) await statusMsg.delete().catch(() => null);
        return message.reply('❌ No detecté voz reciente para generar un clip. Probá otra vez mientras alguien está hablando.');
      }

      // Borramos el mensaje de "procesando" antes de enviar el resultado
      if (statusMsg) await statusMsg.delete().catch(() => null);

      const fileName = `clip-${guildId}-${Date.now()}.wav`;
      const attachment = new AttachmentBuilder(mixed.wav, { name: fileName });

      return await message.channel.send({
        content: `✅ Clip de los últimos **${formatDuration(durationMs)}** generado con éxito.`,
        files: [attachment],
      });

    } catch (error) {
      console.error('Error en comando clip:', error);
      // Intentar avisar al usuario incluso si algo falló catastróficamente
      if (message.reply) {
          return message.reply('❌ Ocurrió un error crítico al generar el clip. Verifica los logs del servidor.').catch(() => null);
      }
    }
  },
};
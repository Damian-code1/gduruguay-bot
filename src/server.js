'use strict';

const express = require('express');
const config = require('./config');
const { EmbedBuilder } = require('discord.js');

const SUBMISSION_STATE_CHANNEL_ID = '1517744927793086575';

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  return m ? m[1] : null;
}

function buildDecisionEmbed(data) {
  const {
    decision, levelName, staffName, youtubeLink,
    rejectionReason, approvalNote, isNewLevel,
    levelPosition, aredlPosition, victorNumber, totalVictors,
  } = data;

  const approved = decision === 'approved';
  const color = approved ? config.colors.success : config.colors.danger;
  const label = approved ? 'Aprobada' : 'Rechazada';

  const fields = [
    { name: 'Nivel', value: levelName || '—', inline: true },
    { name: 'Staff', value: staffName || '—', inline: true },
  ];

  if (approved) {
    fields.push({
      name: 'Estado del nivel',
      value: isNewLevel ? 'Nivel nuevo agregado a la lista' : 'Nivel ya existente',
      inline: true,
    });
    if (levelPosition) fields.push({ name: 'Puesto en la lista', value: `#${levelPosition}`, inline: true });
    if (aredlPosition) fields.push({ name: 'AREDL', value: `#${aredlPosition}`, inline: true });
    if (victorNumber) {
      fields.push({
        name: 'Número de victor',
        value: `${victorNumber}${totalVictors ? ` de ${totalVictors}` : ''}`,
        inline: true,
      });
    }
    if (approvalNote) fields.push({ name: 'Nota del staff', value: approvalNote, inline: false });
  } else if (rejectionReason) {
    fields.push({ name: 'Razón del rechazo', value: rejectionReason, inline: false });
  }

  if (youtubeLink) fields.push({ name: 'Video', value: `[Ver en YouTube](${youtubeLink})`, inline: false });

  const embed = new EmbedBuilder()
    .setTitle(`${approved ? '✅' : '❌'} Tu submission fue ${label.toLowerCase()}`)
    .setColor(color)
    .addFields(fields)
    .setTimestamp();

  const ytId = extractYouTubeId(youtubeLink);
  if (ytId) embed.setThumbnail(`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`);

  return embed;
}

function createServer(client) {
  const app = express();
  app.use(express.json());

  app.post('/api/dm-notify', async (req, res) => {
    const secret = req.header('x-webhook-secret');
    if (!secret || secret !== process.env.BOT_DM_SECRET) {
      return res.status(401).json({ sent: false, reason: 'invalid_secret' });
    }

    const { discordId } = req.body || {};
    if (!discordId) {
      return res.status(400).json({ sent: false, reason: 'missing_discord_id' });
    }

    try {
      const guild = await client.guilds.fetch(config.guildId);
      const member = await guild.members.fetch(discordId).catch(() => null);

      const embed = buildDecisionEmbed(req.body);

      if (!member) {
        // No pertenece al server -> avisar en submission-state
        const channel = await client.channels.fetch(SUBMISSION_STATE_CHANNEL_ID).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send({
            content: `⚠️ Submission no se pudo enviar, el usuario no pertenece a **${guild.name}**. (ID: ${discordId})`,
          });
        }
        return res.json({ sent: false, reason: 'user_not_in_guild' });
      }

      await member.send({ embeds: [embed] });
      return res.json({ sent: true });
    } catch (err) {
      console.error('[server] Error en /api/dm-notify:', err);

      // Si falló el DM (ej: DMs cerrados) igual avisamos en el canal de logs
      try {
        const channel = await client.channels.fetch(SUBMISSION_STATE_CHANNEL_ID).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send({
            content: `⚠️ No se pudo enviar el DM de la submission al usuario <@${discordId}> (${discordId}). Puede tener los MDs cerrados.`,
          });
        }
      } catch {}

      return res.status(500).json({ sent: false, reason: 'internal_error' });
    }
  });

  const port = process.env.PORT || 4001;
  app.listen(port, () => {
    console.log(`✅ Servidor HTTP del bot escuchando en el puerto ${port}`);
  });
}

module.exports = { createServer };
'use strict';

const express = require('express');
const config = require('./config');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  SectionBuilder,
  ThumbnailBuilder,
  MessageFlags,
} = require('discord.js');

const SUBMISSION_STATE_CHANNEL_ID = '1517744927793086575';

function extractYouTubeId(url) {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/,
  );
  return m ? m[1] : null;
}

/**
 * Arma el Container (Components V2) con el resultado de una submission.
 * Sin color de borde, con separadores (dividers), estilo simple.
 */
function buildDecisionContainer(data) {
  const {
    decision, levelName, staffName, youtubeLink,
    rejectionReason, approvalNote, isNewLevel,
    levelPosition, aredlPosition, victorNumber, totalVictors,
  } = data;

  const approved = decision === 'approved';
  const label = approved ? 'Aprobada' : 'Rechazada';
  const ytId = extractYouTubeId(youtubeLink);
  const thumbUrl = ytId ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg` : null;

  const container = new ContainerBuilder();

  // --- Encabezado (con thumbnail del video si hay) ---
  const headerText = new TextDisplayBuilder().setContent(
    `### ${approved ? '✅' : '❌'} Tu submission fue ${label.toLowerCase()}\n**${levelName || 'Nivel'}**`,
  );

  if (thumbUrl) {
    const headerSection = new SectionBuilder()
      .addTextDisplayComponents(headerText)
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl));
    container.addSectionComponents(headerSection);
  } else {
    container.addTextDisplayComponents(headerText);
  }

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  // --- Detalles principales ---
  const detailLines = [`**Staff**\n${staffName || '—'}`];

  if (approved) {
    detailLines.push(`**Estado del nivel**\n${isNewLevel ? 'Nivel nuevo agregado a la lista' : 'Nivel ya existente'}`);
    if (levelPosition) detailLines.push(`**Puesto en la lista**\n#${levelPosition}`);
    if (aredlPosition) detailLines.push(`**AREDL**\n#${aredlPosition}`);
    if (victorNumber) {
      detailLines.push(`**Número de victor**\n${victorNumber}${totalVictors ? ` de ${totalVictors}` : ''}`);
    }
  } else if (rejectionReason) {
    detailLines.push(`**Razón del rechazo**\n${rejectionReason}`);
  }

  container.addTextDisplayComponents(new TextDisplayBuilder().setContent(detailLines.join('\n\n')));

  if (approved && approvalNote) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Nota del staff**\n${approvalNote}`),
    );
  }

  if (youtubeLink) {
    container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`[Ver en YouTube](${youtubeLink})`),
    );
  }

  return container;
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

      const container = buildDecisionContainer(req.body);

      if (!member) {
        const channel = await client.channels.fetch(SUBMISSION_STATE_CHANNEL_ID).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send({
            content: `Submission no se pudo enviar, el usuario no pertenece a **${guild.name}**. (ID: ${discordId})`,
          });
        }
        return res.json({ sent: false, reason: 'user_not_in_guild' });
      }

      await member.send({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
      });
      return res.json({ sent: true });
    } catch (err) {
      console.error('[server] Error en /api/dm-notify:', err);

      try {
        const channel = await client.channels.fetch(SUBMISSION_STATE_CHANNEL_ID).catch(() => null);
        if (channel?.isTextBased()) {
          await channel.send({
            content: `No se pudo enviar el DM de la submission al usuario <@${discordId}> (${discordId}). Puede tener los MDs cerrados.`,
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
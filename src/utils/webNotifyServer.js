const http = require('http');

const SHARED_SECRET = process.env.WEB_NOTIFY_SECRET || '';
const PORT           = Number(process.env.WEB_NOTIFY_PORT || 4001);

const VIOLET = 0x8b5cf6;
const GREEN  = 0x22c55e;
const RED    = 0xf43f5e;

function buildDecisionEmbed(data) {
  const {
    decision, levelName, staffName, youtubeLink,
    rejectionReason, approvalNote, isNewLevel,
    levelPosition, aredlPosition, victorNumber, totalVictors,
  } = data;

  const approved = decision === 'approved';
  const color    = approved ? GREEN : RED;
  const label    = approved ? 'Aprobada' : 'Rechazada';

  const fields = [
    { name: '🎮 Nivel', value: levelName || '—', inline: true },
    { name: '🛡️ Staff', value: staffName || '—', inline: true },
  ];

  if (approved) {
    fields.push({ name: 'Estado del nivel', value: isNewLevel ? '🆕 Nivel nuevo agregado a la lista' : 'Nivel ya existente', inline: true });
    if (levelPosition) fields.push({ name: 'Puesto en la lista', value: `#${levelPosition}`, inline: true });
    if (aredlPosition) fields.push({ name: '🌐 AREDL', value: `#${aredlPosition}`, inline: true });
    if (victorNumber)  fields.push({ name: '🏁 Número de victor', value: `${victorNumber}${totalVictors ? ` de ${totalVictors}` : ''}`, inline: true });
    if (approvalNote)  fields.push({ name: '💬 Nota del staff', value: approvalNote, inline: false });
  } else if (rejectionReason) {
    fields.push({ name: '📋 Razón del rechazo', value: rejectionReason, inline: false });
  }

  if (youtubeLink) {
    fields.push({ name: '🎬 Video', value: `[Ver en YouTube](${youtubeLink})`, inline: false });
  }

  return {
    color,
    title: `${approved ? '✅' : '❌'} Tu submission fue ${label.toLowerCase()}`,
    description: approved
      ? 'Tu completion fue revisada y aceptada por el staff de UY Demonlist.'
      : 'Tu completion fue revisada y no fue aceptada. Podés volver a intentarlo.',
    fields,
    footer: { text: 'UY Demonlist · GD Uruguay' },
    timestamp: new Date().toISOString(),
  };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function resolveGuild(client) {
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) return guild;
  }
  // Fallback: el bot está en un solo server
  return client.guilds.cache.first() || null;
}

function startWebNotifyServer(client) {
  if (!SHARED_SECRET) {
    console.warn('[webNotifyServer] WEB_NOTIFY_SECRET no configurado, el endpoint no se inicia');
    return null;
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

    if (req.method !== 'POST' || url.pathname !== '/api/dm-notify') {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'not found' }));
      return;
    }

    const authHeader = req.headers['x-webhook-secret'];
    if (authHeader !== SHARED_SECRET) {
      res.statusCode = 401;
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    let body;
    try {
      body = await readBody(req);
    } catch {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'invalid json' }));
      return;
    }

    const { discordId } = body;
    if (!discordId) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'discordId requerido' }));
      return;
    }

    try {
      const guild = await resolveGuild(client);
      if (!guild) {
        res.statusCode = 500;
        res.end(JSON.stringify({ error: 'bot no está en ningún servidor' }));
        return;
      }

      // Chequear si el usuario está en el server
      let member;
      try {
        member = await guild.members.fetch(discordId);
      } catch {
        res.statusCode = 200;
        res.end(JSON.stringify({ sent: false, reason: 'user_not_in_guild' }));
        return;
      }

      const embed = buildDecisionEmbed(body);

      try {
        await member.send({ embeds: [embed] });
        res.statusCode = 200;
        res.end(JSON.stringify({ sent: true }));
      } catch (dmError) {
        // DMs cerrados o bloqueado el bot — no es un error crítico
        res.statusCode = 200;
        res.end(JSON.stringify({ sent: false, reason: 'dm_closed', detail: dmError.message }));
      }
    } catch (error) {
      console.error('[webNotifyServer] Error:', error);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: error.message }));
    }
  });

  server.on('error', error => {
    console.warn('[webNotifyServer] No se pudo iniciar el servidor:', error.message);
  });

  server.listen(PORT, () => {
    console.log(`[webNotifyServer] Endpoint de notificaciones DM disponible en el puerto ${PORT}`);
  });

  return server;
}

module.exports = { startWebNotifyServer };
const fs = require('fs');
const path = require('path');

const logsPath = path.join(__dirname, '../logs.json');

const formatearTiempo = (ms) => {
  const partes = [];
  const dias = Math.floor(ms / 86400000); if (dias) partes.push(`${dias}d`);
  const horas = Math.floor((ms % 86400000) / 3600000); if (horas) partes.push(`${horas}h`);
  const minutos = Math.floor((ms % 3600000) / 60000); if (minutos) partes.push(`${minutos}m`);
  const segundos = Math.floor((ms % 60000) / 1000); if (segundos) partes.push(`${segundos}s`);
  return partes.join(' ') || '0s';
};

const guardarLog = (data) => {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
};

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    const antesTimeout = oldMember.communicationDisabledUntil;
    const ahoraTimeout = newMember.communicationDisabledUntil;

    // Solo nos interesa cuando SE APLICA un timeout (antes no había, ahora sí)
    const ahora = new Date();
    const esNuevoTimeout = (
      ahoraTimeout &&
      new Date(ahoraTimeout) > ahora &&
      (!antesTimeout || new Date(antesTimeout) <= ahora)
    );

    if (!esNuevoTimeout) return;

    const duracionMs = new Date(ahoraTimeout).getTime() - ahora.getTime();

    // Buscar en los audit logs quién hizo el timeout
    let moderadorId = 'Desconocido';
    let moderadorNombre = 'Desconocido';
    let razon = 'Sin razón especificada';

    try {
      const auditLogs = await newMember.guild.fetchAuditLogs({
        type: 24, // MEMBER_UPDATE
        limit: 5,
      });

      const entrada = auditLogs.entries.find(e =>
        e.target.id === newMember.id &&
        Date.now() - e.createdTimestamp < 5000 // dentro de los últimos 5 segundos
      );

      if (entrada) {
        moderadorId = entrada.executor.id;
        moderadorNombre = entrada.executor.username;
        razon = entrada.reason || 'Sin razón especificada';

        // Si el timeout lo hizo el propio bot, no lo logueamos (ya lo hizo timeout.js)
        if (entrada.executor.id === newMember.client.user.id) return;
      }
    } catch (err) {
      console.error('Error leyendo audit logs:', err);
    }

    guardarLog({
      tipo: 'timeout',
      origen: 'discord',
      usuarioId: newMember.id,
      usuarioNombre: newMember.user.username,
      moderadorId,
      moderadorNombre,
      duracionMs,
      duracionTexto: formatearTiempo(duracionMs),
      razon,
      fecha: new Date().toISOString(),
      servidorId: newMember.guild.id,
    });

    console.log(`[LOG] Timeout manual detectado: ${newMember.user.username} por ${moderadorNombre}`);
  }
};
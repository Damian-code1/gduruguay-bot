const fs = require('fs');
const path = require('path');
const { AuditLogEvent } = require('discord.js');
const { getMuteRoleId, getMuteRolesByName } = require('../utils/muteRoleStore');

const logsPath = path.join(__dirname, '../logs.json');

const guardarLog = (data) => {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);

  if (data.servidorId && ['voicejoin', 'voiceleave', 'voicemove'].includes(data.tipo)) {
    const voiceLogs = logs
      .map((log, index) => ({ log, index }))
      .filter(item => item.log.servidorId === data.servidorId && ['voicejoin', 'voiceleave', 'voicemove'].includes(item.log.tipo));

    if (voiceLogs.length > 30) {
      const toRemove = voiceLogs
        .sort((a, b) => new Date(a.log.fecha).getTime() - new Date(b.log.fecha).getTime())
        .slice(0, voiceLogs.length - 30)
        .map(item => item.index)
        .sort((a, b) => b - a);

      for (const index of toRemove) {
        logs.splice(index, 1);
      }
    }
  }

  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
};

const actualizarUltimoMoveLog = (guildId, userId, moverId, moverNombre) => {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));

  const index = [...logs.keys()].reverse().find(i => {
    const log = logs[i];
    return log.servidorId === guildId && log.tipo === 'voicemove' && log.usuarioId === userId && !log.moverId;
  });

  if (index === undefined) return false;

  logs[index] = {
    ...logs[index],
    moverId,
    moverNombre,
  };

  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
  return true;
};

async function findVoiceMover(guild, targetId) {
  const retries = [500, 1200, 2200];

  for (const delay of retries) {
    try {
      if (delay) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const auditLogs = await guild.fetchAuditLogs({
        type: AuditLogEvent.MemberMove,
        limit: 10,
      });

      const entries = [...auditLogs.entries.values()]
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp);

      const entry = entries.find(log => {
        const logTargetId = log.target?.id || log.targetId;
        if (logTargetId !== targetId) return false;
        return Date.now() - log.createdTimestamp < 10000;
      });

      if (entry?.executor?.id) {
        return {
          moverId: entry.executor.id,
          moverNombre: entry.executor.username || entry.executor.tag || null,
        };
      }
    } catch (error) {
      // Sin permisos o sin audit logs disponibles
    }
  }

  return { moverId: null, moverNombre: null };
}

module.exports = {
  name: 'voiceStateUpdate',
  async execute(oldState, newState) {
    if (!newState.guild) return;
    if (newState.member?.user?.bot) return;

    const muteRoleId = getMuteRoleId(newState.guild.id) || getMuteRolesByName(newState.guild, 'Muted')[0]?.id || null;
    if (muteRoleId && newState.member?.roles?.cache?.has(muteRoleId) && newState.channelId) {
      if (typeof newState.setChannel === 'function') {
        await newState.setChannel(null).catch(() => null);
      }
      return;
    }

    const oldChannelId = oldState.channelId;
    const newChannelId = newState.channelId;

    if (oldChannelId === newChannelId) return;

    const baseLog = {
      usuarioId: newState.id,
      usuarioNombre: newState.member?.user?.username || newState.id,
      fecha: new Date().toISOString(),
      servidorId: newState.guild.id,
      canalAnteriorId: oldChannelId,
      canalNuevoId: newChannelId,
    };

    if (!oldChannelId && newChannelId) {
      guardarLog({
        ...baseLog,
        tipo: 'voicejoin',
        accion: 'join',
      });
      return;
    }

    if (oldChannelId && !newChannelId) {
      guardarLog({
        ...baseLog,
        tipo: 'voiceleave',
        accion: 'leave',
      });
      return;
    }

    guardarLog({
      ...baseLog,
      tipo: 'voicemove',
      accion: 'move',
      moverId: null,
      moverNombre: null,
    });

    (async () => {
      const moveExecutor = await findVoiceMover(newState.guild, newState.id);

      if (moveExecutor.moverId) {
        actualizarUltimoMoveLog(newState.guild.id, newState.id, moveExecutor.moverId, moveExecutor.moverNombre);
      }
    })().catch(() => null);
  },
};

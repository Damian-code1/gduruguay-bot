const fs = require('fs');
const path = require('path');
const logsPath = path.join(__dirname, '../logs.json');

const guardarLog = (data) => {
  const logs = JSON.parse(fs.readFileSync(logsPath, 'utf8'));
  logs.push(data);
  fs.writeFileSync(logsPath, JSON.stringify(logs, null, 2));
};

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    try {
      await new Promise(r => setTimeout(r, 1000));

      const kickLogs = await member.guild.fetchAuditLogs({ type: 20, limit: 3 });
      const kickEntry = kickLogs.entries.find(e =>
        e.target.id === member.id &&
        Date.now() - e.createdTimestamp < 5000 &&
        e.executor.id !== member.client.user.id
      );

      if (kickEntry) {
        guardarLog({
          tipo: 'kick',
          origen: 'discord',
          usuarioId: member.id,
          usuarioNombre: member.user.username,
          moderadorId: kickEntry.executor.id,
          moderadorNombre: kickEntry.executor.username,
          razon: kickEntry.reason || 'Sin razón especificada',
          fecha: new Date().toISOString(),
          servidorId: member.guild.id,
        });
        console.log(`[LOG] Kick manual: ${member.user.username} por ${kickEntry.executor.username}`);
        return;
      }

      const banLogs = await member.guild.fetchAuditLogs({ type: 22, limit: 3 });
      const banEntry = banLogs.entries.find(e =>
        e.target.id === member.id &&
        Date.now() - e.createdTimestamp < 5000 &&
        e.executor.id !== member.client.user.id
      );

      if (banEntry) {
        guardarLog({
          tipo: 'ban',
          origen: 'discord',
          usuarioId: member.id,
          usuarioNombre: member.user.username,
          moderadorId: banEntry.executor.id,
          moderadorNombre: banEntry.executor.username,
          razon: banEntry.reason || 'Sin razón especificada',
          fecha: new Date().toISOString(),
          servidorId: member.guild.id,
        });
        console.log(`[LOG] Ban manual: ${member.user.username} por ${banEntry.executor.username}`);
      }
    } catch (err) {
      console.error('Error en guildMemberRemove:', err);
    }
  }
};
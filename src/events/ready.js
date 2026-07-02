'use strict';

const { updatePresence } = require('../utils/presence');
const { restoreActiveMutes } = require('../utils/muteRuntime');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    await updatePresence(client);
    // Refresca el conteo cada 10 minutos como red de seguridad
    // (guildMemberAdd/Remove ya lo actualizan al instante).
    setInterval(() => updatePresence(client), 10 * 60 * 1000);

    await restoreActiveMutes(client);

    console.log('ℹ️  Recordatorio: la biografía ("About Me") del bot se configura manualmente');
    console.log('    en el Developer Portal -> tu app -> App Information -> Description.');
    console.log('    Texto sugerido: "hecho por @evosen."');
  },
};

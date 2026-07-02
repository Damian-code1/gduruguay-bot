'use strict';

const { updatePresence } = require('../utils/presence');
const { restoreActiveMutes } = require('../utils/muteRuntime');

module.exports = {
  name: 'ready',
  once: true,
  async execute(client) {
    console.log(`✅ Bot conectado como ${client.user.tag}`);

    await updatePresence(client);
    setInterval(() => updatePresence(client), 10 * 60 * 1000);

    await restoreActiveMutes(client);

  },
};

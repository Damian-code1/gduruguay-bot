const util = require('util');
const cmd = require('../src/prefixcommands/tier.js');

(async () => {
  const queryArgs = process.argv.slice(2);

  const message = {
    guild: { id: 'TEST_GUILD' },
    author: { id: 'TEST_USER', username: 'Tester' },
    member: { permissions: { has: () => false } },
    reply: async (payload) => {
      console.log('\n--- reply payload ---');
      console.log(util.inspect(payload, { depth: 4, colors: false }));
      return { edit: async () => {} };
    },
    channel: { send: async (payload) => { console.log('\n--- channel.send payload ---'); console.log(util.inspect(payload, { depth: 4 })); return {}; } },
  };

  try {
    await cmd.execute(message, queryArgs);
  } catch (err) {
    console.error('Error al ejecutar comando:', err);
    process.exitCode = 1;
  }
})();

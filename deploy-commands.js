'use strict';

const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./src/config');

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');

for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (!command?.data) {
    console.error(`❌ ${file} no exporta 'data'. Se omite.`);
    continue;
  }
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(config.token);

(async () => {
  try {
    console.log(`Registrando ${commands.length} comando(s) slash en el guild ${config.guildId}...`);

    await rest.put(Routes.applicationGuildCommands(config.clientId, config.guildId), { body: commands });

    console.log('✅ Comandos registrados correctamente.');
  } catch (error) {
    console.error('❌ Error registrando comandos:', error);
    process.exit(1);
  }
})();

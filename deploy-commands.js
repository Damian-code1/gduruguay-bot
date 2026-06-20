const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const commands = [];
const commandsPath = path.join(__dirname, 'src/commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  try {
    const command = require(path.join(commandsPath, file));
    commands.push(command.data.toJSON());
  } catch (error) {
    console.error(`❌ Error en ${file}:`, error.message);
    throw error;
  }
}

const rest = new REST().setToken(process.env.TOKEN);

(async () => {
  console.log('Registrando comandos...');
  await rest.put(
    Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
    { body: commands }
  );
  console.log('Comandos registrados!');
})();
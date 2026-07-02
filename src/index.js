'use strict';

const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { closePool } = require('./utils/database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember, Partials.Channel],
});

client.commands = new Collection();

// Cargar comandos slash
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter((f) => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command?.data?.name) client.commands.set(command.data.name, command);
}

// Cargar eventos
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter((f) => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) client.once(event.name, (...args) => event.execute(...args));
  else client.on(event.name, (...args) => event.execute(...args));
}

let isShuttingDown = false;
async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`Apagando bot (señal: ${signal})...`);

  try {
    await closePool();
  } catch (err) {
    console.error('Error cerrando pool de MySQL:', err);
  }

  try {
    client.destroy();
  } catch (err) {
    console.error('Error cerrando cliente de Discord:', err);
  }

  console.log('Bot apagado correctamente.');
  process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('uncaughtException', (err) => {
  console.error('uncaughtException:', err);
  shutdown('uncaughtException');
});
process.once('unhandledRejection', (reason) => {
  console.error('unhandledRejection:', reason);
});

client.login(config.token);

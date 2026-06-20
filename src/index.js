const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { cleanupAllVoiceConnections } = require('./utils/voiceManager');
const { flushDatabase } = require('./utils/giveawayStore');
const { startLegalServer } = require('./utils/legalServer');
const { startWebNotifyServer } = require('./utils/webNotifyServer');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
  ]
});

client.commands = new Collection();
client.slashCommands = client.commands;
client.prefixCommands = new Collection();

// Slash commands
const commandsPath = path.join(__dirname, 'commands');
for (const file of fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'))) {
  const command = require(path.join(commandsPath, file));
  if (command.data) client.commands.set(command.data.name, command);
}

// Prefix commands
const prefixPath = path.join(__dirname, 'prefixcommands');
const registerPrefixCommand = (name, command) => {
  const key = String(name || '').toLowerCase().trim();
  if (!key) return;
  if (!client.prefixCommands.has(key)) {
    client.prefixCommands.set(key, command);
  }
};

if (fs.existsSync(prefixPath)) {
  for (const file of fs.readdirSync(prefixPath).filter(f => f.endsWith('.js'))) {
    const command = require(path.join(prefixPath, file));
    registerPrefixCommand(command.name, command);
    if (Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        registerPrefixCommand(alias, command);
      }
    }
  }
}

// Eventos
const eventsPath = path.join(__dirname, 'events');
for (const file of fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'))) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
}

let isShuttingDown = false;
const shutdown = async signal => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  try {
    await flushDatabase().catch(() => null);
  } catch (error) {
    console.error('Error guardando base de datos:', error);
  }

  try {
    cleanupAllVoiceConnections();
  } catch (error) {
    console.error('Error limpiando conexiones de voz:', error);
  }

  try {
    await client.destroy();
  } catch (error) {
    console.error('Error cerrando cliente de Discord:', error);
  }

  process.exit(signal === 'SIGINT' || signal === 'SIGTERM' ? 0 : 1);
};

startLegalServer();
client.once('ready', () => {
  startWebNotifyServer(client);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('uncaughtException', error => {
  console.error('uncaughtException:', error);
  shutdown('uncaughtException');
});
process.once('unhandledRejection', reason => {
  console.error('unhandledRejection:', reason);
  shutdown('unhandledRejection');
});

client.login(process.env.TOKEN);
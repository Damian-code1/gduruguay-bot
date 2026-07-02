'use strict';

require('dotenv').config();

const required = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`❌ Faltan variables de entorno: ${missing.join(', ')}`);
  process.exit(1);
}

module.exports = {
  token: process.env.TOKEN,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  modLogChannelId: process.env.MOD_LOG_CHANNEL_ID || '1496348718558089216',

  db: {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true',
  },

  colors: {
    primary: 0x5865F2,
    success: 0x2ECC71,
    danger: 0xC0392B,
    warning: 0xE67E22,
    info: 0x3498DB,
  },

  botBio: 'hecho por @evosen.',
};

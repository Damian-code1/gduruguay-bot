const { EmbedBuilder } = require('discord.js');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

let sheetsClient;

async function getSheet(sheetId, range = 'A:Z') {
  try {
    if (!sheetsClient) {
      const keyPath = path.join(__dirname, '../service-account-key.json');
      const keyFile = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

      const auth = new google.auth.GoogleAuth({
        credentials: keyFile,
        scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
      });

      sheetsClient = google.sheets({ version: 'v4', auth });
    }

    const response = await sheetsClient.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    return response.data.values || [];
  } catch (error) {
    console.error('Error reading sheet:', error);
    throw error;
  }
}

module.exports = {
  name: 'sheet',
  aliases: ['spreadsheet', 'sheets'],
  help: {
    purpose: 'Lee datos de un Google Sheet (público o compartido).',
    category: '🛡️ Moderación',
  },

  async execute(message, args) {
    const sheetId = args?.[0];
    const range = args?.[1] || 'A:Z';

    if (!sheetId) {
      return message.reply(
        'Uso: `-sheet <sheet-id> [range]`\n\n' +
        'El sheet-id se obtiene de la URL:\n' +
        '`https://docs.google.com/spreadsheets/d/AQUI-VA-EL-ID/edit`\n\n' +
        'Range opcional (default: A:Z, ej. A1:D10)'
      );
    }

    if (!/^[a-zA-Z0-9\-_]{40,}$/.test(sheetId)) {
      return message.reply('❌ El sheet-id no parece válido.');
    }

    try {
      const rows = await getSheet(sheetId, range);

      if (!rows || !rows.length) {
        return message.reply('❌ No se encontraron datos en el sheet.');
      }

      // Limitar a 40 filas para no exceder límites de Discord
      const displayRows = rows.slice(0, 40);
      const totalRows = rows.length;

      // Formatear como tabla
      let content = '```\n';
      for (const row of displayRows) {
        const formatted = row.slice(0, 8).map(cell => String(cell || '—').slice(0, 12)).join(' | ');
        content += formatted + '\n';
      }
      content += '```';

      if (content.length > 2000) {
        content = content.slice(0, 1990) + '\n...\n```';
      }

      const embed = new EmbedBuilder()
        .setTitle('📊 Google Sheet')
        .setColor(0x34A853)
        .setDescription(content || 'No hay contenido')
        .addFields(
          { name: 'Filas totales', value: String(totalRows), inline: true },
          { name: 'Mostradas', value: String(Math.min(displayRows.length, 40)), inline: true },
          { name: 'Range', value: `\`${range}\``, inline: true }
        )
        .setFooter({ text: 'Datos de Google Sheets' })
        .setTimestamp();

      return message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error:', error);
      return message.reply(
        `❌ Error: ${error.message}\n\n` +
        `¿Compartiste el sheet con:\n\`discord-bot@urubot-495804.iam.gserviceaccount.com\`?`
      );
    }
  },
};

'use strict';

const { query } = require('./database');

/**
 * Registra un DM enviado por el bot.
 * @param {{
 *   targetId: string, targetTag: string,
 *   senderId: string, senderTag: string,
 *   content: string, attachmentUrl?: string|null,
 *   delivered: boolean,
 * }} data
 */
async function logDm(data) {
  const [result] = await query(
    `INSERT INTO dm_logs (target_id, target_tag, sender_id, sender_tag, content, attachment_url, delivered, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      data.targetId,
      data.targetTag || null,
      data.senderId,
      data.senderTag || null,
      data.content || null,
      data.attachmentUrl || null,
      data.delivered ? 1 : 0,
    ],
  );
  return result.insertId;
}

/**
 * Devuelve una página del historial de DMs enviados, más reciente primero.
 * @param {{page?: number, pageSize?: number}} options
 */
async function getDmLogsPage(options = {}) {
  const page = Math.max(0, parseInt(options.page, 10) || 0);
  const pageSize = Math.min(Math.max(parseInt(options.pageSize, 10) || 5, 1), 25);
  const offset = page * pageSize;

  const [rows] = await query(
    `SELECT * FROM dm_logs ORDER BY fecha DESC LIMIT ${pageSize} OFFSET ${offset}`,
  );
  const [countRows] = await query('SELECT COUNT(*) AS total FROM dm_logs');
  const total = countRows[0]?.total || 0;

  return {
    rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

module.exports = { logDm, getDmLogsPage };

'use strict';

const { query } = require('./database');

/**
 * Inserta un registro de moderación en la base de datos.
 * @param {{
 *   tipo: string, guildId: string,
 *   targetId: string, targetTag: string,
 *   moderatorId: string, moderatorTag: string,
 *   razon?: string, durationMs?: number, durationText?: string, expiresAt?: Date|null,
 * }} data
 */
async function addModerationLog(data) {
  const [result] = await query(
    `INSERT INTO moderation_logs
      (tipo, guild_id, target_id, target_tag, moderator_id, moderator_tag, razon, duracion_ms, duracion_texto, expires_at, fecha)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      data.tipo,
      data.guildId,
      data.targetId,
      data.targetTag || null,
      data.moderatorId,
      data.moderatorTag || null,
      data.razon || null,
      data.durationMs || null,
      data.durationText || null,
      data.expiresAt || null,
    ],
  );
  return result.insertId;
}

/**
 * Devuelve los últimos logs de moderación de un usuario en un servidor.
 * @param {string} guildId
 * @param {string} targetId
 * @param {{tipo?: string, limit?: number}} options
 */
async function getModerationLogs(guildId, targetId, options = {}) {
  const { tipo = null, limit = 25 } = options;
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 100);

  if (tipo) {
    const [rows] = await query(
      `SELECT * FROM moderation_logs WHERE guild_id = ? AND target_id = ? AND tipo = ? ORDER BY fecha DESC LIMIT ${safeLimit}`,
      [guildId, targetId, tipo],
    );
    return rows;
  }

  const [rows] = await query(
    `SELECT * FROM moderation_logs WHERE guild_id = ? AND target_id = ? ORDER BY fecha DESC LIMIT ${safeLimit}`,
    [guildId, targetId],
  );
  return rows;
}

module.exports = { addModerationLog, getModerationLogs };

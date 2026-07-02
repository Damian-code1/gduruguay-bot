'use strict';

const UNIT_MS = {
  s: 1000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  mo: 30 * 86_400_000,
  a: 365 * 86_400_000,
};

/**
 * Parsea un string de duración tipo "1h30m", "2d 4h", "1mo", "1a" a milisegundos.
 * @param {string} input
 * @returns {number} milisegundos (0 si no se pudo parsear nada)
 */
function parseDuration(input) {
  if (!input) return 0;
  const regex = /(\d+)\s*(mo|a|[smhd])/gi;
  let totalMs = 0;
  let found = false;
  let match;

  while ((match = regex.exec(input)) !== null) {
    found = true;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();
    totalMs += value * (UNIT_MS[unit] || 0);
  }

  return found ? totalMs : 0;
}

/**
 * Formatea milisegundos a un string legible ("1a 2mo 3d 4h 5m 6s").
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const years = Math.floor(totalSeconds / 31_536_000);
  const months = Math.floor((totalSeconds % 31_536_000) / 2_592_000);
  const days = Math.floor((totalSeconds % 2_592_000) / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (years) parts.push(`${years}a`);
  if (months) parts.push(`${months}mo`);
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds || !parts.length) parts.push(`${seconds}s`);

  return parts.join(' ');
}

module.exports = { parseDuration, formatDuration };

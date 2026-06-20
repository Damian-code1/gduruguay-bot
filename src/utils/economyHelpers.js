const { formatDuration } = require('./timeParser');

function formatNumber(value) {
  return new Intl.NumberFormat('es-UY').format(Math.floor(value || 0));
}

function formatCurrency(amount, config) {
  return `${config.currencyEmoji} **${formatNumber(amount)}**`;
}

function parseAmountInput(raw, currentBalance = 0) {
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return null;

  if (text === 'all' || text === 'todo') return Math.max(0, Math.floor(currentBalance));
  if (text === 'half' || text === 'mitad') return Math.max(0, Math.floor(currentBalance / 2));

  const clean = text.replace(/[,_\.\s]/g, '');
  const amount = Number(clean);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return Math.floor(amount);
}

function cooldownText(remainingMs) {
  const secs = Math.max(1, Math.floor(remainingMs / 1000));
  return formatDuration(secs * 1000);
}

module.exports = {
  formatNumber,
  formatCurrency,
  parseAmountInput,
  cooldownText,
};

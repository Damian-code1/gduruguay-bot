function parseDuration(input) {
  const regex = /(\d+)\s*(mo|a|[smhd])/gi;
  let totalMs = 0;
  let match;
  let found = false;

  while ((match = regex.exec(input)) !== null) {
    found = true;
    const value = Number(match[1]);
    const unit = match[2].toLowerCase();

    if (unit === 's') totalMs += value * 1000;
    if (unit === 'm') totalMs += value * 60_000;
    if (unit === 'h') totalMs += value * 3_600_000;
    if (unit === 'd') totalMs += value * 86_400_000;
    if (unit === 'mo') totalMs += value * 30 * 86_400_000;
    if (unit === 'a') totalMs += value * 365 * 86_400_000;
  }

  return found ? totalMs : 0;
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const years = Math.floor(totalSeconds / 31_536_000);
  const months = Math.floor((totalSeconds % 31_536_000) / 2_592_000);
  const d = Math.floor((totalSeconds % 2_592_000) / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3_600);
  const m = Math.floor((totalSeconds % 3_600) / 60);
  const s = totalSeconds % 60;

  const parts = [];
  if (years) parts.push(`${years}a`);
  if (months) parts.push(`${months}mo`);
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m) parts.push(`${m}m`);
  if (s || !parts.length) parts.push(`${s}s`);

  return parts.join(' ');
}

module.exports = {
  parseDuration,
  formatDuration,
};

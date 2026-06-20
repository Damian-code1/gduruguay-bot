const DEFAULT_SCOPES = ['bot', 'applications.commands'];

function cleanUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  try {
    const url = new URL(text);
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

function getEnvUrl(...names) {
  for (const name of names) {
    const value = cleanUrl(process.env[name]);
    if (value) return value;
  }
  return null;
}

function getPublicBaseUrl() {
  return getEnvUrl('PUBLIC_BASE_URL', 'BASE_URL', 'APP_BASE_URL', 'SITE_URL');
}

function buildInviteUrl() {
  const customInvite = getEnvUrl('BOT_INVITE_URL', 'INVITE_URL');
  if (customInvite) return customInvite;

  const clientId = String(process.env.CLIENT_ID || process.env.APPLICATION_ID || process.env.DISCORD_CLIENT_ID || '').trim();
  if (!clientId) return null;

  const permissions = String(process.env.BOT_PERMISSIONS || process.env.INVITE_PERMISSIONS || '0').trim();
  const scopes = String(process.env.BOT_SCOPES || DEFAULT_SCOPES.join(' ')).trim().replace(/\s+/g, '%20');

  return `https://discord.com/oauth2/authorize?client_id=${encodeURIComponent(clientId)}&permissions=${encodeURIComponent(permissions)}&scope=${scopes}`;
}

function getLegalUrls() {
  const baseUrl = getPublicBaseUrl();

  return {
    baseUrl,
    termsUrl: getEnvUrl('TERMS_URL', 'TERMS_OF_SERVICE_URL') || (baseUrl ? `${baseUrl}/terms` : null),
    privacyUrl: getEnvUrl('PRIVACY_URL', 'PRIVACY_POLICY_URL') || (baseUrl ? `${baseUrl}/privacy` : null),
    inviteUrl: buildInviteUrl(),
  };
}

function getMissingLegalItems() {
  const urls = getLegalUrls();
  const missing = [];

  if (!urls.termsUrl) missing.push('terms');
  if (!urls.privacyUrl) missing.push('privacy');
  if (!urls.inviteUrl) missing.push('invite');

  return missing;
}

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  buildInviteUrl,
  cleanUrl,
  escapeHtml,
  getLegalUrls,
  getMissingLegalItems,
};
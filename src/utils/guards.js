'use strict';

const { isStaff } = require('./staffRolesStore');
const { getAllowedChannels } = require('./commandChannelStore');
const { replyError } = require('./respond');

/**
 * Verifica que el usuario sea staff (admin o rol de staff). Responde con error si no.
 * @returns {Promise<boolean>} true si puede continuar
 */
async function requireStaff(interaction) {
  const ok = await isStaff(interaction.member);
  if (!ok) {
    await replyError(interaction, 'No tenés permisos para usar este comando.');
    return false;
  }
  return true;
}

/**
 * Verifica que el comando se use en un canal permitido (si hay restricción configurada).
 * @returns {Promise<boolean>} true si puede continuar
 */
async function requireAllowedChannel(interaction) {
  const staffBypass = await isStaff(interaction.member);
  if (staffBypass) return true;

  const allowed = await getAllowedChannels(interaction.guildId);
  if (!allowed.length) return true;
  if (allowed.includes(interaction.channelId)) return true;

  await replyError(
    interaction,
    `Este comando solo se puede usar en: ${allowed.map((id) => `<#${id}>`).join(', ')}`,
  );
  return false;
}

module.exports = { requireStaff, requireAllowedChannel };

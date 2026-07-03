'use strict';

async function resolveUserTarget(interaction, user) {
  if (!user) return null;
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  return { id: user.id, tag: user.tag, member };
}

module.exports = { resolveUserTarget };
'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed } = require('../utils/respond');
const { getWarns } = require('../utils/warnStore');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warns')
    .setDescription('Muestra las advertencias de un usuario.')
    .addUserOption((opt) => opt.setName('usuario').setDescription('Usuario a consultar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const targetUser = interaction.options.getUser('usuario', true);
    const warns = await getWarns(interaction.guildId, targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Advertencias de ${targetUser.tag}`)
      .setColor(config.colors.warning)
      .setThumbnail(targetUser.displayAvatarURL())
      .setTimestamp();

    if (!warns.length) {
      embed.setDescription('Este usuario no tiene advertencias.');
    } else {
      const lines = warns
        .slice(0, 15)
        .map((w) => `**#${w.id}** — ${w.razon}\n<t:${Math.floor(new Date(w.fecha).getTime() / 1000)}:R> · por ${w.moderator_tag}`);
      embed.setDescription(lines.join('\n\n'));
      embed.setFooter({ text: `Total: ${warns.length} advertencia(s)${warns.length > 15 ? ' (mostrando 15)' : ''}` });
    }

    return replyEmbed(interaction, { embed });
  },
};

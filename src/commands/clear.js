'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff, requireAllowedChannel } = require('../utils/guards');
const { replyEmbed, replyError, postToModLog } = require('../utils/respond');
const { addModerationLog } = require('../utils/moderationLogStore');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Borra mensajes recientes del canal.')
    .addIntegerOption((opt) =>
      opt.setName('cantidad').setDescription('Cantidad de mensajes a borrar (1-100)').setMinValue(1).setMaxValue(100).setRequired(true),
    )
    .addUserOption((opt) => opt.setName('usuario').setDescription('Borrar solo mensajes de este usuario').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireAllowedChannel(interaction))) return;
    if (!(await requireStaff(interaction))) return;

    const cantidad = interaction.options.getInteger('cantidad', true);
    const targetUser = interaction.options.getUser('usuario');

    await interaction.deferReply({ flags: 1 << 6 });

    const messages = await interaction.channel.messages.fetch({ limit: 100 });
    const filtered = targetUser ? messages.filter((m) => m.author.id === targetUser.id) : messages;
    const toDelete = [...filtered.values()].slice(0, cantidad);

    if (!toDelete.length) {
      const embed = new EmbedBuilder().setTitle('❌ Error').setColor(config.colors.danger).setDescription('No hay mensajes para borrar con esos filtros.');
      return replyEmbed(interaction, { embed });
    }

    const deleted = await interaction.channel.bulkDelete(toDelete, true).catch(() => null);
    const deletedCount = deleted ? deleted.size : 0;

    await addModerationLog({
      tipo: 'clear',
      guildId: interaction.guildId,
      targetId: targetUser?.id || interaction.channelId,
      targetTag: targetUser?.tag || `#${interaction.channel.name}`,
      moderatorId: interaction.user.id,
      moderatorTag: interaction.user.tag,
      razon: `${deletedCount} mensaje(s) borrados en #${interaction.channel.name}`,
    });

    const embed = new EmbedBuilder()
      .setTitle('🧹 Mensajes eliminados')
      .setColor(config.colors.success)
      .addFields(
        { name: 'Cantidad', value: `${deletedCount}`, inline: true },
        { name: 'Canal', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Moderador', value: interaction.user.tag, inline: true },
      )
      .setTimestamp();

    if (targetUser) embed.addFields({ name: 'Filtrado por usuario', value: targetUser.tag });

    await replyEmbed(interaction, { embed });
    await postToModLog(interaction.client, config.modLogChannelId, embed);
  },
};

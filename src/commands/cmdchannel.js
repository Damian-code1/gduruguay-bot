'use strict';

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { requireStaff } = require('../utils/guards');
const { replyEmbed, replyError } = require('../utils/respond');
const {
  getAllowedChannels,
  setAllowedChannels,
  addAllowedChannels,
  removeAllowedChannels,
  clearAllowedChannels,
  formatAllowedChannels,
} = require('../utils/commandChannelStore');

module.exports = {
  visibility: 'admin', // 'public' | 'staff' | 'admin' (usado por /cmds)
  data: new SlashCommandBuilder()
    .setName('cmdchannel')
    .setDescription('Define en qué canal(es) se pueden usar los comandos del bot.')
    .addSubcommand((sub) =>
      sub
        .setName('set')
        .setDescription('Reemplaza la lista de canales permitidos.')
        .addChannelOption((opt) => opt.setName('canal').setDescription('Canal permitido').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('add')
        .setDescription('Agrega un canal a la lista de permitidos.')
        .addChannelOption((opt) => opt.setName('canal').setDescription('Canal a agregar').setRequired(true)),
    )
    .addSubcommand((sub) =>
      sub
        .setName('remove')
        .setDescription('Quita un canal de la lista de permitidos.')
        .addChannelOption((opt) => opt.setName('canal').setDescription('Canal a quitar').setRequired(true)),
    )
    .addSubcommand((sub) => sub.setName('list').setDescription('Muestra los canales permitidos actuales.'))
    .addSubcommand((sub) => sub.setName('clear').setDescription('Elimina la restricción (comandos en cualquier canal).'))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false),

  async execute(interaction) {
    if (!(await requireStaff(interaction))) return;

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === 'list') {
      const allowed = await getAllowedChannels(guildId);
      const embed = new EmbedBuilder()
        .setTitle('📌 Canales permitidos para comandos')
        .setDescription(allowed.length ? formatAllowedChannels(allowed) : 'No hay restricción activa. Los comandos funcionan en cualquier canal.')
        .setColor(config.colors.primary);
      return replyEmbed(interaction, { embed });
    }

    if (sub === 'clear') {
      await clearAllowedChannels(guildId);
      const embed = new EmbedBuilder()
        .setTitle('✅ Restricción desactivada')
        .setDescription('Los comandos ahora se pueden usar en cualquier canal.')
        .setColor(config.colors.success);
      return replyEmbed(interaction, { embed });
    }

    const channel = interaction.options.getChannel('canal', true);
    let updated;

    if (sub === 'set') updated = await setAllowedChannels(guildId, [channel.id]);
    else if (sub === 'add') updated = await addAllowedChannels(guildId, [channel.id]);
    else if (sub === 'remove') updated = await removeAllowedChannels(guildId, [channel.id]);
    else return replyError(interaction, 'Subcomando inválido.');

    const embed = new EmbedBuilder()
      .setTitle('✅ Canales de comandos actualizados')
      .setDescription(updated.length ? `Canales permitidos: ${formatAllowedChannels(updated)}` : 'No quedó ningún canal configurado. Los comandos funcionan en cualquier canal.')
      .setColor(config.colors.success);

    return replyEmbed(interaction, { embed });
  },
};

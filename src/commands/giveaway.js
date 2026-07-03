'use strict';

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { replyEmbed, replyError } = require('../utils/respond');
const { isStaff } = require('../utils/staffRolesStore');
const { parseDuration } = require('../utils/timeParser');
const {
  createGiveaway,
  setGiveawayMessageId,
  buildGiveawayEmbed,
  buildGiveawayButton,
} = require('../utils/giveawayRuntime');

module.exports = {
  visibility: 'staff',
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Crea un sorteo/giveaway con requisitos opcionales.')
    .addStringOption((opt) => opt.setName('premio').setDescription('Qué se sortea').setRequired(true))
    .addStringOption((opt) => opt.setName('duracion').setDescription('Ej: 1h, 30m, 2d').setRequired(true))
    .addIntegerOption((opt) => opt.setName('ganadores').setDescription('Cantidad de ganadores (default 1)').setMinValue(1))
    .addIntegerOption((opt) => opt.setName('mensajes_minimos').setDescription('Mínimo de mensajes en el server para poder participar').setMinValue(0))
    .addIntegerOption((opt) => opt.setName('invites_minimas').setDescription('Mínimo de invites para poder participar').setMinValue(0))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false),

  async execute(interaction) {
    const staff = await isStaff(interaction.member);
    if (!staff) return replyError(interaction, 'Solo staff puede crear giveaways.');

    const prize = interaction.options.getString('premio', true);
    const durationRaw = interaction.options.getString('duracion', true);
    const winnersCount = interaction.options.getInteger('ganadores') ?? 1;
    const minMessages = interaction.options.getInteger('mensajes_minimos') ?? 0;
    const minInvites = interaction.options.getInteger('invites_minimas') ?? 0;

    const durationMs = parseDuration(durationRaw);
    if (!durationMs || durationMs <= 0) {
      return replyError(interaction, 'Duración inválida. Usá algo como `1h`, `30m`, `2d`.');
    }

    const endsAt = new Date(Date.now() + durationMs);

    const giveawayId = await createGiveaway({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      prize,
      winnersCount,
      minMessages,
      minInvites,
      hostId: interaction.user.id,
      endsAt,
    });

    const fakeGiveaway = {
      id: giveawayId,
      prize,
      winners_count: winnersCount,
      min_messages: minMessages,
      min_invites: minInvites,
      host_id: interaction.user.id,
      ends_at: endsAt,
    };

    const embed = buildGiveawayEmbed(fakeGiveaway, 0);
    const row = buildGiveawayButton(giveawayId);

    const sent = await interaction.channel.send({ embeds: [embed], components: [row] });
    await setGiveawayMessageId(giveawayId, sent.id);

    return replyEmbed(interaction, {
      embed: { data: { title: '✅ Giveaway creado', description: `Se publicó el giveaway de **${prize}**.` } },
    });
  },
};
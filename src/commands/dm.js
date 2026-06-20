const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { recordDmLog } = require('../utils/dmLogStore');

const OWNER_ID = '1407737422732853331';

function buildUserChoices(interaction, query) {
  const normalized = String(query || '').trim().toLowerCase();
  const members = [...(interaction.guild?.members?.cache?.values?.() || [])];

  return members
    .filter(member => !member.user?.bot)
    .filter(member => {
      if (!normalized) return true;
      const username = String(member.user?.username || '').toLowerCase();
      const displayName = String(member.displayName || '').toLowerCase();
      const tag = String(member.user?.tag || '').toLowerCase();
      return username.includes(normalized) || displayName.includes(normalized) || tag.includes(normalized) || member.id.includes(normalized);
    })
    .slice(0, 25)
    .map(member => ({
      name: `${member.displayName || member.user.username} (${member.user.tag})`,
      value: member.id,
    }));
}

module.exports = {
  help: {
    purpose: 'Envía un mensaje privado a un usuario.',
    category: '📦 Otros',
    visibleToUserIds: [OWNER_ID],
  },
  data: new SlashCommandBuilder()
    .setName('dm')
    .setDescription('Envía un DM a un usuario')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('usuario')
        .setDescription('Nombre del usuario que recibirá el mensaje')
        .setAutocomplete(true)
        .setRequired(true))
    .addStringOption(option =>
      option
        .setName('mensaje')
        .setDescription('Texto del mensaje privado')
        .setRequired(true)
        .setMaxLength(2000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async autocomplete(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.respond([]).catch(() => null);
    }

    const focused = interaction.options.getFocused?.() ?? '';
    const choices = buildUserChoices(interaction, focused);
    return interaction.respond(choices).catch(() => null);
  },

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Este comando es solo para el dueño del bot.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true }).catch(() => null);

    const userId = String(interaction.options.getString('usuario', true) || '').trim();
    const message = interaction.options.getString('mensaje', true);

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.editReply('❌ Tenés que seleccionar un usuario válido de la lista.').catch(() => null);
    }

    try {
      const user = await interaction.client.users.fetch(userId);
      await user.send({
        content: message,
        allowedMentions: { parse: [] },
      });
      recordDmLog({
        authorId: interaction.user.id,
        authorTag: interaction.user.tag,
        targetId: user.id,
        targetTag: user.tag,
        content: message,
        createdAt: Date.now(),
      });
      return interaction.editReply(`✅ Mensaje enviado a ${user.tag}.`).catch(() => null);
    } catch {
      return interaction.editReply('❌ No pude enviar el DM. Quizá tiene los privados cerrados.').catch(() => null);
    }
  },
};

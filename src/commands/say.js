const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const OWNER_ID = '1407737422732853331';

module.exports = {
  help: {
    purpose: 'Hace que el bot diga un mensaje en el canal actual.',
    category: '📦 Otros',
    visibleToUserIds: [OWNER_ID],
  },
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('Hace que el bot diga un mensaje en este canal')
    .setDMPermission(false)
    .addStringOption(option =>
      option
        .setName('mensaje')
        .setDescription('Texto que enviará el bot')
        .setRequired(true)
        .setMaxLength(2000))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (interaction.user.id !== OWNER_ID) {
      return interaction.reply({ content: '❌ Este comando es solo para el dueño del bot.', ephemeral: true });
    }

    const message = interaction.options.getString('mensaje', true);
    await interaction.reply({ content: '✅ Mensaje enviado.', ephemeral: true }).catch(() => null);
    return interaction.channel.send({
      content: message,
      allowedMentions: { parse: [] },
    }).catch(async () => {
      await interaction.followUp({ content: '❌ No pude enviar el mensaje en este canal.', ephemeral: true }).catch(() => null);
    });
  },
};

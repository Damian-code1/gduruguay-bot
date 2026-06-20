const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getLegalUrls, getMissingLegalItems } = require('../utils/legalLinks');

module.exports = {
  help: {
    purpose: 'Muestra los enlaces públicos del bot: Términos, Privacidad e instalación.',
    category: '📊 Información',
  },
  data: new SlashCommandBuilder()
    .setName('legal')
    .setDescription('Muestra los enlaces públicos del bot')
    .setDMPermission(false),

  async execute(interaction) {
    const urls = getLegalUrls();
    const missing = getMissingLegalItems();

    const embed = new EmbedBuilder()
      .setTitle('📎 Enlaces públicos del bot')
      .setColor(0x5865F2)
      .addFields(
        { name: 'Términos de Servicio', value: urls.termsUrl ? urls.termsUrl : '❌ No configurado', inline: false },
        { name: 'Política de Privacidad', value: urls.privacyUrl ? urls.privacyUrl : '❌ No configurado', inline: false },
        { name: 'Instalar bot', value: urls.inviteUrl ? urls.inviteUrl : '❌ No configurado', inline: false },
      )
      .setFooter({ text: missing.length ? `Faltan: ${missing.join(', ')}` : 'Configuración legal completa' })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], ephemeral: true });
  },
};
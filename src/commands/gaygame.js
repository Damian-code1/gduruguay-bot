const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function animateReply(interaction, frames, delayMs) {
  for (const frame of frames) {
    const edited = await interaction.editReply({ embeds: [frame] }).catch(() => null);
    if (!edited) break;
    await wait(delayMs);
  }
}

function obtenerRespuesta(porcentaje) {
  if (porcentaje === 100) {
    return { texto: '🏳️‍🌈 Definitivamente sí. No hay vuelta atrás.', color: 0xFF69B4 };
  }

  if (porcentaje >= 90) {
    return { texto: '🌈 Altísimo... sospechosamente alto.', color: 0xFF69B4 };
  }

  if (porcentaje >= 75) {
    return { texto: '📊 Muy probable que sí.', color: 0xFF69B4 };
  }

  if (porcentaje >= 60) {
    return { texto: '🤔 Bastante probable.', color: 0xF1C40F };
  }

  if (porcentaje >= 45) {
    return { texto: '🤷 Está medio dividido.', color: 0xF1C40F };
  }

  if (porcentaje >= 30) {
    return { texto: '🧐 Poco probable.', color: 0x3498DB };
  }

  if (porcentaje >= 10) {
    return { texto: '❌ Muy poco probable.', color: 0x3498DB };
  }

  if (porcentaje === 0) {
    return { texto: '🧊 Definitivamente no. Ni un pelo.', color: 0x3498DB };
  }

  return { texto: '❌ Casi nada.', color: 0x3498DB };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('gaygame')
    .setDescription('¿Sos gay? El bot tiene la respuesta definitiva.')
    .addUserOption(option =>
      option.setName('usuario')
        .setDescription('Mencioná a alguien (o dejalo vacío para vos mismo)')
        .setRequired(false)
    ),

  async execute(interaction) {
    const objetivo = interaction.options.getUser('usuario') || interaction.user;
    const porcentaje = Math.floor(Math.random() * 101);

    const respuesta = obtenerRespuesta(porcentaje);

    const bloques = Math.floor(porcentaje / 10);
    const barra = '🟦'.repeat(bloques) + '⬜'.repeat(10 - bloques);

    const embed = new EmbedBuilder()
      .setTitle('🏳️‍🌈 El detector ha hablado')
      .setDescription(`**${objetivo.username}** — ${respuesta.texto}`)
      .addFields({
        name: 'Porcentaje gay',
        value: `${barra} **${porcentaje}%**`
      })
      .setColor(respuesta.color)
      .setThumbnail(objetivo.displayAvatarURL())
      .setFooter({ text: 'Resultado 100% científico y definitivo' })
      .setTimestamp();

    await interaction.deferReply();

    const animFrames = [
      new EmbedBuilder()
        .setTitle('🏳️‍🌈 Analizando...')
        .setDescription(`Escaneando a **${objetivo.username}**`)
        .setColor(0x5865F2),
      new EmbedBuilder()
        .setTitle('🏳️‍🌈 Analizando...')
        .setDescription(`Escaneando a **${objetivo.username}**.`)
        .setColor(0x5865F2),
      new EmbedBuilder()
        .setTitle('🏳️‍🌈 Analizando...')
        .setDescription(`Escaneando a **${objetivo.username}**..`)
        .setColor(0x5865F2),
      new EmbedBuilder()
        .setTitle('🏳️‍🌈 Analizando...')
        .setDescription(`Escaneando a **${objetivo.username}**...`)
        .setColor(0x5865F2),
    ];

    await animateReply(interaction, animFrames, 450);

    await interaction.editReply({ embeds: [embed] });
  }
};
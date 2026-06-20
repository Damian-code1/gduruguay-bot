const {
  recommendNow,
} = require(
  '../utils/anilistRecommender'
);

const {
  MessageFlags,
} = require('discord.js');

module.exports = {
  name: 'anirecnow',

  aliases: [
    'anirecommendnow',
  ],

  help: {
    purpose:
      'Forzar recomendación de anime.',

    category: '🔧 Admin',

    usage: '-anirecnow',
  },

  async execute(message) {
    const member =
      message.member;

    if (
      !member.permissions.has(
        'ManageGuild'
      ) &&
      !member.permissions.has(
        'Administrator'
      )
    ) {
      return message.reply({
        flags:
          MessageFlags
            .Ephemeral,

        content:
          '❌ Solo el staff puede usar este comando.',
      });
    }

    try {
      const res =
        await recommendNow(
          message.client
        );

      if (res?.ok) {
        return message.reply({
          components: [
            {
              type: 17,
              accent_color:
                0x57f287,

              components: [
                {
                  type: 10,

                  content:
                    '# ✅ Recomendación enviada\n\nLa recomendación anime fue enviada correctamente.',
                },
              ],
            },
          ],

          flags:
            MessageFlags
              .IsComponentsV2,
        });
      }

      const reason =
        res?.reason ||
        'unknown';

      let errorText =
        '⚠️ No se pudo enviar la recomendación.';

      if (
        reason ===
        'no_channel'
      ) {
        errorText =
          `⚠️ No se encontró el canal objetivo.\n\nID: \`${res.details || 'unknown'}\``;
      }

      else if (
        reason ===
        'no_candidates'
      ) {
        errorText =
          '⚠️ No se encontraron animes válidos.';
      }

      else if (
        reason ===
          'send_error' ||
        reason ===
          'exception'
      ) {
        errorText =
          `❌ Error al enviar:\n\`\`\`\n${res.details || reason}\n\`\`\``;
      }

      else if (reason === 'no_client') {
        errorText =
          '⚠️ El cliente de Discord aún no está listo.';
      }

      return message.reply({
        flags:
          MessageFlags
            .IsComponentsV2,

        components: [
          {
            type: 17,
            accent_color:
              0xed4245,

            components: [
              {
                type: 10,

                content:
                  `# ❌ Error\n\n${errorText}`,
              },
            ],
          },
        ],
      });
    } catch (e) {
      console.error(
        '[anirecnow]',
        e
      );

      return message.reply({
        flags:
          MessageFlags
            .IsComponentsV2,

        components: [
          {
            type: 17,
            accent_color:
              0xed4245,

            components: [
              {
                type: 10,

                content:
                  '# ❌ Error interno\n\nOcurrió un error intentando enviar la recomendación.',
              },
            ],
          },
        ],
      });
    }
  },
};
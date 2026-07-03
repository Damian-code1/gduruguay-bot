'use strict';

const { EmbedBuilder, MessageFlags, PermissionFlagsBits } = require('discord.js');
const config = require('../config');
const { handleLevelSearchInteraction } = require('../utils/levelSearchInteractions');
const { assignDepartmentToMember } = require('../utils/departmentAssign');
const { buildDmLogPayload } = require('../utils/dmLogUi');
const { getGiveaway, hasEntry, addEntry, getEntryCount, checkGiveawayRequirements, buildGiveawayEmbed, buildGiveawayButton } = require('../utils/giveawayRuntime');
const { handlePollVote } = require('../utils/pollRuntime');

const DEPT_ASSIGN_FAIL_MESSAGES = {
  not_configured: 'Ese departamento todavía no tiene un rol configurado. Avisale a un admin.',
  role_missing: 'El rol de ese departamento fue eliminado del servidor. Avisale a un admin.',
  is_owner: 'Discord no permite que ningún bot asigne o remueva roles al dueño del servidor. Esto es una restricción de la plataforma, no del bot.',
  member_hierarchy: 'No puedo modificar tus roles porque tenés un rol igual o superior al mío en la jerarquía del server. Avisale a un admin para que suba el rol del bot.',
  hierarchy: 'El rol de ese departamento está por encima del mío en la jerarquía, no lo puedo asignar. Avisale a un admin para que suba el rol del bot por encima de ese departamento.',
};

module.exports = {
  name: 'interactionCreate',
  async execute(interaction) {
    if (interaction.isChatInputCommand()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error ejecutando /${interaction.commandName}:`, error);

        const embed = new EmbedBuilder()
          .setTitle('❌ Ocurrió un error')
          .setColor(config.colors.danger)
          .setDescription('Algo falló al ejecutar el comando. Intentá de nuevo en unos segundos.');

        const payload = { embeds: [embed], flags: MessageFlags.Ephemeral };

        if (interaction.deferred || interaction.replied) {
          await interaction.editReply(payload).catch(() => null);
        } else {
          await interaction.reply(payload).catch(() => null);
        }
      }
      return;
    }

    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(interaction);
      } catch (error) {
        console.error(`Error en autocomplete de /${interaction.commandName}:`, error);
      }
      return;
    }

    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      const [namespace] = interaction.customId.split(':');

      if (namespace === 'lvlsearch') {
        try {
          await handleLevelSearchInteraction(interaction);
        } catch (error) {
          console.error('Error manejando interacción de /levelsearch:', error);
          await interaction
            .reply({ content: 'Ocurrió un error al procesar la búsqueda.', flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }
        return;
      }

      if (namespace === 'depselect' && interaction.isStringSelectMenu()) {
        try {
          const departmentName = interaction.values?.[0];
          if (!departmentName) return;

          const result = await assignDepartmentToMember(interaction.member, departmentName);

          if (!result.ok) {
            const text = DEPT_ASSIGN_FAIL_MESSAGES[result.reason] || 'No se pudo asignar el departamento.';
            return interaction.reply({ content: `⚠️ ${text}`, flags: MessageFlags.Ephemeral });
          }

          if (result.alreadyHad) {
            return interaction.reply({ content: `📍 Ya tenías el departamento **${departmentName}**.`, flags: MessageFlags.Ephemeral });
          }

          const swapText = result.previousRoleId ? ' (se removió tu departamento anterior)' : '';
          return interaction.reply({ content: `✅ Te asigné el departamento **${departmentName}**${swapText}.`, flags: MessageFlags.Ephemeral });
        } catch (error) {
          console.error('Error manejando depselect:', error);
          await interaction.reply({ content: 'Ocurrió un error al asignar el departamento.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        return;
      }

      if (namespace === 'cmds' && interaction.isButton()) {
        const [, ownerId, catIndexStr, pageStr] = interaction.customId.split(':');
        const command = interaction.client.commands.get('cmds');
        if (!command?.handleButton) return;

        try {
          await command.handleButton(interaction, ownerId, catIndexStr, pageStr);
        } catch (error) {
          console.error('Error manejando botón de /cmds:', error);
          await interaction
            .reply({ content: 'Ocurrió un error al cambiar de página.', flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }
        return;
      }

      if (namespace === 'cmdscat' && interaction.isStringSelectMenu()) {
        const [, ownerId] = interaction.customId.split(':');
        const command = interaction.client.commands.get('cmds');
        if (!command?.handleSelect) return;

        try {
          await command.handleSelect(interaction, ownerId);
        } catch (error) {
          console.error('Error manejando dropdown de /cmds:', error);
          await interaction
            .reply({ content: 'Ocurrió un error al cambiar de categoría.', flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }
        return;
      }

      if (namespace === 'giveaway' && interaction.isButton()) {
        try {
          const [, action, giveawayIdStr] = interaction.customId.split(':');
          const giveawayId = Number(giveawayIdStr);
          const giveaway = await getGiveaway(giveawayId);

          if (!giveaway || giveaway.ended) {
            return interaction.reply({ content: '⚠️ Este giveaway ya finalizó.', flags: MessageFlags.Ephemeral });
          }

          const already = await hasEntry(giveawayId, interaction.user.id);
          if (already) {
            return interaction.reply({ content: '✅ Ya estás participando en este giveaway.', flags: MessageFlags.Ephemeral });
          }

          const failures = await checkGiveawayRequirements(interaction.guild, interaction.user.id, giveaway);
          if (failures.length) {
            return interaction.reply({
              content: `❌ No cumplís los requisitos para participar:\n${failures.map((f) => `• ${f}`).join('\n')}`,
              flags: MessageFlags.Ephemeral,
            });
          }

          await addEntry(giveawayId, interaction.user.id);
          const entryCount = await getEntryCount(giveawayId);

          const embed = buildGiveawayEmbed(giveaway, entryCount);
          const row = buildGiveawayButton(giveawayId);
          await interaction.message.edit({ embeds: [embed], components: [row] }).catch(() => null);

          return interaction.reply({ content: '🎉 ¡Ya estás participando en el giveaway!', flags: MessageFlags.Ephemeral });
        } catch (error) {
          console.error('Error manejando botón de giveaway:', error);
          await interaction.reply({ content: 'Ocurrió un error al participar en el giveaway.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        return;
      }

      if (namespace === 'poll' && interaction.isButton()) {
        try {
          await handlePollVote(interaction);
        } catch (error) {
          console.error('Error manejando voto de poll:', error);
          await interaction.reply({ content: 'Ocurrió un error al votar.', flags: MessageFlags.Ephemeral }).catch(() => null);
        }
        return;
      }

      if (namespace === 'dmlog' && interaction.isButton()) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction
            .reply({ content: 'Solo administradores pueden ver esto.', flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }

        const [, pageStr] = interaction.customId.split(':');
        const targetPage = Math.max(0, parseInt(pageStr, 10) || 0);

        try {
          const payload = await buildDmLogPayload(targetPage);
          await interaction.update(payload);
        } catch (error) {
          console.error('Error manejando botón de /dmcheck /dmreplies:', error);
          await interaction
            .reply({ content: 'Ocurrió un error al cambiar de página.', flags: MessageFlags.Ephemeral })
            .catch(() => null);
        }
      }
    }
  },
};

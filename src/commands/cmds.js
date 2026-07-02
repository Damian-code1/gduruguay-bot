'use strict';

const {
  SlashCommandBuilder,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');

const PAGE_SIZE = 6;

/**
 * Determina qué comandos puede ver un miembro:
 * - 'public': todos.
 * - 'staff': solo si es staff (admin o rol de staff en la DB).
 * - 'admin': solo si tiene el permission flag Administrator.
 */
async function getVisibleCommands(interaction) {
  const allCommands = [...interaction.client.commands.values()];
  const isAdmin = interaction.member?.permissions?.has('Administrator') ?? false;
  const staff = await isStaff(interaction.member);

  return allCommands
    .filter((cmd) => {
      const vis = cmd.visibility || 'public';
      if (vis === 'public') return true;
      if (vis === 'staff') return staff;
      if (vis === 'admin') return isAdmin;
      return false;
    })
    .sort((a, b) => a.data.name.localeCompare(b.data.name));
}

function buildPageContainer(commands, page, totalPages) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('### Comandos disponibles'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  const start = page * PAGE_SIZE;
  const pageCommands = commands.slice(start, start + PAGE_SIZE);

  const listText = pageCommands
    .map((cmd) => `**/${cmd.data.name}**\n${cmd.data.description}`)
    .join('\n\n');

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(listText || 'No hay comandos disponibles para vos.'),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`Página ${page + 1} de ${totalPages} · ${commands.length} comando(s)`),
  );

  return container;
}

function buildButtons(userId, page, totalPages) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cmds:${userId}:${page - 1}`)
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`cmds:${userId}:${page + 1}`)
      .setLabel('Siguiente')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
  return row;
}

module.exports = {
  visibility: 'public', // 'public' | 'staff' | 'admin' (usado por /cmds)

  data: new SlashCommandBuilder()
    .setName('cmds')
    .setDescription('Muestra los comandos disponibles para vos.')
    .setDMPermission(false),

  async execute(interaction) {
    const commands = await getVisibleCommands(interaction);
    const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
    const page = 0;

    const container = buildPageContainer(commands, page, totalPages);
    const row = buildButtons(interaction.user.id, page, totalPages);

    await interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: totalPages > 1 ? [container, row] : [container],
    });
  },

  // Usado por interactionCreate.js para manejar los botones de paginación.
  async handleButton(interaction, ownerId, targetPage) {
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: 'Este menú no es tuyo. Usá /cmds para ver el tuyo.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const commands = await getVisibleCommands(interaction);
    const totalPages = Math.max(1, Math.ceil(commands.length / PAGE_SIZE));
    const page = Math.min(Math.max(targetPage, 0), totalPages - 1);

    const container = buildPageContainer(commands, page, totalPages);
    const row = buildButtons(ownerId, page, totalPages);

    await interaction.update({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: totalPages > 1 ? [container, row] : [container],
    });
  },
};
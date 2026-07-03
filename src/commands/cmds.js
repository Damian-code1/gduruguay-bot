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
  StringSelectMenuBuilder,
} = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');

const CMDS_PER_PAGE = 5; // máximo de comandos por página dentro de una categoría

// Comandos cuyo `visibility` declarado no coincide con su chequeo real de
// permisos (todos exigen Administrator internamente pese a decir 'public').
// Se fuerza acá para que /cmds los categorice y oculte correctamente.
const FORCE_ADMIN_VISIBILITY = new Set([
  'dm', 'dmcheck', 'dmreplies', 'depchannel', 'cmdchannel',
]);

// Categorías con orden fijo, ícono y ejemplos de uso por comando/subcomando.
const CATEGORIES = [
  {
    key: 'economia',
    label: '💠 Economía — Aura',
    commands: {
      aura: [
        { sub: 'claim',    usage: '/aura claim' },
        { sub: 'status',   usage: '/aura status' },
        { sub: 'top',      usage: '/aura top' },
        { sub: 'give',     usage: '/aura give usuario:@user cantidad:1000' },
        { sub: 'remove',   usage: '/aura remove usuario:@user cantidad:1000' },
        { sub: 'reset',    usage: '/aura reset usuario:@user' },
        { sub: 'ban',      usage: '/aura ban usuario:@user activo:true' },
        { sub: 'cd reset', usage: '/aura cd reset usuario:@user' },
      ],
    },
  },
  {
    key: 'moderacion',
    label: '🛡️ Moderación',
    commands: {
      ban:         [{ usage: '/ban usuario:@user razon:texto' }],
      unban:       [{ usage: '/unban id:123456789012345678' }],
      kick:        [{ usage: '/kick usuario:@user razon:texto' }],
      mute: [
        { sub: 'usuario',     usage: '/mute usuario usuario:@user duracion:1h razon:texto' },
        { sub: 'role-create', usage: '/mute role-create' },
        { sub: 'role-check',  usage: '/mute role-check' },
      ],
      unmute:      [{ usage: '/unmute usuario:@user' }],
      warn:        [{ usage: '/warn usuario:@user razon:texto' }],
      warns:       [{ usage: '/warns usuario:@user' }],
      clearwarns:  [{ usage: '/clearwarns usuario:@user' }],
      clear:       [{ usage: '/clear cantidad:20' }],
      slowmode:    [{ usage: '/slowmode segundos:10' }],
      modlogs:     [{ usage: '/modlogs usuario:@user' }],
      roleadd:     [{ usage: '/roleadd usuario:@user rol:nombre' }],
      rolerem:     [{ usage: '/rolerem usuario:@user rol:nombre' }],
      staffrole:   [{ usage: '/staffrole rol:@rol' }],
      autorole: [
        { sub: 'set',   usage: '/autorole set rol:@rol' },
        { sub: 'check', usage: '/autorole check' },
        { sub: 'clear', usage: '/autorole clear' },
      ],
    },
  },
  {
    key: 'departamentos',
    label: '🗺️ Departamentos',
    commands: {
      dephelp: [{ usage: '/dephelp' }],
    },
  },
  {
    key: 'geometry-dash',
    label: '🎮 Geometry Dash',
    commands: {
      levelsearch: [{ usage: '/levelsearch nombre:NombreDelNivel' }],
      tier:        [{ usage: '/tier id:12345678' }],
    },
  },
  {
    key: 'utilidad',
    label: '🔧 Utilidad',
    commands: {
      afk:  [{ usage: '/afk razon:Volviendo enseguida' }],
      ping: [{ usage: '/ping' }],
      cmds: [{ usage: '/cmds' }],
    },
  },
  {
    key: 'administracion',
    label: '👑 Administración',
    commands: {
      say:         [{ usage: '/say canal:#canal mensaje:texto' }],
      dm:          [{ usage: '/dm usuario:@user mensaje:texto' }],
      dmcheck:     [{ usage: '/dmcheck' }],
      dmreplies:   [{ usage: '/dmreplies' }],
      depchannel:  [{ usage: '/depchannel canal:#canal' }],
      cmdchannel:  [{ usage: '/cmdchannel canal:#canal' }],
    },
  },
];

function effectiveVisibility(cmd) {
  if (FORCE_ADMIN_VISIBILITY.has(cmd.data.name)) return 'admin';
  return cmd.visibility || 'public';
}

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

  const visibleNames = new Set(
    allCommands
      .filter((cmd) => {
        const vis = effectiveVisibility(cmd);
        if (vis === 'public') return true;
        if (vis === 'staff') return staff;
        if (vis === 'admin') return isAdmin;
        return false;
      })
      .map((cmd) => cmd.data.name),
  );

  // Arma las categorías solo con los comandos que el usuario puede ver,
  // preservando el orden y agrupación fija de CATEGORIES.
  return CATEGORIES
    .map((cat) => ({
      ...cat,
      entries: Object.entries(cat.commands).filter(([name]) => visibleNames.has(name)),
    }))
    .filter((cat) => cat.entries.length > 0);
}

function buildPageContainer(categories, catIndex, page) {
  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent('### 📖 Comandos disponibles'),
  );
  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));

  const cat = categories[catIndex];

  if (!cat) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent('No hay comandos disponibles para vos. Elegí una categoría del menú de abajo.'),
    );
    return container;
  }

  const totalPages = Math.max(1, Math.ceil(cat.entries.length / CMDS_PER_PAGE));
  const safePage = Math.min(Math.max(page, 0), totalPages - 1);
  const start = safePage * CMDS_PER_PAGE;
  const pageEntries = cat.entries.slice(start, start + CMDS_PER_PAGE);

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${cat.label}`),
  );

  let cmdIndex = start;
  const blocks = pageEntries.map(([name, variants]) => {
    cmdIndex += 1;
    const usageLines = variants
      .map((v) => {
        const label = v.sub ? `\`/${name} ${v.sub}\`` : `\`/${name}\``;
        return `> ↳ **Uso:** ${label}\n> \`${v.usage}\``;
      })
      .join('\n');
    return `**${cmdIndex}- /${name}**\n|\n${usageLines}`;
  });

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(blocks.join('\n\n')),
  );

  container.addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small));
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `${cat.label} · página ${safePage + 1} de ${totalPages} · ${cat.entries.length} comando(s)`,
    ),
  );

  return container;
}

function buildSelectRow(userId, categories, catIndex) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cmdscat:${userId}`)
    .setPlaceholder('📂 Elegí una categoría…')
    .addOptions(
      categories.map((cat, i) => ({
        label: cat.label.replace(/^[^\s]+\s/, ''), // saca el emoji del label para el option label
        description: `${cat.entries.length} comando(s)`,
        value: String(i),
        emoji: cat.label.match(/^\p{Emoji}/u)?.[0] || undefined,
        default: i === catIndex,
      })),
    );
  return new ActionRowBuilder().addComponents(menu);
}

function buildPageButtons(userId, catIndex, page, totalPages) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`cmds:${userId}:${catIndex}:${page - 1}`)
      .setLabel('Anterior')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`cmds:${userId}:${catIndex}:${page + 1}`)
      .setLabel('Siguiente')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages - 1),
  );
  return row;
}

function buildComponents(categories, catIndex, page, userId) {
  const cat = categories[catIndex];
  const container = buildPageContainer(categories, catIndex, page);
  const components = [container, buildSelectRow(userId, categories, catIndex)];

  if (cat) {
    const totalPages = Math.max(1, Math.ceil(cat.entries.length / CMDS_PER_PAGE));
    if (totalPages > 1) {
      components.push(buildPageButtons(userId, catIndex, page, totalPages));
    }
  }

  return components;
}

module.exports = {
  visibility: 'public', // 'public' | 'staff' | 'admin' (usado por /cmds)

  data: new SlashCommandBuilder()
    .setName('cmds')
    .setDescription('Muestra los comandos disponibles para vos.')
    .setDMPermission(false),

  async execute(interaction) {
    const categories = await getVisibleCommands(interaction);
    const catIndex = 0;
    const page = 0;

    const components = buildComponents(categories, catIndex, page, interaction.user.id);

    await interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components,
    });
  },

  // Usado por interactionCreate.js al cambiar de página dentro de una categoría.
  async handleButton(interaction, ownerId, catIndexStr, targetPageStr) {
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: 'Este menú no es tuyo. Usá /cmds para ver el tuyo.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const categories = await getVisibleCommands(interaction);
    const catIndex = Math.min(Math.max(parseInt(catIndexStr, 10) || 0, 0), Math.max(categories.length - 1, 0));
    const cat = categories[catIndex];
    const totalPages = cat ? Math.max(1, Math.ceil(cat.entries.length / CMDS_PER_PAGE)) : 1;
    const page = Math.min(Math.max(parseInt(targetPageStr, 10) || 0, 0), totalPages - 1);

    const components = buildComponents(categories, catIndex, page, ownerId);

    await interaction.update({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components,
    });
  },

  // Usado por interactionCreate.js al elegir una categoría del dropdown.
  async handleSelect(interaction, ownerId) {
    if (interaction.user.id !== ownerId) {
      return interaction.reply({
        content: 'Este menú no es tuyo. Usá /cmds para ver el tuyo.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const categories = await getVisibleCommands(interaction);
    const catIndex = Math.min(Math.max(parseInt(interaction.values?.[0], 10) || 0, 0), Math.max(categories.length - 1, 0));
    const page = 0;

    const components = buildComponents(categories, catIndex, page, ownerId);

    await interaction.update({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components,
    });
  },
};
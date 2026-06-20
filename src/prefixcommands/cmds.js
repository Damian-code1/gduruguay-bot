const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const { listIncomeActions } = require('../utils/incomeActions');
const { isStaff } = require('../utils/staffRolesStore');
const { isEconomySeasonLocked } = require('../utils/economySeasonStore');

const INFO_COMMANDS = new Set(['ping', 'info', 'cmds']);
const ADMIN_PREFIX_COMMANDS = new Set(['mute', 'unmute', 'kick', 'ban', 'clear', 'mutelogs', 'kicklogs', 'banlogs']);
const LOG_PREFIX_COMMANDS = new Set(['mutelogs', 'kicklogs', 'banlogs']);
const STAFF_COMMAND_NAMES = new Set([
  'cmdchannel', 'datareset', 'economyban', 'forcerob', 'gclog', 'grantcoins', 'kick', 'kicklogs',
  'lock', 'logs', 'mute', 'mutelogs', 'openseason', 'rclog', 'removecoins', 'resetcds', 'resetnick',
  'resetseason', 'resetshop', 'roblogs', 'rolecreate', 'roleedit', 'roleinfo', 'roleprice', 'rwarn',
  'serverstats', 'setcurrency', 'slowmode', 'staffrole', 'targetreply', 'testcoins', 'unlock', 'unmute',
  'utologs', 'vclogs', 'warn', 'warns', 'warnslist', 'withdraw', 'top', 'gw', 'giveaway', 'massban', 'masskick'
]);
const CATEGORY_ORDER = ['💰 Economía', '🎮 Diversión', '📊 Información', '🎁 Sorteos', '🛡️ Moderación', '📋 Logs', '📦 Otros'];
const CATEGORY_KEYWORDS = {
  '🛡️ Moderación': [
    'moderacion', 'moderación', 'moderadores', 'moderador', 'mod', 'staff', 'mute', 'mutear', 'silenciar',
    'ban', 'banear', 'kick', 'expulsar', 'warn', 'warns', 'warnslist', 'warns', 'exclude', 'excluir',
    'unmute', 'unban', 'unexclude', 'clearwarns', 'muteo', 'sancion', 'sanciones', 'roleinfo', 'rolinfo',
  ],
  '🎁 Sorteos': [
    'sorteo', 'sorteos', 'giveaway', 'giveaways', 'gw', 'premio', 'premios', 'rifa', 'rifas', 'panel', 'reroll', 'stats',
  ],
  '📊 Información': [
    'info', 'informacion', 'información', 'comandos', 'help', 'ayuda', 'cmds', 'levelsearch', 'lvl', 'gd', 'tier',
    'user', 'perfil', 'roleinfo', 'channelinfo', 'animesearch', 'anistatus', 'anisetup', 'anirecnow',
  ],
  '💰 Economía': [
    'economia', 'economía', 'eco', 'coins', 'monedas', 'money', 'saldo', 'balance', 'pay', 'deposit', 'withdraw',
    'shop', 'daily', 'work', 'bet', 'rob', 'robar', 'income', 'grantcoins', 'removecoins', 'prestamo',
  ],
  '🎮 Diversión': [
    'diversion', 'diversión', 'juego', 'juegos', 'fun', 'poll', 'pollito', 'ruleta', 'ship', 'duelo', 'afk',
    'anime', 'anilist', 'recomendacion', 'recomendaciones', 'levelsearch', 'tier',
  ],
  '📋 Logs': [
    'logs', 'log', 'registro', 'registros', 'mutelogs', 'kicklogs', 'banlogs', 'gclog', 'rclog', 'utologs',
    'vclogs', 'roblogs', 'kicklog', 'banlog', 'mutelog',
  ],
};
const CATEGORY_COLORS = {
  // Replaced pure white with a soft light-blue color for better visibility
  '💰 Economía': 0xE6F0FF,
  '🎮 Diversión': 0xE6F0FF,
  '📊 Información': 0xE6F0FF,
  '🛡️ Moderación': 0xE6F0FF,
  '📋 Logs': 0xE6F0FF,
  '📦 Otros': 0xE6F0FF,
};

// Reduce page size so embeds look cleaner and don't hit field limits
const PAGE_SIZE = 6;
const COMPONENTS_V2_FLAG = MessageFlags.IsComponentsV2;

function isPrivilegedMember(member, guildId) {
  return member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(member, guildId);
}

function inferCategory(name, helpCategory, adminOnly, source) {
  if (helpCategory) return helpCategory;
  if (source === 'prefix' && LOG_PREFIX_COMMANDS.has(name)) return '📋 Logs';
  if (adminOnly) return '🛡️ Moderación';
  if (INFO_COMMANDS.has(name)) return '📊 Información';
  return '🎮 Diversión';
}

function normalizeCategory(category) {
  return CATEGORY_ORDER.includes(category) ? category : '📦 Otros';
}

function cleanCategoryLabel(category) {
  return String(category || '')
    .replace(/^[^\p{L}\p{N}]+/u, '')
    .trim() || 'Comandos';
}

function hasRequiredPermissions(member, requiredPermissions) {
  if (!requiredPermissions) return true;
  const list = Array.isArray(requiredPermissions) ? requiredPermissions : [requiredPermissions];
  return member.permissions.has(list);
}

function normalizeAliases(aliases, name) {
  const base = String(name || '').toLowerCase().trim();
  return [...new Set((Array.isArray(aliases) ? aliases : [])
    .map(alias => String(alias || '').toLowerCase().trim())
    .filter(alias => alias && alias !== base))];
}

function getCommandBaseName(command) {
  return String(command?.name || '').replace(/^[-/]/, '').toLowerCase().trim();
}

function isStaffCommand(command) {
  return Boolean(
    command?.adminOnly ||
    command?.staffOnly ||
    command?.hiddenInCmds ||
    command?.requiredPermissions ||
    ['🛡️ Moderación', '📋 Logs'].includes(command?.category) ||
    STAFF_COMMAND_NAMES.has(getCommandBaseName(command))
  );
}

function canViewCommandForUser(member, command) {
  const visibleToUserIds = Array.isArray(command?.visibleToUserIds)
    ? command.visibleToUserIds.map(id => String(id))
    : [];

  if (!visibleToUserIds.length) return true;
  return visibleToUserIds.includes(String(member?.id || ''));
}

function buildCatalog(client, hideEconomy = false, { includeHidden = false } = {}) {
  const commands = [];
  const seenPrefix = new Set();

  for (const prefixCommand of client.prefixCommands.values()) {
    const name = String(prefixCommand?.name || '').toLowerCase();
    if (!name || seenPrefix.has(name)) continue;
    seenPrefix.add(name);

    const help = prefixCommand.help || {};
    if (!includeHidden && help.hiddenInCmds) continue;

    const adminOnly = Boolean(help.adminOnly ?? ADMIN_PREFIX_COMMANDS.has(name));
    const requiredPermissions = help.requiredPermissions || null;
    const category = normalizeCategory(inferCategory(name, help.category, adminOnly, 'prefix'));
    if (hideEconomy && category === '💰 Economía') continue;

    commands.push({
      name: `-${name}`,
      desc: help.purpose || 'Sin descripción',
      aliases: normalizeAliases([...(prefixCommand.aliases || []), ...(help.aliases || [])], name),
      usage: help.usage || help.example || null,
      category,
      staffOnly: adminOnly || Boolean(requiredPermissions),
      requiredPermissions,
      visibleToUserIds: Array.isArray(help.visibleToUserIds) ? help.visibleToUserIds : null,
      source: 'prefix',
    });
  }

  for (const slashCommand of client.commands.values()) {
    const json = slashCommand.data?.toJSON?.();
    if (!json?.name) continue;

    const help = slashCommand.help || {};
    if (!includeHidden && help.hiddenInCmds) continue;

    const adminOnly = Boolean(
      help.adminOnly ?? (json.default_member_permissions === PermissionFlagsBits.Administrator.toString())
    );
    const requiredPermissions = help.requiredPermissions || null;
    const category = normalizeCategory(inferCategory(json.name, help.category, adminOnly, 'slash'));
    if (hideEconomy && category === '💰 Economía') continue;

    commands.push({
      name: `/${json.name}`,
      desc: help.purpose || json.description || 'Sin descripción',
      aliases: normalizeAliases(help.aliases || [], json.name),
      usage: help.usage || help.example || null,
      category,
      staffOnly: adminOnly || Boolean(requiredPermissions),
      requiredPermissions,
      visibleToUserIds: Array.isArray(help.visibleToUserIds) ? help.visibleToUserIds : null,
      source: 'slash',
    });
  }

  if (!hideEconomy) {
    for (const action of listIncomeActions()) {
      commands.push({
        name: `-${action.key}`,
        desc: `${action.label} (cd ${Math.floor(action.cooldownMs / 60000)}m)`,
        aliases: [],
        usage: null,
        category: '💰 Economía',
        staffOnly: false,
        requiredPermissions: null,
        visibleToUserIds: null,
        source: 'virtual',
      });
    }
  }

  return commands
    .sort((a, b) => {
      const cat = a.category.localeCompare(b.category);
      if (cat !== 0) return cat;
      return a.name.localeCompare(b.name);
    })
    .filter((item, index, array) => array.findIndex(x => x.name === item.name) === index);
}

function countBotCommands(client) {
  return buildCatalog(client, false, { includeHidden: true }).length;
}

function estimateDevelopmentHours(totalCommands) {
  const baseHours = 18;
  const perCommandHours = 0.95;
  const reworkCount = Math.max(2, Math.ceil(totalCommands / 6));
  const reworkHours = reworkCount * 0.85;
  const extraComplexity = Math.max(0, totalCommands - 18) * 0.3;
  return Math.max(1, Math.ceil(baseHours + (totalCommands * perCommandHours) + reworkHours + extraComplexity));
}

function normalizeQueryText(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreTextMatch(text, tokens, normalizedQuery) {
  const normalizedText = normalizeQueryText(text);
  if (!normalizedText) return 0;

  let score = 0;
  if (normalizedText === normalizedQuery) score += 12;
  if (normalizedText.startsWith(normalizedQuery)) score += 6;
  if (normalizedText.includes(normalizedQuery)) score += 4;

  for (const token of tokens) {
    if (!token) continue;
    if (normalizedText === token) score += 8;
    else if (normalizedText.startsWith(token)) score += 4;
    else if (normalizedText.includes(token)) score += 2;
  }

  return score;
}

function scoreCommandForQuery(command, query, tokens) {
  const normalizedQuery = normalizeQueryText(query);
  const parts = [
    command.name,
    command.desc,
    command.usage || '',
    ...(command.aliases || []),
    command.category,
  ];

  let score = 0;
  for (const part of parts) {
    score += scoreTextMatch(part, tokens, normalizedQuery);
  }

  const commandBase = normalizeQueryText(command.name.replace(/^[-/]/, ''));
  if (normalizedQuery === commandBase) score += 16;

  return score;
}

function scoreCategoryForQuery(category, catalog, query) {
  const normalizedQuery = normalizeQueryText(query);
  if (!normalizedQuery) return 0;

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  let score = 0;

  for (const keyword of CATEGORY_KEYWORDS[category] || []) {
    score += scoreTextMatch(keyword, tokens, normalizedQuery);
  }

  const topCommands = catalog
    .filter(cmd => cmd.category === category)
    .map(cmd => scoreCommandForQuery(cmd, query, tokens))
    .sort((a, b) => b - a)
    .slice(0, 5);

  score += topCommands.reduce((sum, value) => sum + value, 0);

  return score;
}

function interpretCategoryFromQuery(catalog, query, fallbackCategory) {
  const normalizedQuery = normalizeQueryText(query);
  if (!normalizedQuery) return { category: fallbackCategory, hint: null };

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  const commandScores = catalog.map(cmd => ({
    cmd,
    score: scoreCommandForQuery(cmd, query, tokens),
  }));

  const bestCommand = commandScores.sort((a, b) => b.score - a.score)[0];
  const categoryScores = CATEGORY_ORDER.map(category => ({
    category,
    score: scoreCategoryForQuery(category, catalog, query),
  })).sort((a, b) => b.score - a.score);

  const bestCategory = categoryScores[0];
  const chosenCategory = (bestCategory?.score || 0) >= (bestCommand?.score || 0)
    ? bestCategory?.category || fallbackCategory
    : bestCommand?.cmd?.category || fallbackCategory;

  const hint = bestCategory && bestCategory.score > 0
    ? `Interpreté "${query}" como ${cleanCategoryLabel(chosenCategory)}.`
    : null;

  return {
    category: chosenCategory || fallbackCategory,
    hint,
  };
}

function canMemberSeeCommand(member, command, privileged) {
  if (!canViewCommandForUser(member, command)) return false;
  if (!privileged && isStaffCommand(command)) return false;
  if (!privileged && (command.staffOnly || command.adminOnly || command.hiddenInCmds)) return false;
  if (!command.requiredPermissions) return true;
  return hasRequiredPermissions(member, command.requiredPermissions);
}

function getVisibleCatalog(catalog, member, privileged) {
  return catalog.filter(command => canMemberSeeCommand(member, command, privileged));
}

function getCategoriesForMember(catalog, member, privileged) {
  const categories = new Set();
  for (const command of getVisibleCatalog(catalog, member, privileged)) {
    categories.add(command.category);
  }

  return CATEGORY_ORDER.filter(category => categories.has(category));
}

function getCommandsByCategory(catalog, category, member, privileged) {
  return catalog.filter(cmd => cmd.category === category && canMemberSeeCommand(member, cmd, privileged));
}

function buildCategorySelect(categories, selectedCategory, disabled = false) {
  const options = categories.slice(0, 25).map(category => ({
    label: cleanCategoryLabel(category),
    value: category,
    default: category === selectedCategory,
  }));

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('cmds_category')
      .setPlaceholder('Seleccioná una categoría')
      .setDisabled(disabled)
      .addOptions(options)
  );
}

function buildNavRow(page, totalPages, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cmds_first').setLabel('⏮').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
    new ButtonBuilder().setCustomId('cmds_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page === 0),
    new ButtonBuilder().setCustomId('cmds_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder().setCustomId('cmds_last').setLabel('⏭').setStyle(ButtonStyle.Secondary).setDisabled(disabled || page >= totalPages - 1),
    new ButtonBuilder().setCustomId('cmds_close').setLabel('Cerrar').setStyle(ButtonStyle.Secondary).setDisabled(disabled)
  );
}

function formatUsageBlock(usage) {
  const text = String(usage || '').trim();
  if (!text) return '';

  const parts = text
    .split(/\s+\|\s+/)
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return `\n  ↳ Uso: \`${text}\``;
  }

  return `\n  ↳ Uso:\n${parts.map(part => `  • \`${part}\``).join('\n')}`;
}

function formatCommandLine(cmd, index, { showUsage = true } = {}) {
  const aliasText = cmd.aliases?.length
    ? `\n  ↳ Alias: ${cmd.aliases.map(a => `\`${a}\``).join(', ')}`
    : '';

  const usage = showUsage && cmd.usage ? formatUsageBlock(cmd.usage) : '';
  const staffMark = cmd.staffOnly ? '\n  ↳ Staff' : '';

  return `• ${index + 1}. ${cmd.name} — ${cmd.desc}${aliasText}${usage}${staffMark}`.slice(0, 900);
}

function buildCommandListBlock(commands, { showUsage = true } = {}) {
  if (!commands.length) return '—';
  return commands.map((cmd, index) => formatCommandLine(cmd, index, { showUsage })).join('\n\n');
}

function buildCmdsPayload({ client, guild, category, page, totalPages, pageCommands, totalCategoryCommands, privileged, hideEconomy, closed = false, hint = null }) {
  const totalCommands = countBotCommands(client);
  const totalDevHours = estimateDevelopmentHours(totalCommands);
  const cleanCategory = cleanCategoryLabel(category);

  const header = `# 📚 Comandos · ${cleanCategory}`;
  const intro = privileged
    ? 'Vista para administradores y staff. Los comandos están ordenados por categoría y separados de forma compacta.'
    : 'Vista pública. Se muestran únicamente los comandos disponibles para tu rol.';

  const stats = [
    `**Página:** ${page + 1}/${totalPages}`,
    `**Categoría:** ${totalCategoryCommands} comandos`,
    `**Total bot:** ${totalCommands} comandos`,
    `**Desarrollo Estimado:** ~${totalDevHours}h`,
  ].join('\n');

  const commandsText = pageCommands.length
    ? privileged
      ? [
          '### Comandos públicos',
          buildCommandListBlock(pageCommands.filter(cmd => !cmd.staffOnly), { showUsage: true }),
          pageCommands.some(cmd => cmd.staffOnly)
            ? '\n### Comandos de staff\n' + buildCommandListBlock(pageCommands.filter(cmd => cmd.staffOnly), { showUsage: true })
            : '',
        ].filter(Boolean).join('\n\n')
      : buildCommandListBlock(pageCommands, { showUsage: true })
    : 'No hay comandos para mostrar en esta categoría.';

  const components = [
    {
      type: 17,
      accent_color: null,
      components: [
        { type: 10, content: header },
        { type: 14 },
        { type: 10, content: `${hint ? `${hint}\n\n` : ''}${intro}\n\n${stats}` },
        { type: 14 },
        { type: 10, content: commandsText },
        { type: 10, content: `${closed ? 'Sesión cerrada' : 'Usá el selector para cambiar de categoría y los botones para navegar.'}\n\n> ${hideEconomy ? 'Economía oculta: season cerrada' : 'Lista viva del bot'}\n> Sistema propio. Algunos comandos internos u ocultos no se muestran en la lista.` },
      ],
    },
  ];

  return {
    flags: COMPONENTS_V2_FLAG,
    components,
  };
}

module.exports = {
  name: 'cmds',
  aliases: ['help', 'comandos'],
  help: {
    purpose: 'Muestra los comandos por categoría con selector interactivo.',
    category: '📊 Información',
    aliases: ['help', 'comandos'],
  },
  async execute(message, args = []) {
    const privileged = isPrivilegedMember(message.member, message.guild.id);
    const hideEconomy = isEconomySeasonLocked(message.guild.id);
    const catalog = buildCatalog(message.client, hideEconomy);
    const visibleCatalog = getVisibleCatalog(catalog, message.member, privileged);
    const categories = getCategoriesForMember(catalog, message.member, privileged);
    const query = args.join(' ').trim();
    const normalizedQuery = normalizeQueryText(query);
    if (['sorteo', 'sorteos'].includes(normalizedQuery) && !privileged) {
      return message.reply('❌ Solo el staff puede ver la categoría de sorteos.');
    }

    const interpreted = interpretCategoryFromQuery(visibleCatalog, query, categories[0]);
    const initialCategory = ['sorteo', 'sorteos'].includes(normalizedQuery) && privileged
      ? '🎁 Sorteos'
      : interpreted.category;
    const initialHint = query ? interpreted.hint : null;

    if (!categories.length) {
      return message.reply('No hay comandos disponibles para mostrar.');
    }

    if (initialCategory === '🎁 Sorteos' && !categories.includes('🎁 Sorteos')) {
      categories.unshift('🎁 Sorteos');
    }

    let selectedCategory = categories.includes(initialCategory) ? initialCategory : categories[0];
    let page = 0;

    const getViewState = () => {
      const commandsInCategory = getCommandsByCategory(visibleCatalog, selectedCategory, message.member, privileged);
      const totalPages = Math.max(1, Math.ceil(commandsInCategory.length / PAGE_SIZE));
      if (page >= totalPages) page = totalPages - 1;
      const start = page * PAGE_SIZE;
      const pageCommands = commandsInCategory.slice(start, start + PAGE_SIZE);

      return {
        commandsInCategory,
        totalPages,
        pageCommands,
      };
    };

    const initial = getViewState();
    const initialPayload = buildCmdsPayload({
      client: message.client,
      guild: message.guild,
      category: selectedCategory,
      page,
      totalPages: initial.totalPages,
      pageCommands: initial.pageCommands,
      totalCategoryCommands: initial.commandsInCategory.length,
      privileged,
      hideEconomy,
      hint: initialHint,
    });
    const msg = await message.reply({
      flags: initialPayload.flags,
      components: [
        ...initialPayload.components,
        buildCategorySelect(categories, selectedCategory),
        buildNavRow(page, initial.totalPages),
      ],
    });

    const collector = msg.createMessageComponentCollector({
      filter: interaction => interaction.user.id === message.author.id,
      time: 120_000,
    });

    collector.on('collect', async interaction => {
      if (interaction.customId === 'cmds_close') {
        return collector.stop('closed');
      }

      if (interaction.customId === 'cmds_category') {
        selectedCategory = String(interaction.values?.[0] || selectedCategory);
        page = 0;
      } else if (interaction.customId === 'cmds_first') {
        page = 0;
      } else if (interaction.customId === 'cmds_prev') {
        page = Math.max(0, page - 1);
      } else if (interaction.customId === 'cmds_next') {
        const state = getViewState();
        page = Math.min(state.totalPages - 1, page + 1);
      } else if (interaction.customId === 'cmds_last') {
        const state = getViewState();
        page = Math.max(0, state.totalPages - 1);
      }

      const state = getViewState();
      const updatePayload = buildCmdsPayload({
        client: message.client,
        guild: message.guild,
        category: selectedCategory,
        page,
        totalPages: state.totalPages,
        pageCommands: state.pageCommands,
        totalCategoryCommands: state.commandsInCategory.length,
        privileged,
        hideEconomy,
        hint: query ? interpretCategoryFromQuery(visibleCatalog, query, categories[0]).hint : null,
      });
      await interaction.update({
        flags: updatePayload.flags,
        components: [
          ...updatePayload.components,
          buildCategorySelect(categories, selectedCategory),
          buildNavRow(page, state.totalPages),
        ],
      });
    });

    collector.on('end', async (_, reason) => {
      const state = getViewState();
      const closedPayload = buildCmdsPayload({
        client: message.client,
        guild: message.guild,
        category: selectedCategory,
        page,
        totalPages: state.totalPages,
        pageCommands: state.pageCommands,
        totalCategoryCommands: state.commandsInCategory.length,
        privileged,
        hideEconomy,
        closed: true,
        hint: query ? interpretCategoryFromQuery(visibleCatalog, query, categories[0]).hint : null,
      });
      await msg.edit({
        flags: closedPayload.flags,
        components: [
          ...closedPayload.components,
          buildCategorySelect(categories, selectedCategory, true),
          buildNavRow(page, state.totalPages, true),
        ],
      }).catch(() => {});
    });
  },
};

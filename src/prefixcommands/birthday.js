const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const {
  getBirthdayChannel,
  setBirthdayChannel,
  clearBirthdayChannel,
  setMemberBirthday,
  removeMemberBirthday,
  getGuildBirthdays,
} = require('../utils/birthdayStore');

const MANAGE_SUBCOMMANDS = new Set(['channel', 'canal', 'set', 'remove', 'delete', 'del']);
const LIST_SUBCOMMANDS = new Set(['list', 'status']);

const MONTH_LOOKUP = {
  enero: 1,
  ene: 1,
  febrero: 2,
  feb: 2,
  marzo: 3,
  mar: 3,
  abril: 4,
  abr: 4,
  mayo: 5,
  may: 5,
  junio: 6,
  jun: 6,
  julio: 7,
  jul: 7,
  agosto: 8,
  ago: 8,
  septiembre: 9,
  setiembre: 9,
  sept: 9,
  sep: 9,
  set: 9,
  octubre: 10,
  oct: 10,
  noviembre: 11,
  nov: 11,
  diciembre: 12,
  dic: 12,
};

function createEmbed({ title, description, fields = [], color = 0xE6F0FF, footer } = {}) {
  const embed = new EmbedBuilder().setColor(color);
  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter(footer);
  return embed;
}

function replyEmbed(message, options) {
  return message.reply({ embeds: [createEmbed(options)] });
}

function usageEmbed(guildId) {
  const channelId = getBirthdayChannel(guildId);

  return createEmbed({
    title: '🎂 Cumpleaños',
    description: 'Cada miembro puede registrar su cumpleaños con formato libre. Los administradores o staff pueden seguir configurando el canal y editar cumpleaños de otros.',
    fields: [
      {
        name: 'Formato libre',
        value: [
          '`-birthday 10 de marzo`',
          '`-birthday 10 marzo`',
          '`-birthday hoy`',
          '`-birthday today`',
        ].join('\n'),
      },
      {
        name: 'Comandos de administración',
        value: [
          '`-birthday channel #canal`',
          '`-birthday channel off`',
          '`-birthday set @miembro DD/MM`',
          '`-birthday remove @miembro`',
          '`-birthday list`',
        ].join('\n'),
      },
      {
        name: 'Canal actual',
        value: channelId ? `<#${channelId}>` : 'No configurado',
      },
    ],
    footer: { text: 'El anuncio de cumpleaños usa @ here en texto plano para que funcione siempre.' },
  });
}

function parseMember(message, raw) {
  if (message.mentions.members?.size) return message.mentions.members.first();
  if (!raw) return null;
  const id = String(raw).replace(/[<@!>]/g, '');
  if (!/^\d{17,20}$/.test(id)) return null;
  return message.guild.members.cache.get(id) || null;
}

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isValidMonthDay(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1) return false;

  const maxDay = new Date(2024, month, 0).getDate();
  return day <= maxDay;
}

function parseDateInput(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;

  const normalized = normalizeText(text);
  if (normalized === 'hoy' || normalized === 'today') {
    const now = new Date();
    return { month: now.getMonth() + 1, day: now.getDate() };
  }

  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);
    if (!isValidMonthDay(month, day)) return null;
    return { month, day };
  }

  const slashMatch = text.match(/^(\d{1,2})[\/-](\d{1,2})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]);
    if (!isValidMonthDay(month, day)) return null;
    return { month, day };
  }

  const freeMatch = normalized.match(/^(\d{1,2})(?:\s+de)?\s+([a-z]+)$/i);
  if (freeMatch) {
    const day = Number(freeMatch[1]);
    const month = MONTH_LOOKUP[freeMatch[2]];
    if (!month || !isValidMonthDay(month, day)) return null;
    return { month, day };
  }

  return null;
}

function formatMonthDay(month, day) {
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
}

function canManageBirthdays(message) {
  return message.member.permissions.has(PermissionFlagsBits.Administrator) || isStaff(message.member, message.guild.id);
}

function formatBirthdayEntry(entry) {
  return `• <@${entry.userId}> — ${formatMonthDay(entry.month, entry.day)}`;
}

module.exports = {
  name: 'birthday',
  aliases: ['bd'],
  help: {
    purpose: 'Configura cumpleaños de miembros, permite que cada persona cargue el suyo y envía felicitación con @ here en texto plano.',
    category: '🛡️ Moderación',
    aliases: ['bd'],
    usage: '-birthday 10 de marzo | -birthday 10 marzo | -birthday today | -birthday channel #canal | -birthday set @miembro DD/MM | -birthday list',
    adminOnly: false,
  },
  async execute(message, args) {
    if (!message.guild) return;

    const sub = String(args[0] || '').toLowerCase();

    if (!sub) {
      return message.reply({ embeds: [usageEmbed(message.guild.id)] });
    }

    if (LIST_SUBCOMMANDS.has(sub)) {
      const channelId = getBirthdayChannel(message.guild.id);
      const birthdays = getGuildBirthdays(message.guild.id)
        .slice()
        .sort((a, b) => (a.month - b.month) || (a.day - b.day));

      if (!birthdays.length) {
        return replyEmbed(message, {
          title: '🎂 Cumpleaños',
          description: channelId
            ? `No hay cumpleaños cargados todavía. Canal configurado: <#${channelId}>.`
            : 'No hay cumpleaños cargados ni canal configurado todavía.',
        });
      }

      return replyEmbed(message, {
        title: '🎂 Cumpleaños configurados',
        description: birthdays.slice(0, 25).map(formatBirthdayEntry).join('\n') + (birthdays.length > 25 ? `\n… y ${birthdays.length - 25} más.` : ''),
        fields: channelId ? [{ name: 'Canal', value: `<#${channelId}>` }] : [],
      });
    }

    if (!MANAGE_SUBCOMMANDS.has(sub)) {
      const parsed = parseDateInput(args.join(' '));
      if (!parsed) {
        return replyEmbed(message, {
          title: '❌ Fecha inválida',
          description: 'Usá algo como `-birthday 10 de marzo`, `-birthday 10 marzo` o `-birthday today`.',
        });
      }

      setMemberBirthday(message.guild.id, message.author.id, parsed.month, parsed.day, message.author.id);
      return replyEmbed(message, {
        title: '✅ Cumpleaños guardado',
        description: `Tu cumpleaños quedó registrado como **${formatMonthDay(parsed.month, parsed.day)}**.`,
      });
    }

    if (!canManageBirthdays(message)) {
      return replyEmbed(message, {
        title: '❌ Sin permisos',
        description: 'Solo administradores o staff pueden usar ese subcomando.',
      });
    }

    if (sub === 'channel' || sub === 'canal') {
      const raw = args[1] || '';
      if (raw.toLowerCase() === 'off' || raw.toLowerCase() === 'clear') {
        clearBirthdayChannel(message.guild.id);
        return replyEmbed(message, {
          title: '✅ Canal de cumpleaños desactivado',
          description: 'Las felicitaciones de cumpleaños ya no se enviarán en un canal definido.',
        });
      }

      const mentioned = message.mentions.channels?.first();
      const channelId = mentioned?.id || (/^\d{17,20}$/.test(raw) ? raw : null);
      if (!channelId) {
        return replyEmbed(message, {
          title: '❌ Canal inválido',
          description: 'Debes indicar un canal. Ejemplo: `-birthday channel #cumples`',
        });
      }

      setBirthdayChannel(message.guild.id, channelId);
      return replyEmbed(message, {
        title: '✅ Canal configurado',
        description: `El canal de cumpleaños quedó configurado en <#${channelId}>.`,
      });
    }

    if (sub === 'set') {
      const member = parseMember(message, args[1]);
      const dateText = args.slice(2).join(' ');

      if (!member || !dateText) {
        return replyEmbed(message, {
          title: '❌ Uso incorrecto',
          description: 'Usá `-birthday set @miembro DD/MM`.',
        });
      }

      const parsed = parseDateInput(dateText);
      if (!parsed) {
        return replyEmbed(message, {
          title: '❌ Fecha inválida',
          description: 'Usá formato `DD/MM`, `YYYY-MM-DD` o libre como `10 de marzo`.',
        });
      }

      setMemberBirthday(message.guild.id, member.id, parsed.month, parsed.day, message.author.id);
      return replyEmbed(message, {
        title: '✅ Cumpleaños guardado',
        description: `El cumpleaños de ${member} quedó registrado como **${formatMonthDay(parsed.month, parsed.day)}**.`,
      });
    }

    if (sub === 'remove' || sub === 'delete' || sub === 'del') {
      const member = parseMember(message, args[1]);
      if (!member) {
        return replyEmbed(message, {
          title: '❌ Uso incorrecto',
          description: 'Usá `-birthday remove @miembro`.',
        });
      }

      const removed = removeMemberBirthday(message.guild.id, member.id);
      if (!removed) {
        return replyEmbed(message, {
          title: '❌ Sin registro',
          description: 'Ese miembro no tenía cumpleaños configurado.',
        });
      }

      return replyEmbed(message, {
        title: '✅ Cumpleaños eliminado',
        description: `El cumpleaños de ${member} fue eliminado.`,
      });
    }

    return message.reply({ embeds: [usageEmbed(message.guild.id)] });
  },
};

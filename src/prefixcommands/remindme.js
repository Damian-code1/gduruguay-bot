const { EmbedBuilder } = require('discord.js');
const {
  registerSingleReminder,
  registerRecurringReminder,
  pauseReminder,
  resumeReminder,
  removeReminder,
  clearUserReminders,
  initializeRecurringReminders,
} = require('../utils/remindmeScheduler');
const {
  getReminderById,
  getUserReminders,
  updateReminder,
} = require('../utils/remindmeStore');
const { parseDuration, formatDuration } = require('../utils/timeParser');

function createUsageEmbed() {
  return new EmbedBuilder()
    .setColor('#a855f7')
    .setTitle('⏰ Remindme')
    .setDescription(
      [
        '**Uso principal:**',
        '`-remindme <tiempo> <texto>`',
        '`-remindme every <tiempo> <texto>`',
        '`-remindme since <hora> <tiempo> <texto>`',
        '',
        '**Administración:**',
        '`-remindme status`',
        '`-remindme edit <id> <tiempo|every|since|text> ...`',
        '`-remindme pause <id>`',
        '`-remindme resume <id>`',
        '`-remindme delete <id>`',
        '`-remindme off`',
      ].join('\n')
    );
}

function parseClockTime(raw) {
  const match = String(raw || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  const suffix = match[3] ? match[3].toLowerCase() : null;

  if (minute < 0 || minute > 59 || Number.isNaN(hour)) return null;

  if (suffix === 'am') {
    if (hour === 12) hour = 0;
  } else if (suffix === 'pm') {
    if (hour < 12) hour += 12;
  }

  if (hour < 0 || hour > 23) return null;

  const now = new Date();
  const target = new Date(now);
  target.setSeconds(0, 0);
  target.setHours(hour, minute, 0, 0);

  return target;
}

function formatAbsoluteDate(date) {
  if (!date) return 'sin fecha';
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:F>`;
}

function formatRelativeDate(date) {
  if (!date) return 'desconocido';
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:R>`;
}

function getReminderTime(reminder) {
  if (!reminder) return null;
  return reminder.type === 'recurring' ? reminder.nextRunAt : reminder.triggerAt;
}

function buildReminderLine(reminder) {
  const isRecurring = reminder.type === 'recurring';
  const status = reminder.paused ? 'pausado' : 'activo';
  const when = getReminderTime(reminder);
  const detail = isRecurring
    ? `cada ${formatDuration(reminder.intervalMs)}`
    : `en ${formatDuration(Math.max(0, when ? when - Date.now() : 0))}`;

  return [
    `**ID:** \`${reminder.id}\``,
    `**Estado:** ${status}`,
    `**Tipo:** ${isRecurring ? 'recurrente' : 'único'}`,
    `**Cuándo:** ${when ? `${formatAbsoluteDate(when)} (${formatRelativeDate(when)})` : 'sin programar'}`,
    `**Detalle:** ${detail}`,
    `**Texto:** ${reminder.text}`,
  ].join('\n');
}

async function showStatus(message) {
  const reminders = getUserReminders(message.guild.id, message.author.id)
    .slice()
    .sort((a, b) => (getReminderTime(a) || 0) - (getReminderTime(b) || 0));

  if (!reminders.length) {
    await message.reply('No tienes remindme activos.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor('#a855f7')
    .setTitle('⏰ Tus remindme')
    .setDescription('Usa `-remindme edit <id> ...`, `pause`, `resume` o `delete` para administrarlos.');

  for (const reminder of reminders.slice(0, 10)) {
    embed.addFields({
      name: `${reminder.type === 'recurring' ? '🔁' : '⏱️'} ${reminder.text.slice(0, 40) || 'Remindme'}`,
      value: buildReminderLine(reminder),
    });
  }

  if (reminders.length > 10) {
    embed.setFooter({ text: `Mostrando 10 de ${reminders.length} remindme.` });
  }

  await message.reply({ embeds: [embed] });
}

async function createSingleReminder(message, timeText, reminderText) {
  const durationMs = parseDuration(timeText);
  if (!durationMs) {
    await message.reply('Ese tiempo no es válido. Ejemplo: `10m`, `2h`, `1d 3h`.');
    return;
  }

  const reminder = registerSingleReminder(message.client, {
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    text: reminderText,
    delayMs: durationMs,
  });

  await message.reply(
    `Te lo recordaré ${formatRelativeDate(reminder.triggerAt)} (${formatAbsoluteDate(reminder.triggerAt)}).`
  );
}

async function createRecurringReminder(message, timeText, reminderText) {
  const intervalMs = parseDuration(timeText);
  if (!intervalMs) {
    await message.reply('Ese tiempo no es válido. Ejemplo: `10m`, `2h`, `1d 3h`.');
    return;
  }

  const reminder = registerRecurringReminder(message.client, {
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    text: reminderText,
    intervalMs,
  });

  await message.reply(
    `Recordatorio recurrente creado: ${formatRelativeDate(reminder.nextRunAt)} (${formatAbsoluteDate(reminder.nextRunAt)}), cada ${formatDuration(intervalMs)}.`
  );
}

async function createSinceReminder(message, baseText, durationText, reminderText) {
  const base = parseClockTime(baseText);
  if (!base) {
    await message.reply('La hora base no es válida. Ejemplo: `14:50pm`, `08:30`, `7:15 am`.');
    return;
  }

  const durationMs = parseDuration(durationText);
  if (!durationMs) {
    await message.reply('La duración no es válida. Ejemplo: `10m`, `2h`, `1d 3h`.');
    return;
  }

  const target = new Date(base.getTime() + durationMs);
  if (target.getTime() <= Date.now()) {
    await message.reply('Esa combinación ya quedó en el pasado para hoy. Usa una hora base y duración que den un resultado futuro.');
    return;
  }

  const delayMs = target.getTime() - Date.now();
  const reminder = registerSingleReminder(message.client, {
    guildId: message.guild.id,
    channelId: message.channel.id,
    userId: message.author.id,
    text: reminderText,
    delayMs,
  });

  await message.reply(
    `Te lo recordaré ${formatRelativeDate(reminder.triggerAt)} (${formatAbsoluteDate(reminder.triggerAt)}), contando desde ${baseText}.`
  );
}

async function deleteReminder(message, reminderId) {
  const reminder = getReminderById(reminderId);
  if (!reminder || reminder.guildId !== message.guild.id || reminder.userId !== message.author.id) {
    await message.reply('No encontré ese remindme.');
    return;
  }

  const removed = removeReminder(reminderId);
  if (!removed) {
    await message.reply('No pude borrar ese remindme.');
    return;
  }

  initializeRecurringReminders(message.client);
  await message.reply(`Remindme \`${reminderId}\` eliminado.`);
}

async function pauseUserReminder(message, reminderId) {
  const reminder = getReminderById(reminderId);
  if (!reminder || reminder.guildId !== message.guild.id || reminder.userId !== message.author.id) {
    await message.reply('No encontré ese remindme.');
    return;
  }

  const updated = pauseReminder(reminderId);
  if (!updated) {
    await message.reply('No pude pausar ese remindme.');
    return;
  }

  await message.reply(`Remindme \`${reminderId}\` pausado.`);
}

async function resumeUserReminder(message, reminderId) {
  const reminder = getReminderById(reminderId);
  if (!reminder || reminder.guildId !== message.guild.id || reminder.userId !== message.author.id) {
    await message.reply('No encontré ese remindme.');
    return;
  }

  const updated = resumeReminder(message.client, reminderId);
  if (!updated) {
    await message.reply('No pude reanudar ese remindme.');
    return;
  }

  await message.reply(`Remindme \`${reminderId}\` reanudado.`);
}

async function editReminder(message, reminderId, editArgs) {
  const reminder = getReminderById(reminderId);
  if (!reminder || reminder.guildId !== message.guild.id || reminder.userId !== message.author.id) {
    await message.reply('No encontré ese remindme.');
    return;
  }

  if (!editArgs.length) {
    await message.reply('Faltan datos para editar el remindme.');
    return;
  }

  const mode = editArgs[0].toLowerCase();

  if (mode === 'text') {
    const text = editArgs.slice(1).join(' ').trim();
    if (!text) {
      await message.reply('Debes indicar el nuevo texto.');
      return;
    }

    updateReminder(reminderId, { text });
    initializeRecurringReminders(message.client);
    await message.reply(`Remindme \`${reminderId}\` actualizado.`);
    return;
  }

  if (mode === 'every') {
    const intervalText = editArgs[1];
    const text = editArgs.slice(2).join(' ').trim();
    const intervalMs = parseDuration(intervalText);
    if (!intervalMs) {
      await message.reply('Ese tiempo no es válido.');
      return;
    }
    if (!text) {
      await message.reply('Debes indicar el nuevo texto.');
      return;
    }

    updateReminder(reminderId, {
      type: 'recurring',
      intervalMs,
      nextRunAt: Date.now() + intervalMs,
      text,
      paused: false,
      pausedRemainingMs: null,
    });
    initializeRecurringReminders(message.client);
    await message.reply(`Remindme recurrente \`${reminderId}\` actualizado.`);
    return;
  }

  if (mode === 'since') {
    const baseText = editArgs[1];
    const durationText = editArgs[2];
    const text = editArgs.slice(3).join(' ').trim();
    const base = parseClockTime(baseText);
    const durationMs = parseDuration(durationText);

    if (!base) {
      await message.reply('La hora base no es válida.');
      return;
    }
    if (!durationMs) {
      await message.reply('La duración no es válida.');
      return;
    }
    if (!text) {
      await message.reply('Debes indicar el nuevo texto.');
      return;
    }

    const target = new Date(base.getTime() + durationMs);
    if (target.getTime() <= Date.now()) {
      await message.reply('Esa combinación ya quedó en el pasado para hoy. Usa una hora base y duración que den un resultado futuro.');
      return;
    }

    updateReminder(reminderId, {
      type: 'single',
      triggerAt: target.getTime(),
      text,
      paused: false,
      pausedRemainingMs: null,
    });
    initializeRecurringReminders(message.client);
    await message.reply(`Remindme \`${reminderId}\` actualizado.`);
    return;
  }

  const timeText = editArgs[0];
  const text = editArgs.slice(1).join(' ').trim();
  const durationMs = parseDuration(timeText);

  if (!durationMs) {
    await message.reply('Ese tiempo no es válido.');
    return;
  }
  if (!text) {
    await message.reply('Debes indicar el nuevo texto.');
    return;
  }

  if (reminder.type === 'recurring') {
    updateReminder(reminderId, {
      intervalMs: durationMs,
      nextRunAt: Date.now() + durationMs,
      text,
      paused: false,
      pausedRemainingMs: null,
    });
  } else {
    updateReminder(reminderId, {
      type: 'single',
      triggerAt: Date.now() + durationMs,
      text,
      paused: false,
      pausedRemainingMs: null,
    });
  }

  initializeRecurringReminders(message.client);
  await message.reply(`Remindme \`${reminderId}\` actualizado.`);
}

module.exports = {
  name: 'remindme',
  help: {
    purpose: 'Crear y administrar recordatorios (incluye recurrentes).',
    usage: '-remindme <tiempo> <texto> | -remindme every <tiempo> <texto> | -remindme status|edit|pause|resume|delete|off',
    category: '📊 Información',
  },
  async execute(message, args) {
    if (!message.guild) return;

    const subCommand = (args[0] || '').toLowerCase();

    if (!subCommand) {
      await message.reply({ embeds: [createUsageEmbed()] });
      return;
    }

    if (subCommand === 'status') {
      await showStatus(message);
      return;
    }

    if (subCommand === 'off') {
      const removed = clearUserReminders(message.guild.id, message.author.id);
      initializeRecurringReminders(message.client);
      if (!removed) {
        await message.reply('No tienes ningun recordatorio activo.');
        return;
      }
      await message.reply(`Se eliminaron ${removed} remindme tuyos.`);
      return;
    }

    if (subCommand === 'delete' || subCommand === 'remove') {
      await deleteReminder(message, args[1]);
      return;
    }

    if (subCommand === 'pause') {
      await pauseUserReminder(message, args[1]);
      return;
    }

    if (subCommand === 'resume') {
      await resumeUserReminder(message, args[1]);
      return;
    }

    if (subCommand === 'edit') {
      await editReminder(message, args[1], args.slice(2));
      return;
    }

    if (subCommand === 'every') {
      if (args.length < 3) {
        await message.reply({ embeds: [createUsageEmbed()] });
        return;
      }
      const timeText = args[1];
      const reminderText = args.slice(2).join(' ').trim();
      if (!reminderText) {
        await message.reply({ embeds: [createUsageEmbed()] });
        return;
      }
      await createRecurringReminder(message, timeText, reminderText);
      return;
    }

    if (subCommand === 'since') {
      if (args.length < 4) {
        await message.reply({ embeds: [createUsageEmbed()] });
        return;
      }
      const baseText = args[1];
      const durationText = args[2];
      const reminderText = args.slice(3).join(' ').trim();
      if (!reminderText) {
        await message.reply({ embeds: [createUsageEmbed()] });
        return;
      }
      await createSinceReminder(message, baseText, durationText, reminderText);
      return;
    }

    if (args.length < 2) {
      await message.reply({ embeds: [createUsageEmbed()] });
      return;
    }

    const timeText = args[0];
    const reminderText = args.slice(1).join(' ').trim();
    if (!reminderText) {
      await message.reply({ embeds: [createUsageEmbed()] });
      return;
    }

    await createSingleReminder(message, timeText, reminderText);
  },
};

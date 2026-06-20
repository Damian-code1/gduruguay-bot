const {
  getReminders,
  addReminder,
  updateReminder,
  removeReminder,
  clearRemindersForUser,
  clearAllReminders,
} = require('./remindmeStore');

const activeTimers = new Map();
const REMINDER_MESSAGE_TTL_MS = 2 * 60 * 60 * 1000;

async function hasRepliesToMessage(channel, messageId) {
  if (!channel?.messages?.fetch) return false;

  const recentMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
  if (!recentMessages?.size) return false;

  return recentMessages.some((msg) => msg.reference?.messageId === messageId);
}

function scheduleReminderMessageCleanup(channel, sentMessage) {
  const timeout = setTimeout(async () => {
    const stillExists = await channel.messages.fetch(sentMessage.id).catch(() => null);
    if (!stillExists) return;

    const hasReplies = await hasRepliesToMessage(channel, sentMessage.id);
    if (hasReplies) return;

    await stillExists.delete().catch(() => null);
  }, REMINDER_MESSAGE_TTL_MS);

  if (typeof timeout.unref === 'function') {
    timeout.unref();
  }
}

function buildReminderContent(reminder, mention = null) {
  const title = reminder.type === 'recurring' ? '🔁 Recordatorio recurrente' : '⏰ Recordatorio';
  const prefix = mention ? `${mention} ` : '';
  return `${prefix}**${title}**\n> **${String(reminder.text || '').trim()}**`;
}

async function sendReminder(client, reminder) {
  const guild = await client.guilds.fetch(reminder.guildId).catch(() => null);
  if (!guild) return false;

  const channel = await guild.channels.fetch(reminder.channelId).catch(() => null);
  const content = buildReminderContent(reminder, `<@${reminder.userId}>`);
  let sentMessage = null;

  if (channel?.isTextBased?.()) {
    sentMessage = await channel.send({
      content,
      allowedMentions: { users: [reminder.userId] },
    }).catch(() => null);
  }

  if (!sentMessage) {
    const user = await client.users.fetch(reminder.userId).catch(() => null);
    if (user) {
      sentMessage = await user.send({ content: buildReminderContent(reminder) }).catch(() => null);
    }
  }

  if (sentMessage && channel?.isTextBased?.()) {
    scheduleReminderMessageCleanup(channel, sentMessage);
  }

  return Boolean(sentMessage);
}

function clearTimer(reminderId) {
  const existing = activeTimers.get(reminderId);
  if (existing) clearTimeout(existing);
  activeTimers.delete(reminderId);
}

function scheduleReminder(client, reminder) {
  clearTimer(reminder.id);

  if (!reminder.active) return;

  const targetAt = reminder.type === 'recurring'
    ? (reminder.nextRunAt || (Date.now() + reminder.intervalMs))
    : reminder.triggerAt;

  if (!targetAt) return;

  const delay = Math.max(1000, targetAt - Date.now());
  const timeout = setTimeout(async () => {
    clearTimer(reminder.id);

    const current = getReminders().find(r => r.id === reminder.id && r.active);
    if (!current) return;

    const delivered = await sendReminder(client, current);

    if (current.type === 'recurring') {
      if (!delivered) {
        const retry = updateReminder(current.id, {
          nextRunAt: Date.now() + 60_000,
        });

        if (retry?.active) {
          scheduleReminder(client, retry);
        }

        return;
      }

      const updated = updateReminder(current.id, (r) => {
        let nextRunAt = (r.nextRunAt || Date.now()) + r.intervalMs;
        if (nextRunAt <= Date.now()) {
          const missed = Math.floor((Date.now() - nextRunAt) / r.intervalMs) + 1;
          nextRunAt += missed * r.intervalMs;
        }

        return {
          nextRunAt,
        };
      });

      if (updated?.active) {
        scheduleReminder(client, updated);
      }
    } else {
      if (delivered) {
        removeReminder(current.id);
      } else {
        const retry = updateReminder(current.id, {
          triggerAt: Date.now() + 60_000,
        });

        if (retry?.active) {
          scheduleReminder(client, retry);
        }
      }
    }
  }, delay);

  activeTimers.set(reminder.id, timeout);
}

function initializeRecurringReminders(client) {
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();

  for (const reminder of getReminders()) {
    if (!reminder.active) continue;
    if (!reminder.id || !reminder.guildId || !reminder.channelId || !reminder.userId || !reminder.text) continue;
    if (reminder.type === 'recurring' && !reminder.intervalMs) continue;
    if (reminder.type === 'single' && !reminder.triggerAt) continue;

    if (reminder.type === 'recurring' && !reminder.nextRunAt) {
      updateReminder(reminder.id, { nextRunAt: Date.now() + reminder.intervalMs });
      reminder.nextRunAt = Date.now() + reminder.intervalMs;
    }

    scheduleReminder(client, reminder);
  }
}

function registerSingleReminder(client, reminderData) {
  const reminder = addReminder({
    ...reminderData,
    type: 'single',
    triggerAt: Date.now() + reminderData.delayMs,
  });
  scheduleReminder(client, reminder);
  return reminder;
}

function registerRecurringReminder(client, reminderData) {
  const reminder = addReminder({
    ...reminderData,
    type: 'recurring',
    nextRunAt: Date.now() + reminderData.intervalMs,
  });
  scheduleReminder(client, reminder);
  return reminder;
}

function pauseReminder(reminderId) {
  const current = getReminders().find(r => r.id === reminderId && r.active);
  if (!current) return null;

  let pausedRemainingMs = null;
  if (current.type === 'single') {
    pausedRemainingMs = Math.max(1000, (current.triggerAt || Date.now()) - Date.now());
  } else {
    pausedRemainingMs = Math.max(1000, (current.nextRunAt || Date.now()) - Date.now());
  }

  clearTimer(reminderId);
  return updateReminder(reminderId, {
    active: false,
    pausedRemainingMs,
  });
}

function resumeReminder(client, reminderId) {
  const current = getReminders().find(r => r.id === reminderId && !r.active);
  if (!current) return null;

  const nextData = { active: true };
  if (current.type === 'single') {
    nextData.triggerAt = Date.now() + (current.pausedRemainingMs || 1000);
  } else {
    nextData.nextRunAt = Date.now() + (current.pausedRemainingMs || current.intervalMs || 1000);
  }

  const updated = updateReminder(reminderId, nextData);
  if (updated) scheduleReminder(client, updated);
  return updated;
}

function removeReminderFromScheduler(reminderId) {
  clearTimer(reminderId);
  return removeReminder(reminderId);
}

function clearAllRecurringReminders() {
  const count = clearAllReminders();
  for (const timer of activeTimers.values()) {
    clearTimeout(timer);
  }
  activeTimers.clear();
  return count;
}

function clearUserReminders(guildId, userId) {
  const count = clearRemindersForUser(guildId, userId);
  for (const reminder of getReminders()) {
    if (reminder.guildId === guildId && reminder.userId === userId) {
      clearTimer(reminder.id);
    }
  }
  return count;
}

module.exports = {
  initializeRecurringReminders,
  registerSingleReminder,
  registerRecurringReminder,
  pauseReminder,
  resumeReminder,
  removeReminder: removeReminderFromScheduler,
  clearAllRecurringReminders,
  clearUserReminders,
};

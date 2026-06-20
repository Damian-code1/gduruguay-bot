const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const storePath = path.join(__dirname, '../remindme-reminders.json');

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ reminders: [] }, null, 2));
  }
}

function normalizeReminder(reminder) {
  return {
    id: reminder.id || randomUUID(),
    guildId: reminder.guildId,
    channelId: reminder.channelId,
    userId: reminder.userId,
    text: reminder.text || '',
    type: reminder.type || 'single',
    active: reminder.active ?? true,
    createdAt: reminder.createdAt || Date.now(),
    updatedAt: reminder.updatedAt || Date.now(),
    triggerAt: reminder.triggerAt || null,
    intervalMs: reminder.intervalMs || null,
    nextRunAt: reminder.nextRunAt || null,
    pausedRemainingMs: reminder.pausedRemainingMs || null,
  };
}

function migrateData(data) {
  if (Array.isArray(data.reminders)) {
    data.reminders = data.reminders.map(normalizeReminder);
    return data;
  }

  if (Array.isArray(data.recurring)) {
    data.reminders = data.recurring.map(r => normalizeReminder({
      ...r,
      type: 'recurring',
      triggerAt: null,
      nextRunAt: r.nextRunAt || Date.now() + (r.intervalMs || 0),
    }));
    delete data.recurring;
    return data;
  }

  data.reminders = [];
  return data;
}

function readData() {
  ensureFile();
  const raw = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  const migrated = migrateData(raw);
  if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
    fs.writeFileSync(storePath, JSON.stringify(migrated, null, 2));
  }
  return migrated;
}

function writeData(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function getReminders() {
  const data = readData();
  return Array.isArray(data.reminders) ? data.reminders : [];
}

function getUserReminders(guildId, userId) {
  return getReminders().filter(r => r.guildId === guildId && r.userId === userId);
}

function getReminderById(reminderId) {
  return getReminders().find(r => r.id === reminderId) || null;
}

function addReminder(payload) {
  const data = readData();
  if (!Array.isArray(data.reminders)) data.reminders = [];

  const reminder = normalizeReminder({
    id: randomUUID(),
    active: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...payload,
  });

  data.reminders.push(reminder);
  writeData(data);
  return reminder;
}

function updateReminder(reminderId, updater) {
  const data = readData();
  const index = data.reminders.findIndex(r => r.id === reminderId);
  if (index === -1) return null;

  const current = data.reminders[index];
  const next = typeof updater === 'function' ? updater(current) : updater;
  data.reminders[index] = normalizeReminder({
    ...current,
    ...next,
    updatedAt: Date.now(),
  });

  writeData(data);
  return data.reminders[index];
}

function removeReminder(reminderId) {
  const data = readData();
  const before = data.reminders.length;
  data.reminders = data.reminders.filter(r => r.id !== reminderId);
  writeData(data);
  return before !== data.reminders.length;
}

function clearRemindersForUser(guildId, userId) {
  const data = readData();
  const before = data.reminders.length;
  data.reminders = data.reminders.filter(r => !(r.guildId === guildId && r.userId === userId));
  writeData(data);
  return before - data.reminders.length;
}

function clearAllReminders() {
  const data = readData();
  const count = data.reminders.length;
  data.reminders = [];
  writeData(data);
  return count;
}

module.exports = {
  getReminders,
  getUserReminders,
  getReminderById,
  addReminder,
  updateReminder,
  removeReminder,
  clearRemindersForUser,
  clearAllReminders,
};

const fs = require('fs');
const path = require('path');

const storePath = path.join(__dirname, '../birthdays.json');

function ensureFile() {
  if (!fs.existsSync(storePath)) {
    fs.writeFileSync(storePath, JSON.stringify({ guilds: {} }, null, 2));
  }
}

function readData() {
  ensureFile();
  const raw = fs.readFileSync(storePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed.guilds || typeof parsed.guilds !== 'object') {
    parsed.guilds = {};
  }
  return parsed;
}

function writeData(data) {
  fs.writeFileSync(storePath, JSON.stringify(data, null, 2));
}

function ensureGuild(data, guildId) {
  if (!data.guilds[guildId]) {
    data.guilds[guildId] = {
      channelId: null,
      birthdays: {},
    };
  }

  if (!data.guilds[guildId].birthdays || typeof data.guilds[guildId].birthdays !== 'object') {
    data.guilds[guildId].birthdays = {};
  }

  return data.guilds[guildId];
}

function getBirthdayChannel(guildId) {
  const data = readData();
  const guild = data.guilds[guildId];
  return guild?.channelId || null;
}

function setBirthdayChannel(guildId, channelId) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  guild.channelId = channelId;
  writeData(data);
  return guild.channelId;
}

function clearBirthdayChannel(guildId) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  guild.channelId = null;
  writeData(data);
}

function setMemberBirthday(guildId, userId, month, day, setBy) {
  const data = readData();
  const guild = ensureGuild(data, guildId);

  guild.birthdays[userId] = {
    month,
    day,
    setBy: setBy || null,
    updatedAt: Date.now(),
    lastAnnouncedOn: guild.birthdays[userId]?.lastAnnouncedOn || null,
  };

  writeData(data);
  return guild.birthdays[userId];
}

function removeMemberBirthday(guildId, userId) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  const existed = Boolean(guild.birthdays[userId]);
  delete guild.birthdays[userId];
  writeData(data);
  return existed;
}

function getGuildBirthdays(guildId) {
  const data = readData();
  const guild = ensureGuild(data, guildId);

  return Object.entries(guild.birthdays).map(([userId, birthday]) => ({
    userId,
    month: Number(birthday.month),
    day: Number(birthday.day),
    setBy: birthday.setBy || null,
    updatedAt: birthday.updatedAt || null,
    lastAnnouncedOn: birthday.lastAnnouncedOn || null,
  }));
}

function markBirthdayAnnounced(guildId, userId, dateKey) {
  const data = readData();
  const guild = ensureGuild(data, guildId);
  const current = guild.birthdays[userId];
  if (!current) return null;

  guild.birthdays[userId] = {
    ...current,
    lastAnnouncedOn: dateKey,
    updatedAt: Date.now(),
  };

  writeData(data);
  return guild.birthdays[userId];
}

module.exports = {
  getBirthdayChannel,
  setBirthdayChannel,
  clearBirthdayChannel,
  setMemberBirthday,
  removeMemberBirthday,
  getGuildBirthdays,
  markBirthdayAnnounced,
};

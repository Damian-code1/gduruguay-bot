const {
  getBirthdayChannel,
  getGuildBirthdays,
  markBirthdayAnnounced,
} = require('./birthdayStore');

let scheduler = null;
const TICK_MS = 60_000;

function dateKeyFromNow() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isBirthdayToday(birthday, now) {
  if (!birthday) return false;
  return Number(birthday.month) === now.getMonth() + 1 && Number(birthday.day) === now.getDate();
}

async function runBirthdayTick(client) {
  const now = new Date();
  const todayKey = dateKeyFromNow();

  for (const guild of client.guilds.cache.values()) {
    const channelId = getBirthdayChannel(guild.id);
    if (!channelId) continue;

    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) continue;

    const birthdays = getGuildBirthdays(guild.id);
    const todayBirthdays = birthdays.filter(entry => isBirthdayToday(entry, now));
    if (!todayBirthdays.length) continue;

    for (const birthday of todayBirthdays) {
      if (birthday.lastAnnouncedOn === todayKey) continue;

      const sent = await channel.send({
        content: `@here 🎉 Hoy es el cumpleaños de <@${birthday.userId}> ¡vayan a felicitar!`,
        allowedMentions: {
          parse: ['everyone', 'users'],
          users: [birthday.userId],
        },
      }).catch(() => null);

      if (sent) {
        markBirthdayAnnounced(guild.id, birthday.userId, todayKey);
      }
    }
  }
}

function startBirthdayScheduler(client) {
  if (scheduler) {
    clearInterval(scheduler);
    scheduler = null;
  }

  runBirthdayTick(client).catch(error => {
    console.error('Error en birthday tick inicial:', error);
  });

  scheduler = setInterval(() => {
    runBirthdayTick(client).catch(error => {
      console.error('Error en birthday tick:', error);
    });
  }, TICK_MS);
}

module.exports = {
  startBirthdayScheduler,
};

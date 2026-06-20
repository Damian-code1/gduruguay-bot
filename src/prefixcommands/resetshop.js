const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { getRolePrices } = require('../utils/economyStore');

const OWNER_ID = '1407737422732853331';

const SHOP_PATH = path.join(__dirname, '../economy-shop.json');
const PASSIVE_PATH = path.join(__dirname, '../passive-income.json');

function readJson(filePath, fallback = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2));
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function clearGuildShopData(guildId) {
  const all = readJson(SHOP_PATH, {});
  const guildData = all[guildId];
  const shopRoleIds = Object.keys(guildData?.roles || {});

  if (all[guildId]) {
    delete all[guildId];
    writeJson(SHOP_PATH, all);
  }

  return shopRoleIds;
}

function removePassiveRewardsForRoles(guildId, roleIds) {
  if (!roleIds.length) return 0;

  const all = readJson(PASSIVE_PATH, {});
  const guildData = all[guildId];
  if (!guildData?.roleRewards) return 0;

  let removed = 0;
  for (const roleId of roleIds) {
    if (guildData.roleRewards[roleId] !== undefined) {
      delete guildData.roleRewards[roleId];
      removed += 1;
    }
  }

  all[guildId] = guildData;
  writeJson(PASSIVE_PATH, all);
  return removed;
}

async function deleteShopRoles(guild, roleIds) {
  const result = { deleted: 0, skipped: 0, failed: 0 };

  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      result.skipped += 1;
      continue;
    }

    if (role.managed || role.id === guild.id || !role.deletable) {
      result.skipped += 1;
      continue;
    }

    try {
      await role.delete(`Reset shop solicitado por ${guild.members.me?.user.tag || 'el bot'}`);
      result.deleted += 1;
    } catch (error) {
      result.failed += 1;
      console.error('Error borrando rol de shop:', error);
    }
  }

  return result;
}

module.exports = {
  name: 'resetshop',
  help: {
    purpose: 'Borra todos los roles de la shop, elimina los roles del servidor y limpia la shop del servidor.',
    category: '🛡️ Moderación',
    adminOnly: true,
  },
  async execute(message) {
    if (message.author.id !== OWNER_ID) {
      return message.reply('❌ Solo el dueño del bot puede usar este comando.');
    }

    if (!message.guild) {
      return message.reply('❌ Este comando solo se puede usar en un servidor.');
    }

    const guildId = message.guild.id;
    const shopEntries = getRolePrices(guildId);

    if (!shopEntries.length) {
      return message.reply('📭 No hay roles configurados en la shop para borrar.');
    }

    const progress = await message.reply({
      embeds: [
        new EmbedBuilder()
          .setTitle('🧹 Reseteando shop...')
          .setColor(0xF1C40F)
          .setDescription(`Encontré **${shopEntries.length}** rol(es) en la shop. Voy a borrarlos ahora.`)
          .setTimestamp(),
      ],
    });

    const roleIds = clearGuildShopData(guildId);
    const deletedRoles = await deleteShopRoles(message.guild, roleIds);
    const removedPassiveRewards = removePassiveRewardsForRoles(guildId, roleIds);

    return progress.edit({
      embeds: [
        new EmbedBuilder()
          .setTitle('🗑️ Shop reseteada')
          .setColor(0xED4245)
          .setDescription([
            `Roles en shop encontrados: **${shopEntries.length}**`,
            `Roles eliminados: **${deletedRoles.deleted}**`,
            `Roles omitidos: **${deletedRoles.skipped}**`,
            `Errores al borrar: **${deletedRoles.failed}**`,
            `Bonos pasivos removidos: **${removedPassiveRewards}**`,
            'La shop del servidor quedó vacía.',
          ].join('\n'))
          .setTimestamp(),
      ],
    }).catch(() => null);
  },
};
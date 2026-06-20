const { EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { LOAN_RULES } = require('../utils/loanStore');

const NORMAL_COMMANDS = [
  { title: '📊 Consultar', cmds: '`-balance [@user]` | `-bal`\n`-top [n]` con botones\n`-cooldowns` | `-cds`' },
  { title: '🏦 Banco', cmds: '`-deposit <monto|all|half>` | `-dep`\n`-withdraw <monto|all|half>` | `-wd`' },
  { title: '💵 Ingresos', cmds: '`-daily` | `-d`\n`-work` | `-w`\n`-list`\n`-income all` | `-workall`\n✨ *Aplica bonus % de roles shop*' },
  { title: '💸 Transferencias', cmds: '`-pay @user|userId <monto|all|half>`' },
  { title: '🎲 Apuestas', cmds: '`-coinflip <cara|cruz> <monto|all|half>`\n`-bet list`\n`-bet rps <monto> <piedra|papel|tijeras>`\n`-bet bj <monto>` (blackjack interactivo)\n`-duelo @usuario <monto|all|half>`\n`-rob @usuario`\n`-forcerob @usuario`\n`-pollito help`' },
    { title: '🎲 Apuestas', cmds: '`-coinflip <cara|cruz> <monto|all|half>`\n`-bet list`\n`-bet rps <monto>`\n`-bet bj <monto>` (blackjack interactivo)\n`-duelo @usuario|userId <monto|all|half>`\n`-rob @usuario|userId`\n`-forcerob @usuario|userId`\n`-pollito fight @usuario|userId [apuesta]`' },
    { title: '💳 Préstamos', cmds: '`-prestamo estado`\n`-prestamo pedir <monto>` *(' + LOAN_RULES.MIN_PRINCIPAL + ' min, ' + LOAN_RULES.MAX_PRINCIPAL + ' max, 3d cd)*\n`-prestamo pagar <monto|all|half>`\n`-prestamo help`' },
  { title: '🛍️ Tienda', cmds: '`-shop`\n`-shop buy <numero|@rol|rolId|nombre>`' },
  { title: '📈 Pasivos', cmds: '`-passive status`' },
];

const STAFF_COMMANDS = [
  { title: '⚙️ Configuración', cmds: '`-setcurrency <emoji>`' },
  { title: '🎁 Tienda (Precios)', cmds: '`-roleprice set <@rol|rolId|nombre> <precio>`\n`-roleprice edit`\n`-roleprice replace`\n`-roleprice list`\n`-roleprice remove`' },
  { title: '🏆 Tienda (Bonus +%)', cmds: '`-roleprice bonus set <@rol|rolId|nombre> <%>`\n`-roleprice bonus edit`\n`-roleprice bonus remove`\n`-roleprice bonus list`' },
  { title: '📅 Pasivos (Config)', cmds: '`-passive interval <tiempo>`\n`-passive role set|edit|remove|list`' },
  { title: '💰 Préstamos', cmds: '`-prestamo help` (ver activos)\n`-prestamo remove @user`' },
  { title: '✅ GrantCoins', cmds: '`-grantcoins @user|userId <monto>` | `-gc`\n`-gclog [página]`' },
  { title: '❌ RemoveCoins', cmds: '`-removecoins @user|userId <monto>` | `-rc`\n`-rclog [página]`' },
  { title: '🧹 DataReset', cmds: '`-datareset @user confirm`\nBorra toda la economía del usuario' },
  { title: '🧪 Testing', cmds: '`-testcoins <monto|@staff>`\n`-testcoins reset`' },
];

function buildEmbed(title, color, commands, page = 0) {
  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
  const start = page * pageSize;
  const pageItems = commands.slice(start, start + pageSize);

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setDescription(`Página **${page + 1}**/**${totalPages}**`)
    .setTimestamp();

  for (const item of pageItems) {
    embed.addFields({
      name: item.title,
      value: item.cmds,
      inline: false,
    });
  }

  return { embed, totalPages };
}

module.exports = {
  name: 'economy',
  aliases: ['eco'],
  help: {
    purpose: 'Muestra los comandos de economía por categoría.',
    category: '💰 Economía',
  },
  async execute(message) {
    try {
      const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
      const isStaffMember = isStaff(message.member, message.guild.id);
      const canManage = isAdmin || isStaffMember;

      // Si no es staff, mostrar embed simplificado
      if (!canManage) {
        const embed = new EmbedBuilder()
          .setTitle('💰 Economía - Comandos Disponibles')
          .setColor(0x5865F2)
          .setTimestamp();

        for (const item of NORMAL_COMMANDS) {
          embed.addFields({
            name: item.title,
            value: item.cmds,
            inline: false,
          });
        }

        return message.reply({ embeds: [embed] });
      }

      // Para staff, mostrar versión interactiva
      let currentCategory = 'normal';
      let currentPage = 0;

      const buildSelector = () => {
        const options = [
          { label: 'Públicos', value: 'normal', emoji: '👥' },
          { label: 'Staff/Admin', value: 'staff', emoji: '🛡️' },
        ];
        return new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('eco_select_cat')
            .setPlaceholder('Elige categoría')
            .addOptions(options)
        );
      };

      const buildNavigation = (totalPages) => {
        return new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('eco_page_prev')
            .setLabel('◀')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage === 0),
          new ButtonBuilder()
            .setCustomId('eco_page_next')
            .setLabel('▶')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(currentPage >= totalPages - 1),
          new ButtonBuilder()
            .setCustomId('eco_close_menu')
            .setLabel('Cerrar')
            .setStyle(ButtonStyle.Danger)
        );
      };

      const getCommands = () => currentCategory === 'normal' ? NORMAL_COMMANDS : STAFF_COMMANDS;
      const getColor = () => currentCategory === 'normal' ? 0x5865F2 : 0xF1C40F;
      const getTitle = () => currentCategory === 'normal' ? '💰 Economía - Públicos' : '🛡️ Economía - Staff/Admin';

      const commands = getCommands();
      const { embed, totalPages } = buildEmbed(getTitle(), getColor(), commands, currentPage);

      const msg = await message.reply({
        embeds: [embed],
        components: [buildSelector(), buildNavigation(totalPages)],
      });

      const collector = msg.createMessageComponentCollector({
        filter: i => i.user.id === message.author.id,
        time: 120000,
      });

      collector.on('collect', async interaction => {
        try {
          await interaction.deferUpdate().catch(() => {});

          if (interaction.customId === 'eco_select_cat') {
            currentCategory = interaction.values[0];
            currentPage = 0;
          } else if (interaction.customId === 'eco_page_prev' && currentPage > 0) {
            currentPage--;
          } else if (interaction.customId === 'eco_page_next') {
            const commands = getCommands();
            const pageSize = 4;
            const totalPages = Math.max(1, Math.ceil(commands.length / pageSize));
            if (currentPage < totalPages - 1) currentPage++;
          } else if (interaction.customId === 'eco_close_menu') {
            collector.stop();
            await msg.edit({ components: [] }).catch(() => {});
            return;
          }

          const commands = getCommands();
          const { embed: newEmbed, totalPages: newTotal } = buildEmbed(getTitle(), getColor(), commands, currentPage);

          await msg.edit({
            embeds: [newEmbed],
            components: [buildSelector(), buildNavigation(newTotal)],
          }).catch(() => {});
        } catch (err) {
          console.error('Economy interaction error:', err);
        }
      });

      collector.on('end', () => {
        msg.edit({ components: [] }).catch(() => {});
      });
    } catch (error) {
      console.error('Economy command error:', error);
      await message.reply('❌ Error al ejecutar el comando.').catch(() => {});
    }
  },
};

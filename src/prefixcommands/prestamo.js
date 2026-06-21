const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isStaff } = require('../utils/staffRolesStore');
const { resolveMemberTarget } = require('../utils/resolveMemberTarget');
const {
  getGuildConfig,
  addToWallet,
  getUserBalance,
  withdrawFromBank,
  removeFromWallet,
  getRemainingCooldown,
  setCooldown,
} = require('../utils/economyStore');
const { formatCurrency, parseAmountInput, cooldownText } = require('../utils/economyHelpers');
const {
  LOAN_RULES,
  getLoanProfile,
  getGuildActiveLoans,
  requestLargeLoan,
  applyLoanRepayment,
  clearUserLoan,
  processOverdueLoan,
} = require('../utils/loanStore');

const LOAN_DEFAULT_PRINCIPAL = LOAN_RULES.DEFAULT_PRINCIPAL;
const LOAN_MIN_PRINCIPAL = LOAN_RULES.MIN_PRINCIPAL;
const LOAN_MAX_PRINCIPAL = LOAN_RULES.MAX_PRINCIPAL;
const LOAN_INTEREST_PERCENT = LOAN_RULES.INTEREST_PERCENT;
const LOAN_TERM_DAYS = LOAN_RULES.TERM_DAYS;
const LOAN_REQUEST_COOLDOWN_MS = LOAN_RULES.REQUEST_COOLDOWN_MS;

function formatDueDate(timestamp) {
  if (!timestamp) return 'N/D';
  return `<t:${Math.floor(timestamp / 1000)}:F>`;
}

async function debitFromCombinedBalance(guildId, userId, requestedAmount) {
  const balance = await getUserBalance(guildId, userId);
  const amount = Math.max(0, Math.floor(requestedAmount || 0));
  if (amount <= 0 || balance.total <= 0) return 0;

  const payable = Math.min(amount, balance.total);
  const fromWallet = Math.min(balance.wallet, payable);
  const fromBank = Math.max(0, payable - fromWallet);

  if (fromWallet > 0) {
    await removeFromWallet(guildId, userId, fromWallet);
  }

  if (fromBank > 0) {
    const moved = await withdrawFromBank(guildId, userId, fromBank);
    if (moved > 0) {
      await removeFromWallet(guildId, userId, moved);
    }
  }

  return fromWallet + fromBank;
}

function parseLoanAmount(raw) {
  const clean = String(raw || '').trim().replace(/[,_\.\s]/g, '');
  if (!/^\d+$/.test(clean)) return null;
  const value = Number(clean);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.floor(value);
}

module.exports = {
  name: 'prestamo',
  aliases: ['loan'],
  help: {
    purpose: 'Sistema de préstamos grandes del banco con vencimiento y castigo por mora.',
    category: '💰 Economía',
  },
  async execute(message, args) {
    const guildId = message.guild.id;
    const userId = message.author.id;
    const config = await getGuildConfig(guildId);
    const sub = String(args[0] || 'estado').toLowerCase();
    const canManage = message.member?.permissions?.has(PermissionFlagsBits.Administrator) || isStaff(message.member, guildId);

    const penalty = await processOverdueLoan(guildId, userId);

    if (sub === 'help' || sub === 'ayuda' || sub === '?') {
      const activeLoans = await getGuildActiveLoans(guildId);
      const helpEmbed = new EmbedBuilder()
        .setTitle('🏦 Ayuda de Préstamos')
        .setColor(0x5865F2)
        .setDescription('Préstamo grande del banco con vencimiento y castigo por mora.')
        .addFields(
          {
            name: 'Cómo usarlo',
            value: [
              `\`-prestamo pedir <monto>\` → pedís el préstamo (entre ${formatCurrency(LOAN_MIN_PRINCIPAL, config)} y ${formatCurrency(LOAN_MAX_PRINCIPAL, config)})`,
              '`-prestamo estado` → ves tu deuda y vencimiento',
              '`-prestamo pagar <monto|all|half>` → pagás al banco',
              '`-prestamo remove @usuario` → borra el préstamo activo de un usuario (admin/staff)',
            ].join('\n'),
          },
          {
            name: 'Cómo pagar',
            value: [
              'Podés pagar con dinero de **mano + banco**.',
              'Ejemplos:',
              '`-prestamo pagar 50000`',
              '`-prestamo pagar half`',
              '`-prestamo pagar all`',
            ].join('\n'),
          },
          {
            name: 'Si te atrasás',
            value: 'Si se vence, entra en mora: se agrega recargo y se embarga tu saldo para cubrir la deuda.',
          },
          {
            name: 'Valores actuales',
            value: [
              `Monto base de referencia: ${formatCurrency(LOAN_DEFAULT_PRINCIPAL, config)}`,
              `Devolución estimada (sobre ${formatCurrency(LOAN_DEFAULT_PRINCIPAL, config)}): ${formatCurrency(Math.floor(LOAN_DEFAULT_PRINCIPAL * (1 + LOAN_INTEREST_PERCENT / 100)), config)}`,
              `Mínimo para pedir: ${formatCurrency(LOAN_MIN_PRINCIPAL, config)}`,
              `Máximo para pedir: ${formatCurrency(LOAN_MAX_PRINCIPAL, config)}`,
              `Plazo: ${LOAN_TERM_DAYS} días`,
              `Cooldown para pedir: ${cooldownText(LOAN_REQUEST_COOLDOWN_MS)}`,
            ].join('\n'),
          },
        )
        .setFooter({ text: 'Usá -prestamo para operar o -prestamo help para ver esta guía.' })
        .setTimestamp();

      if (canManage) {
        const loansText = activeLoans.length
          ? activeLoans.slice(0, 10).map(loan => [
              `<@${loan.userId}> — ${formatCurrency(loan.remaining, config)}`,
              loan.overdue ? '⚠️ Vencido' : `vence en ${cooldownText(loan.remainingMs)}`,
            ].join(' • ')).join('\n')
          : 'No hay préstamos activos en el servidor.';

        helpEmbed.addFields({
          name: 'Préstamos activos del servidor',
          value: loansText,
        });
      }

      return message.reply({ embeds: [helpEmbed] });
    }

    if (sub === 'pedir' || sub === 'request') {
      const loanAmount = parseLoanAmount(args[1]);
      if (!loanAmount || loanAmount < LOAN_MIN_PRINCIPAL || loanAmount > LOAN_MAX_PRINCIPAL) {
        return message.reply(`❌ Uso: \`-prestamo pedir <monto>\` (entre ${formatCurrency(LOAN_MIN_PRINCIPAL, config)} y ${formatCurrency(LOAN_MAX_PRINCIPAL, config)}).`);
      }

      const profileBefore = await getLoanProfile(guildId, userId);
      if (profileBefore.hasActiveLoan) {
        const active = profileBefore.activeLoan;
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🏦 Ya tenés un préstamo activo')
              .setColor(0xED4245)
              .setDescription([
                `Deuda pendiente: ${formatCurrency(active.remaining, config)}`,
                `Vence: ${formatDueDate(active.dueAt)}`,
                active.overdue
                  ? '⚠️ Está vencido. Pagalo cuanto antes para evitar más problemas.'
                  : `Tiempo restante: **${cooldownText(active.remainingMs)}**`,
              ].join('\n')),
          ],
        });
      }

      const requestRemaining = await getRemainingCooldown(guildId, userId, 'loan_request', LOAN_REQUEST_COOLDOWN_MS);
      if (requestRemaining > 0) {
        return message.reply(`⏳ No podés pedir otro préstamo todavía. Esperá **${cooldownText(requestRemaining)}**.`);
      }

      const issued = await requestLargeLoan(guildId, userId, {
        principal: loanAmount,
        interestPercent: LOAN_INTEREST_PERCENT,
        termDays: LOAN_TERM_DAYS,
      });

      if (!issued.ok) {
        return message.reply('❌ No se pudo crear el préstamo ahora. Probá de nuevo en unos segundos.');
      }

      await addToWallet(guildId, userId, issued.loan.principal);
      await setCooldown(guildId, userId, 'loan_request', Date.now());

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏦 Préstamo aprobado')
            .setColor(0x2ECC71)
            .setDescription([
              `Recibiste ${formatCurrency(issued.loan.principal, config)} del banco.`,
              `Vas a devolver ${formatCurrency(issued.loan.dueAmount, config)} en total.`,
              `Vencimiento: ${formatDueDate(issued.loan.dueAt)} (**${LOAN_TERM_DAYS} días**)`,
              `Próximo préstamo disponible en: **${cooldownText(LOAN_REQUEST_COOLDOWN_MS)}**`,
            ].join('\n'))
            .addFields({
              name: 'Importante',
              value: 'Si no pagás a tiempo, entrás en mora: te embargan todo el saldo (mano + banco) y se agrega recargo proporcional a tu deuda.',
            })
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'pagar' || sub === 'pay') {
      const profile = await getLoanProfile(guildId, userId);
      if (!profile.hasActiveLoan) {
        return message.reply('ℹ️ No tenés ningún préstamo activo. Usá `-prestamo pedir`.');
      }

      const active = profile.activeLoan;
      const balance = await getUserBalance(guildId, userId);
      const requested = parseAmountInput(args.slice(1).join(' '), balance.total);

      if (!requested || requested <= 0) {
        return message.reply('❌ Uso: `-prestamo pagar <monto|all|half>`');
      }

      const paidFromBalance = await debitFromCombinedBalance(guildId, userId, Math.min(requested, active.remaining));
      if (paidFromBalance <= 0) {
        return message.reply('❌ No tenés fondos (mano + banco) para pagar ese monto.');
      }

      const payment = await applyLoanRepayment(guildId, userId, paidFromBalance);
      if (!payment.ok) {
        return message.reply('❌ No se pudo registrar el pago del préstamo.');
      }

      if (payment.closed) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('✅ Préstamo saldado')
              .setColor(0x2ECC71)
              .setDescription(`Pagaste ${formatCurrency(payment.applied, config)} y cancelaste toda la deuda con el banco.`)
              .setTimestamp(),
          ],
        });
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('💸 Pago aplicado al préstamo')
            .setColor(0x5865F2)
            .setDescription([
              `Pagaste ${formatCurrency(payment.applied, config)}.`,
              `Te queda pendiente: ${formatCurrency(payment.remaining, config)}.`,
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'remove') {
      if (!canManage) {
        return message.reply('❌ Este subcomando es solo para administradores o staff.');
      }

      const targetRaw = args[1];
      if (!targetRaw) {
        return message.reply('❌ Uso: `-prestamo remove @usuario`');
      }

      const resolved = await resolveMemberTarget(message, targetRaw);
      const targetId = resolved?.id;
      if (!targetId) {
        return message.reply('❌ No pude resolver ese usuario.');
      }

      const removed = await clearUserLoan(guildId, targetId);
      if (!removed.ok) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('ℹ️ Sin préstamo activo')
              .setColor(0x5865F2)
              .setDescription(`<@${targetId}> no tiene préstamo activo para remover.`),
          ],
        });
      }

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🧹 Préstamo removido')
            .setColor(0xED4245)
            .setDescription([
              `Se removió el préstamo activo de <@${targetId}>.`,
              `Principal: ${formatCurrency(removed.loan.principal, config)}`,
              `Deuda total: ${formatCurrency(removed.loan.dueAmount, config)}`,
              removed.loan.penaltyApplied
                ? `Había mora aplicada: ${formatCurrency(removed.loan.penaltySurcharge, config)}`
                : 'No tenía mora aplicada.',
            ].join('\n'))
            .setTimestamp(),
        ],
      });
    }

    if (sub === 'estado' || sub === 'status') {
      const profile = await getLoanProfile(guildId, userId);
      if (!profile.hasActiveLoan) {
        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setTitle('🏦 Estado del préstamo')
              .setColor(0x5865F2)
              .setDescription([
                `No tenés préstamo activo.`,
                `Podés pedir uno con \`-prestamo pedir <monto>\` (entre ${formatCurrency(LOAN_MIN_PRINCIPAL, config)} y ${formatCurrency(LOAN_MAX_PRINCIPAL, config)}).`,
                `Ejemplo: \`-prestamo pedir ${LOAN_DEFAULT_PRINCIPAL}\` • Devolución aprox: ${formatCurrency(Math.floor(LOAN_DEFAULT_PRINCIPAL * (1 + LOAN_INTEREST_PERCENT / 100)), config)} en ${LOAN_TERM_DAYS} días.`,
              ].join('\n')),
          ],
        });
      }

      const active = profile.activeLoan;
      const moraLine = active.overdue
        ? '⚠️ Estado: EN MORA'
        : `Estado: al día • vence en **${cooldownText(active.remainingMs)}**`;

      const penaltyLine = active.penaltyApplied
        ? `Recargo por mora aplicado: ${formatCurrency(active.penaltySurcharge, config)} • Embargo ejecutado: ${formatCurrency(active.seizedAmount, config)}`
        : 'Sin recargo por mora aplicado todavía.';

      const extraPenaltyNotice = penalty.applied
        ? `\n\n🚨 Acaba de aplicarse mora por atraso: embargo ${formatCurrency(penalty.seizedAmount || 0, config)} + recargo ${formatCurrency(penalty.surcharge || 0, config)}.`
        : '';

      return message.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('🏦 Estado del préstamo')
            .setColor(active.overdue ? 0xED4245 : 0xF1C40F)
            .setDescription([
              `Principal: ${formatCurrency(active.principal, config)}`,
              `Deuda total: ${formatCurrency(active.dueAmount, config)}`,
              `Pendiente actual: ${formatCurrency(active.remaining, config)}`,
              `Vencimiento: ${formatDueDate(active.dueAt)}`,
              moraLine,
              penaltyLine,
            ].join('\n') + extraPenaltyNotice)
            .setTimestamp(),
        ],
      });
    }

    return message.reply([
      '📖 Uso de `-prestamo`',
      '`-prestamo help` / `-prestamo ayuda`',
      '`-prestamo estado`',
      '`-prestamo pedir <monto>`',
      '`-prestamo pagar <monto|all|half>`',
    ].join('\n'));
  },
};

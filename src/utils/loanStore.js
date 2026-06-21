const { query } = require('./db');
const { getUserBalance, withdrawFromBank, removeFromWallet } = require('./economyStore');

const LOAN_RULES = Object.freeze({
  DEFAULT_PRINCIPAL: 500_000,
  MIN_PRINCIPAL: 50_000,
  MAX_PRINCIPAL: 5_000_000,
  INTEREST_PERCENT: 35,
  TERM_DAYS: 7,
  REQUEST_COOLDOWN_MS: 3 * 24 * 60 * 60 * 1000,
  PENALTY_PERCENT: 35,
  MINIMUM_PENALTY: 25_000,
});

function toSafeInt(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return Math.floor(fallback);
  return Math.floor(parsed);
}

function defaultUserData() {
  return {
    activeLoan: null,
    stats: {
      takenCount: 0,
      totalBorrowed: 0,
      totalRepaid: 0,
      totalDefaults: 0,
    },
  };
}

function normalizeLoan(rawLoan) {
  if (!rawLoan || typeof rawLoan !== 'object') return null;

  const principal = Math.min(LOAN_RULES.MAX_PRINCIPAL, Math.max(0, toSafeInt(rawLoan.principal, 0)));
  const interestPercent = Math.min(LOAN_RULES.INTEREST_PERCENT, Math.max(0, toSafeInt(rawLoan.interestPercent, LOAN_RULES.INTEREST_PERCENT)));
  const expectedDueAmount = Math.max(principal, Math.floor(principal * (1 + (interestPercent / 100))));
  const dueAmount = Math.max(principal, Math.min(expectedDueAmount, Math.max(0, toSafeInt(rawLoan.dueAmount, expectedDueAmount))));
  const remaining = Math.min(dueAmount, Math.max(0, toSafeInt(rawLoan.remaining, dueAmount)));

  return {
    principal,
    dueAmount,
    remaining,
    issuedAt: Math.max(0, toSafeInt(rawLoan.issuedAt, 0)),
    dueAt: Math.max(0, toSafeInt(rawLoan.dueAt, 0)),
    termDays: Math.max(1, toSafeInt(rawLoan.termDays, LOAN_RULES.TERM_DAYS)),
    interestPercent,
    penaltyApplied: Boolean(rawLoan.penaltyApplied),
    penaltySurcharge: Math.max(0, toSafeInt(rawLoan.penaltySurcharge, 0)),
    defaultedAt: Math.max(0, toSafeInt(rawLoan.defaultedAt, 0)),
    seizedAmount: Math.max(0, toSafeInt(rawLoan.seizedAmount, 0)),
  };
}

async function getRawUserData(guildId, userId) {
  const [rows] = await query('SELECT data FROM economy_loans WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (!rows.length || !rows[0].data) return defaultUserData();
  const parsed = typeof rows[0].data === 'string' ? JSON.parse(rows[0].data) : rows[0].data;
  return {
    activeLoan: normalizeLoan(parsed.activeLoan),
    stats: {
      takenCount: Math.max(0, Math.floor(Number(parsed.stats?.takenCount) || 0)),
      totalBorrowed: Math.max(0, Math.floor(Number(parsed.stats?.totalBorrowed) || 0)),
      totalRepaid: Math.max(0, Math.floor(Number(parsed.stats?.totalRepaid) || 0)),
      totalDefaults: Math.max(0, Math.floor(Number(parsed.stats?.totalDefaults) || 0)),
    },
  };
}

async function saveUserData(guildId, userId, userData) {
  await query(
    `INSERT INTO economy_loans (guild_id, user_id, data) VALUES (?, ?, CAST(? AS JSON))
     ON DUPLICATE KEY UPDATE data = VALUES(data)`,
    [guildId, userId, JSON.stringify(userData)]
  );
}

async function getLoanProfile(guildId, userId, now = Date.now()) {
  const userData = await getRawUserData(guildId, userId);
  const activeLoan = userData.activeLoan;

  if (!activeLoan) {
    return {
      hasActiveLoan: false,
      activeLoan: null,
      stats: { ...userData.stats },
    };
  }

  return {
    hasActiveLoan: activeLoan.remaining > 0,
    activeLoan: {
      ...activeLoan,
      overdue: activeLoan.remaining > 0 && now > activeLoan.dueAt,
      remainingMs: Math.max(0, activeLoan.dueAt - now),
    },
    stats: { ...userData.stats },
  };
}

async function getGuildActiveLoans(guildId, now = Date.now()) {
  const [rows] = await query('SELECT user_id, data FROM economy_loans WHERE guild_id = ?', [guildId]);

  return rows
    .map(row => {
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {});
      const activeLoan = normalizeLoan(parsed.activeLoan);
      if (!activeLoan || activeLoan.remaining <= 0) return null;

      return {
        userId: row.user_id,
        ...activeLoan,
        overdue: now > activeLoan.dueAt,
        remainingMs: Math.max(0, activeLoan.dueAt - now),
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.dueAt - b.dueAt) || (b.remaining - a.remaining));
}

async function requestLargeLoan(guildId, userId, options = {}) {
  const userData = await getRawUserData(guildId, userId);

  const currentLoan = userData.activeLoan;
  if (currentLoan && currentLoan.remaining > 0) {
    return { ok: false, reason: 'active_loan', loan: currentLoan };
  }

  const rawPrincipal = toSafeInt(options.principal, 0);
  if (rawPrincipal < LOAN_RULES.MIN_PRINCIPAL || rawPrincipal > LOAN_RULES.MAX_PRINCIPAL) {
    return { ok: false, reason: 'invalid_principal' };
  }
  const principal = rawPrincipal;

  const interestPercent = Math.max(0, Math.min(LOAN_RULES.INTEREST_PERCENT, toSafeInt(options.interestPercent, LOAN_RULES.INTEREST_PERCENT)));
  const termDays = Math.max(1, toSafeInt(options.termDays, LOAN_RULES.TERM_DAYS));
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));

  const dueAmount = Math.max(principal, Math.floor(principal * (1 + (interestPercent / 100))));
  const dueAt = now + (termDays * 24 * 60 * 60 * 1000);

  const loan = {
    principal,
    dueAmount,
    remaining: dueAmount,
    issuedAt: now,
    dueAt,
    termDays,
    interestPercent,
    penaltyApplied: false,
    penaltySurcharge: 0,
    defaultedAt: 0,
    seizedAmount: 0,
  };

  userData.activeLoan = loan;
  userData.stats.takenCount += 1;
  userData.stats.totalBorrowed += principal;

  await saveUserData(guildId, userId, userData);
  return { ok: true, loan };
}

async function applyLoanRepayment(guildId, userId, amount) {
  const userData = await getRawUserData(guildId, userId);

  const currentLoan = userData.activeLoan;
  if (!currentLoan || currentLoan.remaining <= 0) {
    return { ok: false, reason: 'no_active_loan' };
  }

  const paid = Math.max(0, Math.floor(Number(amount) || 0));
  if (paid <= 0) {
    return { ok: false, reason: 'invalid_amount' };
  }

  const applied = Math.min(currentLoan.remaining, paid);
  currentLoan.remaining = Math.max(0, currentLoan.remaining - applied);
  userData.stats.totalRepaid += applied;

  let closed = false;
  if (currentLoan.remaining <= 0) {
    closed = true;
    userData.activeLoan = null;
  } else {
    userData.activeLoan = currentLoan;
  }

  await saveUserData(guildId, userId, userData);

  return {
    ok: true,
    applied,
    closed,
    remaining: currentLoan.remaining,
    loan: closed ? null : currentLoan,
  };
}

async function clearUserLoan(guildId, userId) {
  const userData = await getRawUserData(guildId, userId);

  const currentLoan = userData.activeLoan;
  if (!currentLoan) {
    return { ok: false, reason: 'no_active_loan' };
  }

  userData.activeLoan = null;
  await saveUserData(guildId, userId, userData);

  return {
    ok: true,
    loan: currentLoan,
  };
}

async function processOverdueLoan(guildId, userId, options = {}) {
  const now = Math.max(0, Math.floor(Number(options.now) || Date.now()));
  const penaltyPercent = Math.max(0, Math.min(100, toSafeInt(options.penaltyPercent, LOAN_RULES.PENALTY_PERCENT)));
  const minimumPenalty = Math.max(0, toSafeInt(options.minimumPenalty, LOAN_RULES.MINIMUM_PENALTY));

  const userData = await getRawUserData(guildId, userId);

  const currentLoan = userData.activeLoan;
  if (!currentLoan || currentLoan.remaining <= 0) {
    return { applied: false, reason: 'no_active_loan' };
  }

  if (now <= currentLoan.dueAt) {
    return { applied: false, reason: 'not_overdue' };
  }

  if (currentLoan.penaltyApplied) {
    return { applied: false, reason: 'already_penalized', loan: currentLoan };
  }

  const surcharge = Math.max(minimumPenalty, Math.floor(currentLoan.remaining * (penaltyPercent / 100)));
  currentLoan.penaltyApplied = true;
  currentLoan.penaltySurcharge = surcharge;
  currentLoan.defaultedAt = now;
  currentLoan.remaining += surcharge;
  currentLoan.dueAmount += surcharge;

  const balanceBefore = await getUserBalance(guildId, userId);
  const seizedAmount = Math.max(0, (Number(balanceBefore.wallet) || 0) + (Number(balanceBefore.bank) || 0));
  if (balanceBefore.bank > 0) {
    const moved = await withdrawFromBank(guildId, userId, balanceBefore.bank);
    if (moved > 0) {
      await removeFromWallet(guildId, userId, moved);
    }
  }
  if (balanceBefore.wallet > 0) {
    await removeFromWallet(guildId, userId, balanceBefore.wallet);
  }

  currentLoan.seizedAmount = seizedAmount;
  userData.stats.totalDefaults += 1;

  userData.activeLoan = currentLoan;
  await saveUserData(guildId, userId, userData);

  return {
    applied: true,
    reason: 'penalty_applied',
    surcharge,
    seizedAmount,
    loan: currentLoan,
  };
}

module.exports = {
  LOAN_RULES,
  getLoanProfile,
  getGuildActiveLoans,
  requestLargeLoan,
  applyLoanRepayment,
  clearUserLoan,
  processOverdueLoan,
};
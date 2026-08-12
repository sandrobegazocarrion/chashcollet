'use strict';
/*
 * Fase 3 — capa de datos por usuario sobre Postgres/Supabase.
 *
 * Estrategia: reutilizar la lógica de negocio ya probada en finance.js (validaciones,
 * reglas de saldo, etc.) en vez de reescribirla. Para cada mutación, se arma un
 * "store" falso solo con lo que esa función de finance.js necesita, se le pasa la
 * función real de finance.js (que valida y muta el objeto en memoria, igual que
 * siempre ha hecho para el bot), y acá solo se persiste el resultado a Postgres.
 *
 * IMPORTANTE (Fase 4): todas las queries llevan `.eq('user_id', userId)` explícito,
 * aunque el cliente por-request (con el JWT del usuario) ya lo garantiza vía RLS.
 * Esto es defensa en profundidad obligatoria porque el bot de Telegram (server/bot.js)
 * llama estas mismas funciones con el cliente `service_role`, que SALTA el RLS por
 * completo — sin el filtro explícito, un bug de "de qué chat viene esto" podría leer
 * o escribir datos de cualquier usuario. Nunca quitar estos `.eq('user_id', ...)`.
 */
const finance = require('./finance');

/* ---------------- Mapeo fila (snake_case) <-> objeto de la app (camelCase) ---------------- */
function rowToAccount(r) {
  const acc = { id: r.id, type: r.type, name: r.name, balance: Number(r.balance) };
  if (r.bank) acc.bank = r.bank;
  if (r.color) acc.color = r.color;
  if (r.type === 'tarjeta') {
    acc.network = r.network || 'otra';
    if (r.credit_limit != null) acc.creditLimit = Number(r.credit_limit);
    if (r.billing_day != null) acc.billingDay = r.billing_day;
    if (r.closing_day != null) acc.closingDay = r.closing_day;
  }
  if (r.type === 'ahorro' || r.type === 'corriente') {
    acc.interestRate = r.interest_rate != null ? Number(r.interest_rate) : null;
    acc.monthlyDeposit = r.monthly_deposit != null ? Number(r.monthly_deposit) : null;
    acc.lastInterestMonth = r.last_interest_month || null;
  }
  return acc;
}
function accountToRow(acc, userId) {
  return {
    id: acc.id, user_id: userId, type: acc.type, name: acc.name, balance: acc.balance,
    bank: acc.bank || null, color: acc.color || null,
    network: acc.network || null,
    credit_limit: acc.creditLimit != null ? acc.creditLimit : null,
    billing_day: acc.billingDay != null ? acc.billingDay : null,
    closing_day: acc.closingDay != null ? acc.closingDay : null,
    interest_rate: acc.interestRate != null ? acc.interestRate : null,
    monthly_deposit: acc.monthlyDeposit != null ? acc.monthlyDeposit : null,
    last_interest_month: acc.lastInterestMonth || null
  };
}
function rowToTransaction(r) {
  return { id: r.id, type: r.type, amount: Number(r.amount), date: r.date, description: r.description || '', category: r.category, accountId: r.account_id };
}
function transactionToRow(tx, userId) {
  return { id: tx.id, user_id: userId, type: tx.type, amount: tx.amount, date: tx.date, description: tx.description, category: tx.category, account_id: tx.accountId };
}

function must(error, msg){ if (error) throw new Error(msg || error.message); }

function rowToContribution(r) {
  return { id: r.id, amount: Number(r.amount), date: r.date, note: r.note || null };
}
function contributionToRow(c, pocketId, userId) {
  return { id: c.id, pocket_id: pocketId, user_id: userId, amount: c.amount, date: c.date, note: c.note || null };
}
function rowToPocket(r, contributionRows) {
  return {
    id: r.id, name: r.name, balance: Number(r.balance),
    rate: r.rate != null ? Number(r.rate) : null,
    lastMonth: r.last_month || null,
    target: r.target != null ? Number(r.target) : null,
    targetDate: r.target_date || null,
    monthlyTarget: r.monthly_target != null ? Number(r.monthly_target) : null,
    linkedAccountId: r.account_id || null,
    notifyBehind: !!r.notify_behind,
    lastNotifiedMonth: r.last_notified_month || null,
    color: r.color || null,
    isPrimary: !!r.is_primary,
    contributions: (contributionRows || []).map(rowToContribution)
  };
}
function pocketToRow(p, userId) {
  return {
    id: p.id, user_id: userId, name: p.name, balance: p.balance,
    rate: p.rate != null ? p.rate : null,
    last_month: p.lastMonth || null,
    target: p.target != null ? p.target : null,
    target_date: p.targetDate || null,
    monthly_target: p.monthlyTarget != null ? p.monthlyTarget : null,
    account_id: p.linkedAccountId || null,
    notify_behind: !!p.notifyBehind,
    last_notified_month: p.lastNotifiedMonth || null,
    color: p.color || null,
    is_primary: !!p.isPrimary
  };
}

/* ---------------- Servicios / préstamos bancarios (deudas) ---------------- */
function rowToDeuda(r) {
  const d = {
    id: r.id, name: r.name, type: r.type,
    amount: r.amount != null ? Number(r.amount) : null,
    dueDay: r.due_day, accountId: r.account_id || null,
    description: r.description || '',
    variableAmount: !!r.variable_amount,
    autoDebit: !!r.auto_debit
  };
  if (r.type === 'prestamo') {
    d.lenderType = r.lender_type || 'banco';
    d.lenderName = r.lender_name || null;
    d.interestRate = r.interest_rate != null ? Number(r.interest_rate) : null;
    d.principal = r.principal != null ? Number(r.principal) : null;
    d.remainingBalance = r.remaining_balance != null ? Number(r.remaining_balance) : null;
    d.totalInstallments = r.total_installments != null ? r.total_installments : null;
    d.paidInstallments = r.paid_installments != null ? r.paid_installments : null;
  }
  return d;
}
function deudaToRow(d, userId) {
  return {
    id: d.id, user_id: userId, name: d.name, type: d.type,
    amount: d.amount != null ? d.amount : null,
    due_day: d.dueDay, account_id: d.accountId || null,
    description: d.description || null,
    variable_amount: !!d.variableAmount,
    auto_debit: !!d.autoDebit,
    lender_type: d.lenderType || null,
    lender_name: d.lenderName || null,
    interest_rate: d.interestRate != null ? d.interestRate : null,
    principal: d.principal != null ? d.principal : null,
    remaining_balance: d.remainingBalance != null ? d.remainingBalance : null,
    total_installments: d.totalInstallments != null ? d.totalInstallments : null,
    paid_installments: d.paidInstallments != null ? d.paidInstallments : null
  };
}
function rowToDeudaPayment(r) {
  return {
    id: r.id, deudaId: r.deuda_id, month: r.month_key,
    paidDate: r.paid_date || r.date || null,
    accountId: r.account_id || null, txId: r.tx_id || null,
    amount: r.amount != null ? Number(r.amount) : null
  };
}
function deudaPaymentToRow(p, userId) {
  return {
    id: p.id, deuda_id: p.deudaId, user_id: userId,
    amount: p.amount, date: p.paidDate || null, month_key: p.month,
    paid_date: p.paidDate || null, account_id: p.accountId || null, tx_id: p.txId || null
  };
}

/* ---------------- Préstamos entre personas ---------------- */
function rowToPersonLoan(r) {
  return {
    id: r.id, direction: r.direction, personName: r.person_name,
    amount: Number(r.amount), date: r.date || null, dueDate: r.due_date || null,
    note: r.note || '', phone: r.phone || null,
    paid: !!r.paid, paidDate: r.paid_date || null, settleTxId: r.settle_tx_id || null,
    notifiedDue: !!r.notified_due, notifiedSoon: !!r.notified_soon,
    lastOverdueNotify: r.last_overdue_notify || null
  };
}
function personLoanToRow(p, userId) {
  return {
    id: p.id, user_id: userId, person_name: p.personName, direction: p.direction,
    amount: p.amount, phone: p.phone || null, due_date: p.dueDate || null,
    paid: !!p.paid, notified_soon: !!p.notifiedSoon,
    date: p.date || null, note: p.note || null, paid_date: p.paidDate || null,
    settle_tx_id: p.settleTxId || null, notified_due: !!p.notifiedDue,
    last_overdue_notify: p.lastOverdueNotify || null
  };
}

/* ---------------- Meta mensual de ahorro ---------------- */
async function getMonthProgress(sb, userId) {
  const [{ data: txRows, error: e0 }, profRow] = await Promise.all([
    sb.from('transactions').select('type,amount,date').eq('user_id', userId),
    getProfileRow(sb, userId)
  ]);
  must(e0);
  const fakeStore = {
    transactions: txRows.map(r => ({ type: r.type, amount: Number(r.amount), date: r.date })),
    monthlyGoal: profRow ? Number(profRow.monthly_goal) || 0 : 0
  };
  return finance.getMonthProgress(fakeStore);
}

async function setMonthlyGoal(sb, userId, amount) {
  const fakeStore = {};
  const result = finance.setMonthlyGoal(fakeStore, amount);
  const { error } = await sb.from('user_profile').upsert({ user_id: userId, monthly_goal: result.monthlyGoal }, { onConflict: 'user_id' });
  must(error);
  return result;
}

/* ---------------- Recordatorios / pagos programados (calendario) ---------------- */
function rowToReminder(r) {
  return {
    id: r.id, name: r.name,
    amount: r.amount != null ? Number(r.amount) : null,
    dueDay: r.due_day, accountId: r.account_id || null,
    notifyDaysBefore: r.notify_days_before != null ? r.notify_days_before : 1,
    notifiedBeforeFor: r.notified_before_for || null,
    notifiedDueFor: r.notified_due_for || null,
    totalInstallments: r.total_installments != null ? r.total_installments : null,
    paidInstallments: r.paid_installments != null ? r.paid_installments : null
  };
}
function reminderToRow(r, userId) {
  return {
    id: r.id, user_id: userId, name: r.name,
    amount: r.amount != null ? r.amount : null,
    due_day: r.dueDay, account_id: r.accountId || null,
    notify_days_before: r.notifyDaysBefore != null ? r.notifyDaysBefore : 1,
    notified_before_for: r.notifiedBeforeFor || null,
    notified_due_for: r.notifiedDueFor || null,
    total_installments: r.totalInstallments != null ? r.totalInstallments : null,
    paid_installments: r.paidInstallments != null ? r.paidInstallments : null
  };
}

/* ---------------- Carga completa (para /api/state) ---------------- */
async function loadUserStore(sb, userId) {
  const [accRes, txRes, catRes, profRes, pockRes, contribRes, chargeRes, payRes, deudaRes, deudaPayRes, loanRes, remRes] = await Promise.all([
    sb.from('accounts').select('*').eq('user_id', userId).order('created_at'),
    sb.from('transactions').select('*').eq('user_id', userId).order('date', { ascending: false }),
    sb.from('user_categories').select('*').eq('user_id', userId),
    sb.from('user_profile').select('*').eq('user_id', userId).maybeSingle(),
    sb.from('pockets').select('*').eq('user_id', userId).order('created_at'),
    sb.from('pocket_contributions').select('*').eq('user_id', userId).order('date'),
    sb.from('card_charges').select('*').eq('user_id', userId).order('date', { ascending: false }),
    sb.from('card_payments').select('*').eq('user_id', userId).order('date', { ascending: false }),
    sb.from('deudas').select('*').eq('user_id', userId).order('created_at'),
    sb.from('deuda_payments').select('*').eq('user_id', userId),
    sb.from('person_loans').select('*').eq('user_id', userId).order('created_at'),
    sb.from('reminders').select('*').eq('user_id', userId).order('created_at')
  ]);
  must(accRes.error); must(txRes.error); must(catRes.error); must(profRes.error);
  must(pockRes.error); must(contribRes.error); must(chargeRes.error); must(payRes.error);
  must(deudaRes.error); must(deudaPayRes.error); must(loanRes.error); must(remRes.error);

  const pockets = pockRes.data.map(r => rowToPocket(r, contribRes.data.filter(c => c.pocket_id === r.id)));
  const pocketGrowthChanged = finance.applyPocketGrowth({ pockets });
  if (pocketGrowthChanged) {
    await Promise.all(pockets.map(async (p) => {
      const orig = pockRes.data.find(r => r.id === p.id);
      if (orig.balance === p.balance && orig.last_month === p.lastMonth) return;
      const row = pocketToRow(p, orig.user_id); delete row.id; delete row.user_id;
      const { error } = await sb.from('pockets').update(row).eq('id', p.id).eq('user_id', userId);
      must(error);
    }));
  }

  const profileRow = profRes.data;
  const accounts = accRes.data.map(rowToAccount);

  // Igual que hacía GET /api/state con el JSON viejo: aplicar el interés mensual
  // acumulado a cuentas de ahorro/corriente antes de responder, y persistir si cambió algo.
  const interestChanged = finance.applyAccountInterest({ accounts });
  if (interestChanged) {
    await Promise.all(accounts.map(async (acc) => {
      const orig = accRes.data.find(r => r.id === acc.id);
      if (orig.balance === acc.balance && orig.last_interest_month === acc.lastInterestMonth) return;
      const row = accountToRow(acc, orig.user_id); delete row.id; delete row.user_id;
      const { error } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
      must(error);
    }));
  }

  return {
    accounts,
    transactions: txRes.data.map(rowToTransaction),
    categories: catRes.data.length ? catRes.data.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice(),
    pockets,
    cardPayments: payRes.data.map(rowToCardPayment),
    cardCharges: chargeRes.data.map(rowToCardCharge),
    deudas: deudaRes.data.map(rowToDeuda),
    deudaPayments: deudaPayRes.data.map(rowToDeudaPayment),
    personLoans: loanRes.data.map(rowToPersonLoan),
    reminders: remRes.data.map(rowToReminder),
    monthlyGoal: profileRow ? Number(profileRow.monthly_goal) || null : null,
    ownerChatId: null,
    settings: {
      telegramNotifications: profileRow ? profileRow.telegram_notifications !== false : true,
      notifyDaysBefore: profileRow && profileRow.notify_days_before != null ? profileRow.notify_days_before : 2,
      incomeDays: profileRow ? (profileRow.income_days || []) : []
    },
    profile: { ownerName: profileRow ? profileRow.owner_name : null },
    setupCompleted: profileRow ? !!profileRow.setup_completed : false
  };
}

/* ---------------- Cuentas ---------------- */
async function addAccount(sb, userId, body) {
  const acc = finance.addAccount({ accounts: [] }, body); // valida y arma el objeto (lanza Error si algo está mal)
  const { data, error } = await sb.from('accounts').insert(accountToRow(acc, userId)).select().single();
  must(error);
  return rowToAccount(data);
}

async function updateAccount(sb, userId, id, patch) {
  const { data: existing, error: e0 } = await sb.from('accounts').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Cuenta no encontrada');
  const fakeStore = { accounts: [rowToAccount(existing)] };
  const acc = finance.updateAccount(fakeStore, id, patch);
  const row = accountToRow(acc, userId);
  delete row.id; delete row.user_id;
  const { data, error } = await sb.from('accounts').update(row).eq('id', id).eq('user_id', userId).select().single();
  must(error);
  return rowToAccount(data);
}

async function deleteAccount(sb, userId, id) {
  const { data: existing, error: e0 } = await sb.from('accounts').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Cuenta no encontrada');
  // Igual que en finance.js: borrar una cuenta se lleva su historial de transacciones con ella.
  const { error: e1 } = await sb.from('transactions').delete().eq('account_id', id).eq('user_id', userId);
  must(e1);
  const { error: e2 } = await sb.from('accounts').delete().eq('id', id).eq('user_id', userId);
  must(e2);
}

/* ---------------- Transacciones ---------------- */
async function addTransaction(sb, userId, body) {
  const { data: accRows, error: e0 } = await sb.from('accounts').select('*').eq('user_id', userId);
  must(e0);
  const fakeStore = { accounts: accRows.map(rowToAccount), categories: [], transactions: [] };
  const catRes = await sb.from('user_categories').select('*').eq('user_id', userId);
  must(catRes.error);
  fakeStore.categories = catRes.data.length ? catRes.data.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice();
  const categoriesBefore = fakeStore.categories.slice();

  const tx = finance.addTransaction(fakeStore, body); // valida, calcula el nuevo saldo de la cuenta en fakeStore
  const acc = fakeStore.accounts.find(a => a.id === tx.accountId);

  const { error: e1 } = await sb.from('transactions').insert(transactionToRow(tx, userId));
  must(e1);
  try {
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error: e2 } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(e2);
  } catch (err) {
    await sb.from('transactions').delete().eq('id', tx.id).eq('user_id', userId); // compensación best-effort
    throw err;
  }
  // Si ensureCategory agregó una categoría nueva, persistirla.
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });

  return tx;
}

async function updateTransaction(sb, userId, id, patch) {
  const [{ data: txRow, error: e0 }, { data: accRows, error: e1 }] = await Promise.all([
    sb.from('transactions').select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
    sb.from('accounts').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1);
  if (!txRow) throw new Error('Transacción no encontrada');
  const catRes = await sb.from('user_categories').select('*').eq('user_id', userId);
  must(catRes.error);

  const fakeStore = {
    accounts: accRows.map(rowToAccount),
    transactions: [rowToTransaction(txRow)],
    categories: catRes.data.length ? catRes.data.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice()
  };
  const categoriesBefore = fakeStore.categories.slice();
  const tx = finance.updateTransaction(fakeStore, id, patch);

  const { error: e2 } = await sb.from('transactions').update(transactionToRow(tx, userId)).eq('id', id).eq('user_id', userId);
  must(e2);
  // Persistir el/los saldo(s) de cuenta que hayan cambiado (la cuenta anterior si se movió, y la nueva).
  const touchedIds = new Set([txRow.account_id, tx.accountId]);
  for (const accId of touchedIds) {
    const acc = fakeStore.accounts.find(a => a.id === accId);
    if (!acc) continue;
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error } = await sb.from('accounts').update(row).eq('id', accId).eq('user_id', userId);
    must(error);
  }
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });

  return rowToTransaction({ ...txRow, ...transactionToRow(tx, userId) });
}

async function deleteTransaction(sb, userId, id) {
  const [{ data: txRow, error: e0 }, { data: accRows, error: e1 }] = await Promise.all([
    sb.from('transactions').select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
    sb.from('accounts').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1);
  if (!txRow) throw new Error('Transacción no encontrada');
  const fakeStore = { accounts: accRows.map(rowToAccount), transactions: [rowToTransaction(txRow)] };
  finance.deleteTransaction(fakeStore, id); // revierte el efecto sobre el saldo en fakeStore.accounts

  const { error: e2 } = await sb.from('transactions').delete().eq('id', id).eq('user_id', userId);
  must(e2);
  const acc = fakeStore.accounts.find(a => a.id === txRow.account_id);
  if (acc) {
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(error);
  }
}

/* ---------------- Metas (pockets) ---------------- */
async function addPocket(sb, userId, body) {
  const [{ data: pRows, error: e0 }, { data: accRows, error: e1 }] = await Promise.all([
    sb.from('pockets').select('*').eq('user_id', userId).order('created_at'),
    sb.from('accounts').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1);
  const fakeStore = { pockets: pRows.map(r => rowToPocket(r, [])), accounts: accRows.map(rowToAccount) };
  const pocket = finance.addPocket(fakeStore, body);
  const { error } = await sb.from('pockets').insert(pocketToRow(pocket, userId));
  must(error);
  return pocket;
}

async function updatePocket(sb, userId, id, patch) {
  const { data: pRows, error: e0 } = await sb.from('pockets').select('*').eq('user_id', userId).order('created_at');
  must(e0);
  if (!pRows.find(r => r.id === id)) throw new Error('Bolsillo no encontrado');
  const fakeStore = { pockets: pRows.map(r => rowToPocket(r, [])) };
  const p = finance.updatePocket(fakeStore, id, patch);
  const row = pocketToRow(p, userId); delete row.id; delete row.user_id;
  const { error: e1 } = await sb.from('pockets').update(row).eq('id', id).eq('user_id', userId);
  must(e1);
  // finance.updatePocket desmarca isPrimary de los demás en memoria cuando patch.isPrimary===true;
  // hay que persistir eso también, no solo el bolsillo editado.
  if (patch.isPrimary === true) {
    const { error: e2 } = await sb.from('pockets').update({ is_primary: false }).eq('user_id', userId).neq('id', id);
    must(e2);
  }
  return p;
}

async function deletePocket(sb, userId, id) {
  const { data: pRows, error: e0 } = await sb.from('pockets').select('*').eq('user_id', userId).order('created_at');
  must(e0);
  const existing = pRows.find(r => r.id === id);
  if (!existing) throw new Error('Bolsillo no encontrado');
  const { error: e1 } = await sb.from('pockets').delete().eq('id', id).eq('user_id', userId);
  must(e1);
  // Igual que finance.js: si se borró el primario, el siguiente en la lista pasa a serlo.
  if (existing.is_primary) {
    const next = pRows.find(r => r.id !== id);
    if (next) {
      const { error: e2 } = await sb.from('pockets').update({ is_primary: true }).eq('id', next.id).eq('user_id', userId);
      must(e2);
    }
  }
}

async function movePocket(sb, userId, id, direction, amount, opts) {
  const { data: pRow, error: e0 } = await sb.from('pockets').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!pRow) throw new Error('Bolsillo no encontrado');
  const fakeStore = { pockets: [rowToPocket(pRow, [])] };
  const p = finance.movePocket(fakeStore, id, direction, amount, opts);
  const newContribution = p.contributions[p.contributions.length - 1];
  const { error: e1 } = await sb.from('pocket_contributions').insert(contributionToRow(newContribution, id, userId));
  must(e1);
  const row = pocketToRow(p, userId); delete row.id; delete row.user_id;
  const { error: e2 } = await sb.from('pockets').update(row).eq('id', id).eq('user_id', userId);
  must(e2);
  return p;
}

async function deletePocketContribution(sb, userId, pocketId, contribId) {
  const [{ data: pRow, error: e0 }, { data: cRow, error: e1 }] = await Promise.all([
    sb.from('pockets').select('*').eq('id', pocketId).eq('user_id', userId).maybeSingle(),
    sb.from('pocket_contributions').select('*').eq('id', contribId).eq('user_id', userId).maybeSingle()
  ]);
  must(e0); must(e1);
  if (!pRow) throw new Error('Bolsillo no encontrado');
  if (!cRow) throw new Error('Aporte no encontrado');
  const fakeStore = { pockets: [rowToPocket(pRow, [cRow])] };
  finance.deletePocketContribution(fakeStore, pocketId, contribId);
  const p = fakeStore.pockets[0];
  const { error: e2 } = await sb.from('pocket_contributions').delete().eq('id', contribId).eq('user_id', userId);
  must(e2);
  const row = pocketToRow(p, userId); delete row.id; delete row.user_id;
  const { error: e3 } = await sb.from('pockets').update(row).eq('id', pocketId).eq('user_id', userId);
  must(e3);
}

/* ---------------- Tarjetas: compras en cuotas y pagos ---------------- */
function rowToCardCharge(r) {
  return {
    id: r.id, cardId: r.card_account_id, description: r.description || '',
    totalAmount: Number(r.amount), totalInstallments: r.total_installments,
    installmentAmount: r.installment_amount != null ? Number(r.installment_amount) : null,
    paidInstallments: r.paid_installments || 0,
    purchaseDate: r.date, txId: r.tx_id || null
  };
}
function cardChargeToRow(c, userId) {
  return {
    id: c.id, user_id: userId, card_account_id: c.cardId, description: c.description,
    amount: c.totalAmount, date: c.purchaseDate, total_installments: c.totalInstallments,
    installment_amount: c.installmentAmount, paid_installments: c.paidInstallments, tx_id: c.txId
  };
}
function rowToCardPayment(r) {
  return { id: r.id, cardId: r.card_account_id, sourceId: r.source_id, amount: Number(r.amount), date: r.date };
}
function cardPaymentToRow(p, userId) {
  return { id: p.id, user_id: userId, card_account_id: p.cardId, source_id: p.sourceId, amount: p.amount, date: p.date };
}

async function addCardCharge(sb, userId, body) {
  const [{ data: accRows, error: e0 }, { data: catRows, error: e1 }] = await Promise.all([
    sb.from('accounts').select('*').eq('user_id', userId),
    sb.from('user_categories').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1);
  const fakeStore = {
    accounts: accRows.map(rowToAccount),
    categories: catRows.length ? catRows.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice(),
    transactions: [], cardCharges: []
  };
  const categoriesBefore = fakeStore.categories.slice();
  // finance.addCardCharge crea la transacción del gasto Y el registro de la compra en
  // cuotas en un solo paso (mismo comportamiento que ya usa el bot) — acá se persisten
  // ambas partes, más el nuevo saldo de la tarjeta.
  const charge = finance.addCardCharge(fakeStore, body);
  const tx = fakeStore.transactions[0];
  const card = fakeStore.accounts.find(a => a.id === charge.cardId);

  const { error: e2 } = await sb.from('transactions').insert(transactionToRow(tx, userId));
  must(e2);
  try {
    const row = accountToRow(card, userId); delete row.id; delete row.user_id;
    const { error: e3 } = await sb.from('accounts').update(row).eq('id', card.id).eq('user_id', userId);
    must(e3);
  } catch (err) {
    await sb.from('transactions').delete().eq('id', tx.id).eq('user_id', userId);
    throw err;
  }
  const { error: e4 } = await sb.from('card_charges').insert(cardChargeToRow(charge, userId));
  must(e4);
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });
  return charge;
}

async function deleteCardCharge(sb, userId, id) {
  const { data: chargeRow, error: e0 } = await sb.from('card_charges').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!chargeRow) throw new Error('Compra no encontrada');
  const charge = rowToCardCharge(chargeRow);

  const fakeStore = { cardCharges: [charge], accounts: [], transactions: [] };
  if (charge.txId) {
    const [{ data: txRow, error: e1 }, { data: accRows, error: e2 }] = await Promise.all([
      sb.from('transactions').select('*').eq('id', charge.txId).eq('user_id', userId).maybeSingle(),
      sb.from('accounts').select('*').eq('user_id', userId)
    ]);
    must(e1); must(e2);
    fakeStore.accounts = accRows.map(rowToAccount);
    if (txRow) fakeStore.transactions = [rowToTransaction(txRow)];
  }
  finance.deleteCardCharge(fakeStore, id); // revierte el saldo de la tarjeta en fakeStore.accounts

  const { error: e3 } = await sb.from('card_charges').delete().eq('id', id).eq('user_id', userId);
  must(e3);
  if (charge.txId) {
    await sb.from('transactions').delete().eq('id', charge.txId).eq('user_id', userId);
    const card = fakeStore.accounts.find(a => a.id === charge.cardId);
    if (card) {
      const row = accountToRow(card, userId); delete row.id; delete row.user_id;
      const { error } = await sb.from('accounts').update(row).eq('id', card.id).eq('user_id', userId);
      must(error);
    }
  }
}

async function markCardChargeInstallment(sb, userId, id) {
  const { data: row, error: e0 } = await sb.from('card_charges').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!row) throw new Error('Compra no encontrada');
  const fakeStore = { cardCharges: [rowToCardCharge(row)] };
  const charge = finance.markCardChargeInstallment(fakeStore, id);
  const { error } = await sb.from('card_charges').update({ paid_installments: charge.paidInstallments }).eq('id', id).eq('user_id', userId);
  must(error);
  return charge;
}

async function payCard(sb, userId, body) {
  const { data: accRows, error: e0 } = await sb.from('accounts').select('*').eq('user_id', userId);
  must(e0);
  const fakeStore = { accounts: accRows.map(rowToAccount), cardPayments: [] };
  const payment = finance.payCard(fakeStore, body);
  const card = fakeStore.accounts.find(a => a.id === payment.cardId);
  const source = fakeStore.accounts.find(a => a.id === payment.sourceId);

  const { error: e1 } = await sb.from('card_payments').insert(cardPaymentToRow(payment, userId));
  must(e1);
  try {
    for (const acc of [card, source]) {
      const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
      const { error } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
      must(error);
    }
  } catch (err) {
    await sb.from('card_payments').delete().eq('id', payment.id).eq('user_id', userId);
    throw err;
  }
  return payment;
}

async function deleteCardPayment(sb, userId, id) {
  const [{ data: payRow, error: e0 }, { data: accRows, error: e1 }] = await Promise.all([
    sb.from('card_payments').select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
    sb.from('accounts').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1);
  if (!payRow) throw new Error('Pago no encontrado');
  const fakeStore = { cardPayments: [rowToCardPayment(payRow)], accounts: accRows.map(rowToAccount) };
  finance.deleteCardPayment(fakeStore, id); // revierte los dos saldos (tarjeta + origen) en memoria

  const { error: e2 } = await sb.from('card_payments').delete().eq('id', id).eq('user_id', userId);
  must(e2);
  const card = fakeStore.accounts.find(a => a.id === payRow.card_account_id);
  const source = fakeStore.accounts.find(a => a.id === payRow.source_id);
  for (const acc of [card, source]) {
    if (!acc) continue;
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(error);
  }
}

/* ---------------- Deudas (servicios / préstamos bancarios) ---------------- */
async function addDeuda(sb, userId, body) {
  const fakeStore = { deudas: [] };
  const deuda = finance.addDeuda(fakeStore, body);
  const { error } = await sb.from('deudas').insert(deudaToRow(deuda, userId));
  must(error);
  return deuda;
}

async function updateDeuda(sb, userId, id, patch) {
  const { data: existing, error: e0 } = await sb.from('deudas').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Compromiso no encontrado');
  const fakeStore = { deudas: [rowToDeuda(existing)] };
  const d = finance.updateDeuda(fakeStore, id, patch);
  const row = deudaToRow(d, userId); delete row.id; delete row.user_id;
  const { error: e1 } = await sb.from('deudas').update(row).eq('id', id).eq('user_id', userId);
  must(e1);
  return d;
}

async function deleteDeuda(sb, userId, id) {
  const { data: existing, error: e0 } = await sb.from('deudas').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Compromiso no encontrado');
  const { error: e1 } = await sb.from('deuda_payments').delete().eq('deuda_id', id).eq('user_id', userId);
  must(e1);
  const { error: e2 } = await sb.from('deudas').delete().eq('id', id).eq('user_id', userId);
  must(e2);
}

async function payDeuda(sb, userId, id, body) {
  const [{ data: deudaRow, error: e0 }, { data: payRows, error: e1 }, { data: accRows, error: e2 }, { data: catRows, error: e3 }] = await Promise.all([
    sb.from('deudas').select('*').eq('id', id).eq('user_id', userId).maybeSingle(),
    sb.from('deuda_payments').select('*').eq('deuda_id', id).eq('user_id', userId),
    sb.from('accounts').select('*').eq('user_id', userId),
    sb.from('user_categories').select('*').eq('user_id', userId)
  ]);
  must(e0); must(e1); must(e2); must(e3);
  if (!deudaRow) throw new Error('Compromiso no encontrado');
  const fakeStore = {
    deudas: [rowToDeuda(deudaRow)],
    deudaPayments: payRows.map(rowToDeudaPayment),
    accounts: accRows.map(rowToAccount),
    categories: catRows.length ? catRows.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice(),
    transactions: []
  };
  const categoriesBefore = fakeStore.categories.slice();
  const payment = finance.payDeuda(fakeStore, id, body);

  if (payment.txId) {
    const tx = fakeStore.transactions.find(t => t.id === payment.txId);
    const { error: e4 } = await sb.from('transactions').insert(transactionToRow(tx, userId));
    must(e4);
    const acc = fakeStore.accounts.find(a => a.id === payment.accountId);
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error: e5 } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(e5);
  }
  const { error: e6 } = await sb.from('deuda_payments').insert(deudaPaymentToRow(payment, userId));
  must(e6);
  const d = fakeStore.deudas[0];
  if (d.type === 'prestamo') {
    const { error: e7 } = await sb.from('deudas').update({ remaining_balance: d.remainingBalance, paid_installments: d.paidInstallments }).eq('id', id).eq('user_id', userId);
    must(e7);
  }
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });

  return payment;
}

async function unPayDeuda(sb, userId, paymentId) {
  const { data: payRow, error: e0 } = await sb.from('deuda_payments').select('*').eq('id', paymentId).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!payRow) throw new Error('Pago no encontrado');
  const payment = rowToDeudaPayment(payRow);

  const [{ data: deudaRow, error: e1 }, txRes, accRes] = await Promise.all([
    sb.from('deudas').select('*').eq('id', payment.deudaId).eq('user_id', userId).maybeSingle(),
    payment.txId ? sb.from('transactions').select('*').eq('id', payment.txId).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null, error: null }),
    sb.from('accounts').select('*').eq('user_id', userId)
  ]);
  must(e1); must(txRes.error); must(accRes.error);

  const fakeStore = {
    deudaPayments: [payment],
    deudas: deudaRow ? [rowToDeuda(deudaRow)] : [],
    transactions: txRes.data ? [rowToTransaction(txRes.data)] : [],
    accounts: accRes.data.map(rowToAccount)
  };
  finance.unPayDeuda(fakeStore, paymentId);

  const { error: e2 } = await sb.from('deuda_payments').delete().eq('id', paymentId).eq('user_id', userId);
  must(e2);
  if (payment.txId) {
    await sb.from('transactions').delete().eq('id', payment.txId).eq('user_id', userId);
    const acc = fakeStore.accounts.find(a => a.id === txRes.data.account_id);
    if (acc) {
      const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
      const { error } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
      must(error);
    }
  }
  if (deudaRow && fakeStore.deudas[0] && fakeStore.deudas[0].type === 'prestamo') {
    const d = fakeStore.deudas[0];
    const { error: e3 } = await sb.from('deudas').update({ remaining_balance: d.remainingBalance, paid_installments: d.paidInstallments }).eq('id', payment.deudaId).eq('user_id', userId);
    must(e3);
  }
}

/* ---------------- Préstamos entre personas ---------------- */
async function addPersonLoan(sb, userId, body) {
  const fakeStore = { personLoans: [] };
  const loan = finance.addPersonLoan(fakeStore, body);
  const { error } = await sb.from('person_loans').insert(personLoanToRow(loan, userId));
  must(error);
  return loan;
}

async function updatePersonLoan(sb, userId, id, patch) {
  const { data: existing, error: e0 } = await sb.from('person_loans').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Préstamo no encontrado');
  const fakeStore = { personLoans: [rowToPersonLoan(existing)] };
  const p = finance.updatePersonLoan(fakeStore, id, patch);
  const row = personLoanToRow(p, userId); delete row.id; delete row.user_id;
  const { error: e1 } = await sb.from('person_loans').update(row).eq('id', id).eq('user_id', userId);
  must(e1);
  return p;
}

async function deletePersonLoan(sb, userId, id) {
  const { data: existing, error: e0 } = await sb.from('person_loans').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Préstamo no encontrado');
  const { error: e1 } = await sb.from('person_loans').delete().eq('id', id).eq('user_id', userId);
  must(e1);
}

async function settlePersonLoan(sb, userId, id, body) {
  const { data: loanRow, error: e0 } = await sb.from('person_loans').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!loanRow) throw new Error('Préstamo no encontrado');
  const [{ data: accRows, error: e1 }, { data: catRows, error: e2 }] = await Promise.all([
    sb.from('accounts').select('*').eq('user_id', userId),
    sb.from('user_categories').select('*').eq('user_id', userId)
  ]);
  must(e1); must(e2);
  const fakeStore = {
    personLoans: [rowToPersonLoan(loanRow)],
    accounts: accRows.map(rowToAccount),
    categories: catRows.length ? catRows.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice(),
    transactions: []
  };
  const categoriesBefore = fakeStore.categories.slice();
  const p = finance.settlePersonLoan(fakeStore, id, body);

  if (p.settleTxId) {
    const tx = fakeStore.transactions.find(t => t.id === p.settleTxId);
    const { error: e3 } = await sb.from('transactions').insert(transactionToRow(tx, userId));
    must(e3);
    const acc = fakeStore.accounts.find(a => a.id === (body && body.accountId));
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error: e4 } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(e4);
  }
  const row = personLoanToRow(p, userId); delete row.id; delete row.user_id;
  const { error: e5 } = await sb.from('person_loans').update(row).eq('id', id).eq('user_id', userId);
  must(e5);
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });

  return p;
}

/* ---------------- Recordatorios / pagos programados (calendario) ---------------- */
async function addReminder(sb, userId, body) {
  const fakeStore = { reminders: [] };
  const reminder = finance.addReminder(fakeStore, body);
  const { error } = await sb.from('reminders').insert(reminderToRow(reminder, userId));
  must(error);
  return reminder;
}

async function updateReminder(sb, userId, id, patch) {
  const { data: existing, error: e0 } = await sb.from('reminders').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Recordatorio no encontrado');
  const fakeStore = { reminders: [rowToReminder(existing)] };
  const r = finance.updateReminder(fakeStore, id, patch);
  const row = reminderToRow(r, userId); delete row.id; delete row.user_id;
  const { error: e1 } = await sb.from('reminders').update(row).eq('id', id).eq('user_id', userId);
  must(e1);
  return r;
}

async function deleteReminder(sb, userId, id) {
  const { data: existing, error: e0 } = await sb.from('reminders').select('id').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!existing) throw new Error('Recordatorio no encontrado');
  const { error: e1 } = await sb.from('reminders').delete().eq('id', id).eq('user_id', userId);
  must(e1);
}

async function payInstallment(sb, userId, id, accountId) {
  const { data: remRow, error: e0 } = await sb.from('reminders').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
  must(e0);
  if (!remRow) throw new Error('Recordatorio no encontrado');
  const [{ data: accRows, error: e1 }, { data: catRows, error: e2 }] = await Promise.all([
    sb.from('accounts').select('*').eq('user_id', userId),
    sb.from('user_categories').select('*').eq('user_id', userId)
  ]);
  must(e1); must(e2);
  const fakeStore = {
    reminders: [rowToReminder(remRow)],
    accounts: accRows.map(rowToAccount),
    categories: catRows.length ? catRows.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice(),
    transactions: []
  };
  const categoriesBefore = fakeStore.categories.slice();
  const result = finance.payInstallment(fakeStore, id, accountId);

  if (result.tx) {
    const { error: e3 } = await sb.from('transactions').insert(transactionToRow(result.tx, userId));
    must(e3);
    const acc = fakeStore.accounts.find(a => a.id === accountId);
    const row = accountToRow(acc, userId); delete row.id; delete row.user_id;
    const { error: e4 } = await sb.from('accounts').update(row).eq('id', acc.id).eq('user_id', userId);
    must(e4);
  }
  const r = fakeStore.reminders[0];
  const { error: e5 } = await sb.from('reminders').update({
    paid_installments: r.paidInstallments, notified_due_for: r.notifiedDueFor
  }).eq('id', id).eq('user_id', userId);
  must(e5);
  const newCat = fakeStore.categories.find(c => !categoriesBefore.includes(c));
  if (newCat) await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: newCat });

  return result;
}

/* ---------------- Flags de notificación (usados por el scheduler de recordatorios) ----------------
 * finance.checkDueReminders / checkPocketsBehind / checkPersonLoansDue mutan los objetos
 * en memoria para marcar "ya avisé esto" pero no persisten nada — eso siempre lo hacía
 * db.save() al final del tick. Acá el scheduler multiusuario (bot.js) llama a estas
 * funciones explícitamente por cada aviso que efectivamente mandó. */
async function markReminderNotified(sb, userId, id, { notifiedDueFor, notifiedBeforeFor }) {
  const patch = {};
  if (notifiedDueFor !== undefined) patch.notified_due_for = notifiedDueFor;
  if (notifiedBeforeFor !== undefined) patch.notified_before_for = notifiedBeforeFor;
  const { error } = await sb.from('reminders').update(patch).eq('id', id).eq('user_id', userId);
  must(error);
}
async function markPocketNotified(sb, userId, id, lastNotifiedMonth) {
  const { error } = await sb.from('pockets').update({ last_notified_month: lastNotifiedMonth }).eq('id', id).eq('user_id', userId);
  must(error);
}
async function markPersonLoanNotified(sb, userId, id, { notifiedDue, notifiedSoon, lastOverdueNotify }) {
  const patch = {};
  if (notifiedDue !== undefined) patch.notified_due = notifiedDue;
  if (notifiedSoon !== undefined) patch.notified_soon = notifiedSoon;
  if (lastOverdueNotify !== undefined) patch.last_overdue_notify = lastOverdueNotify;
  const { error } = await sb.from('person_loans').update(patch).eq('id', id).eq('user_id', userId);
  must(error);
}

/* ---------------- Categorías ---------------- */
async function addCategory(sb, userId, name) {
  const { data: catRows, error } = await sb.from('user_categories').select('*').eq('user_id', userId);
  must(error);
  const fakeStore = { categories: catRows.length ? catRows.map(c => c.name) : finance.DEFAULT_CATEGORIES.slice() };
  const before = fakeStore.categories.slice();
  const result = finance.ensureCategory(fakeStore, name);
  const added = fakeStore.categories.find(c => !before.includes(c));
  if (added) {
    const { error: e2 } = await sb.from('user_categories').insert({ id: finance.genId(), user_id: userId, name: added });
    must(e2);
  }
  return result;
}

/* ---------------- Settings / Perfil ---------------- */
async function getProfileRow(sb, userId) {
  const { data, error } = await sb.from('user_profile').select('*').eq('user_id', userId).maybeSingle();
  must(error);
  return data;
}
function profileRowToFakeStore(row) {
  return {
    settings: {
      telegramNotifications: row ? row.telegram_notifications !== false : true,
      notifyDaysBefore: row && row.notify_days_before != null ? row.notify_days_before : 2,
      incomeDays: row ? (row.income_days || []) : []
    },
    profile: { ownerName: row ? row.owner_name : null }
  };
}

async function updateSettings(sb, userId, patch) {
  const row = await getProfileRow(sb, userId);
  const fakeStore = profileRowToFakeStore(row);
  const settings = finance.updateSettings(fakeStore, patch);
  const { error } = await sb.from('user_profile').upsert({
    user_id: userId,
    telegram_notifications: settings.telegramNotifications,
    notify_days_before: settings.notifyDaysBefore,
    income_days: settings.incomeDays
  }, { onConflict: 'user_id' });
  must(error);
  return settings;
}

async function updateProfile(sb, userId, patch) {
  const row = await getProfileRow(sb, userId);
  const fakeStore = profileRowToFakeStore(row);
  const profile = finance.updateProfile(fakeStore, patch);
  const { error } = await sb.from('user_profile').upsert({
    user_id: userId,
    owner_name: profile.ownerName
  }, { onConflict: 'user_id' });
  must(error);
  return profile;
}

async function completeSetup(sb, userId) {
  const { error } = await sb.from('user_profile').upsert({ user_id: userId, setup_completed: true }, { onConflict: 'user_id' });
  must(error);
  return { setupCompleted: true };
}

module.exports = {
  loadUserStore,
  addAccount, updateAccount, deleteAccount,
  addTransaction, updateTransaction, deleteTransaction,
  addPocket, updatePocket, deletePocket, movePocket, deletePocketContribution,
  addCardCharge, deleteCardCharge, markCardChargeInstallment, payCard, deleteCardPayment,
  addDeuda, updateDeuda, deleteDeuda, payDeuda, unPayDeuda,
  addPersonLoan, updatePersonLoan, deletePersonLoan, settlePersonLoan,
  addReminder, updateReminder, deleteReminder, payInstallment,
  markReminderNotified, markPocketNotified, markPersonLoanNotified,
  getMonthProgress, setMonthlyGoal,
  addCategory,
  updateSettings, updateProfile, completeSetup
};

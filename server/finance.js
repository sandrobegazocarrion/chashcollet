'use strict';
/*
 * Lógica de negocio compartida entre la API web y el bot de Telegram.
 * Todas las funciones reciben `store` (el objeto de datos en memoria) y lo mutan directamente.
 */

const DEFAULT_CATEGORIES = ['Comida', 'Transporte', 'Hogar', 'Entretenimiento', 'Salud', 'Otros'];

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Límites por tipo de campo de texto libre (defensa en profundidad además del
// saneado genérico de sanitize.js — acá el límite es específico al significado
// del campo: un nombre no necesita el mismo margen que una nota o descripción).
const LEN_NAME = 80;      // nombre de cuenta/meta/deuda/persona/recordatorio/categoría
const LEN_NOTE = 300;     // descripción/nota libre
const LEN_PHONE = 30;     // teléfono

function capLen(str, max) {
  return (str || '').toString().trim().slice(0, max);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function currentYYYYMM() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function emptyStore() {
  return {
    accounts: [],
    pockets: [],
    transactions: [],
    categories: DEFAULT_CATEGORIES.slice(),
    cardPayments: [],
    reminders: [],
    deudas: [],
    deudaPayments: [],
    personLoans: [],
    personLoanPayments: [],
    cardCharges: [],
    monthlyGoal: 0,
    ownerChatId: null,
    settings: { telegramNotifications: true, notifyDaysBefore: 2, incomeDays: [] },
    profile: { ownerName: null },
    setupCompleted: false
  };
}

// La antigua "Meta de ahorro" única (store.savingsGoal) se fusiona en un chanchito
// marcado como principal, para no tener dos sistemas de metas por separado.
function migrateSavingsGoalToPocket(store) {
  if (store.savingsGoal && store.savingsGoal.target) {
    const sg = store.savingsGoal;
    const contributions = (sg.contributions || []).map(c => ({ ...c }));
    store.pockets.push({
      id: genId(),
      name: sg.name || 'Meta de ahorro',
      balance: contributions.reduce((s, c) => s + c.amount, 0),
      rate: null,
      lastMonth: currentYYYYMM(),
      target: sg.target,
      targetDate: sg.targetDate || null,
      monthlyTarget: null,
      linkedAccountId: null,
      notifyBehind: false,
      lastNotifiedMonth: null,
      color: null,
      isPrimary: true,
      contributions
    });
  }
  delete store.savingsGoal;
}

function normalizeStore(store) {
  store.accounts = store.accounts || [];
  store.pockets = store.pockets || [];
  store.transactions = store.transactions || [];
  store.categories = (store.categories && store.categories.length) ? store.categories : DEFAULT_CATEGORIES.slice();
  store.cardPayments = store.cardPayments || [];
  store.reminders = store.reminders || [];
  store.deudas = store.deudas || [];
  store.deudaPayments = store.deudaPayments || [];
  store.personLoans = store.personLoans || [];
  store.personLoans.forEach(p => {
    if (p.direction === undefined) p.direction = 'debo';
    if (p.notifiedSoon === undefined) p.notifiedSoon = false;
    if (p.notifiedDue === undefined) p.notifiedDue = false;
    if (p.lastOverdueNotify === undefined) p.lastOverdueNotify = null;
    if (p.phone === undefined) p.phone = null;
    if (p.returnMode === undefined) p.returnMode = 'unico';
    if (p.installmentAmount === undefined) p.installmentAmount = null;
    if (p.totalInstallments === undefined) p.totalInstallments = null;
    if (p.reminderFrequency === undefined) p.reminderFrequency = null;
  });
  store.personLoanPayments = store.personLoanPayments || [];
  store.cardCharges = store.cardCharges || [];
  store.monthlyGoal = store.monthlyGoal || 0;
  store.deudas.forEach(d => {
    if (d.type === 'prestamo') {
      if (d.lenderType === undefined) d.lenderType = 'banco';
      if (d.lenderName === undefined) d.lenderName = null;
      if (d.interestRate === undefined) d.interestRate = null;
      if (d.principal === undefined) d.principal = null;
      if (d.remainingBalance === undefined) d.remainingBalance = d.principal;
      if (d.totalInstallments === undefined) d.totalInstallments = null;
      if (d.paidInstallments === undefined) d.paidInstallments = d.totalInstallments ? 0 : null;
      d.variableAmount = false;
      d.autoDebit = false;
    } else {
      if (d.variableAmount === undefined) d.variableAmount = false;
      if (d.autoDebit === undefined) d.autoDebit = false;
    }
  });
  store.deudaPayments.forEach(p => { if (p.amount === undefined) p.amount = null; });
  store.pockets.forEach(p => {
    if (p.target === undefined) p.target = null;
    if (p.targetDate === undefined) p.targetDate = null;
    if (p.monthlyTarget === undefined) p.monthlyTarget = null;
    if (p.linkedAccountId === undefined) p.linkedAccountId = null;
    if (p.notifyBehind === undefined) p.notifyBehind = false;
    if (p.lastNotifiedMonth === undefined) p.lastNotifiedMonth = null;
    if (p.color === undefined) p.color = null;
    if (p.isPrimary === undefined) p.isPrimary = false;
    if (!p.contributions) p.contributions = [];
  });
  if (store.savingsGoal) migrateSavingsGoalToPocket(store);
  if (!store.pockets.some(p => p.isPrimary) && store.pockets.length > 0) store.pockets[0].isPrimary = true;
  store.ownerChatId = store.ownerChatId || null;
  if (!store.settings) store.settings = {};
  if (store.settings.telegramNotifications === undefined) store.settings.telegramNotifications = true;
  if (store.settings.notifyDaysBefore === undefined) store.settings.notifyDaysBefore = 2;
  if (store.settings.incomeDays === undefined) store.settings.incomeDays = [];
  if (!store.profile) store.profile = { ownerName: null };
  if (store.profile.ownerName === undefined) store.profile.ownerName = null;
  // Instalaciones que ya tenían datos antes de existir este asistente se dan por configuradas,
  // para no interrumpir con el wizard a alguien que ya usa la app (p.ej. el propio desarrollador).
  if (store.setupCompleted === undefined) {
    store.setupCompleted = store.accounts.length > 0 || store.transactions.length > 0;
  }
  return store;
}

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function formatMoney(n) {
  n = Number(n) || 0;
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  return sign + 'S/ ' + n.toLocaleString('es-PE', { maximumFractionDigits: 0 });
}

/* ---------------- Settings ---------------- */
function getSettings(store) { return store.settings || {}; }

function updateSettings(store, patch) {
  if (!store.settings) store.settings = {};
  if (patch.telegramNotifications !== undefined) store.settings.telegramNotifications = !!patch.telegramNotifications;
  if (patch.notifyDaysBefore !== undefined) {
    const n = Number(patch.notifyDaysBefore);
    store.settings.notifyDaysBefore = (!isNaN(n) && n >= 0) ? n : 2;
  }
  if (patch.incomeDays !== undefined) {
    const days = Array.isArray(patch.incomeDays) ? patch.incomeDays : [];
    store.settings.incomeDays = [...new Set(days.map(Number).filter(n => n >= 1 && n <= 31))].sort((a, b) => a - b);
  }
  return store.settings;
}

/* ---------------- Pocket monthly growth ---------------- */
function applyPocketGrowth(store) {
  const nowKey = currentYYYYMM();
  let changed = false;
  store.pockets.forEach(p => {
    if (!p.lastMonth) { p.lastMonth = nowKey; changed = true; return; }
    if (p.rate && p.rate > 0 && p.lastMonth !== nowKey) {
      const [ly, lm] = p.lastMonth.split('-').map(Number);
      const [ny, nm] = nowKey.split('-').map(Number);
      const monthsElapsed = (ny - ly) * 12 + (nm - lm);
      for (let i = 0; i < monthsElapsed; i++) {
        p.balance = p.balance * (1 + p.rate / 100);
      }
      p.balance = Math.round(p.balance * 100) / 100;
      changed = true;
    }
    p.lastMonth = nowKey;
  });
  return changed;
}

/* ---------------- Savings account monthly interest ---------------- */
function applyAccountInterest(store) {
  const nowKey = currentYYYYMM();
  let changed = false;
  store.accounts.forEach(acc => {
    if (acc.type !== 'ahorro' && acc.type !== 'corriente') return;
    if (!acc.interestRate || acc.interestRate <= 0) return;
    if (!acc.lastInterestMonth) { acc.lastInterestMonth = nowKey; changed = true; return; }
    if (acc.lastInterestMonth === nowKey) return;
    const [ly, lm] = acc.lastInterestMonth.split('-').map(Number);
    const [ny, nm] = nowKey.split('-').map(Number);
    const monthsElapsed = (ny - ly) * 12 + (nm - lm);
    const monthlyRate = acc.interestRate / 12 / 100;
    for (let i = 0; i < monthsElapsed; i++) {
      acc.balance = acc.balance * (1 + monthlyRate);
      if (acc.monthlyDeposit && acc.monthlyDeposit > 0) acc.balance += acc.monthlyDeposit;
    }
    acc.balance = Math.round(acc.balance * 100) / 100;
    acc.lastInterestMonth = nowKey;
    changed = true;
  });
  return changed;
}

/* ---------------- Transaction balance effects ---------------- */
function applyTxEffect(store, tx, sign) {
  const acc = store.accounts.find(a => a.id === tx.accountId);
  if (!acc) return;
  const amt = tx.amount * sign;
  if (acc.type === 'ahorro' || acc.type === 'corriente' || acc.type === 'efectivo') {
    acc.balance += (tx.type === 'ingreso' ? amt : -amt);
  } else if (acc.type === 'tarjeta') {
    acc.balance += (tx.type === 'gasto' ? amt : -amt);
  }
}

function computeTotals(store) {
  let totalIngresos = 0, totalGastos = 0;
  store.transactions.forEach(tx => {
    if (tx.type === 'ingreso') totalIngresos += tx.amount;
    else totalGastos += tx.amount;
  });
  const totalDeuda = store.accounts.filter(a => a.type === 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const totalLiquid = store.accounts.filter(a => a.type !== 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const totalBolsillos = store.pockets.reduce((s, p) => s + p.balance, 0);
  const totalAhorrado = totalLiquid + totalBolsillos;
  const balance = totalIngresos - totalGastos;
  return { totalIngresos, totalGastos, balance, totalDeuda, totalAhorrado, totalLiquid };
}

/* ---------------- Monthly savings goal ---------------- */
function setMonthlyGoal(store, amount) {
  const amt = Number(amount);
  store.monthlyGoal = (amt && amt > 0) ? amt : 0;
  return { monthlyGoal: store.monthlyGoal };
}

function getMonthProgress(store) {
  const monthKey = currentYYYYMM();
  let ingresos = 0, gastos = 0;
  store.transactions.forEach(tx => {
    if (!tx.date || tx.date.slice(0, 7) !== monthKey) return;
    if (tx.type === 'ingreso') ingresos += tx.amount;
    else gastos += tx.amount;
  });
  const saved = ingresos - gastos;
  const goal = store.monthlyGoal || 0;
  const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((saved / goal) * 100))) : 0;
  return { goal, saved, ingresos, gastos, pct };
}

/* ---------------- Payment reminders (calendario) ---------------- */
function addReminder(store, { name, amount, dueDay, accountId, notifyDaysBefore, totalInstallments }) {
  if (!name || !name.trim()) throw new Error('El nombre es obligatorio');
  const day = Number(dueDay);
  if (!day || day < 1 || day > 31) throw new Error('El día debe estar entre 1 y 31');
  const installments = totalInstallments ? Number(totalInstallments) : null;
  if (installments && installments < 1) throw new Error('El número de cuotas debe ser mayor a 0');
  const reminder = {
    id: genId(),
    name: capLen(name, LEN_NAME),
    amount: amount ? Number(amount) : null,
    dueDay: day,
    accountId: accountId || null,
    notifyDaysBefore: (notifyDaysBefore !== undefined && notifyDaysBefore !== null && notifyDaysBefore !== '') ? Number(notifyDaysBefore) : 1,
    notifiedBeforeFor: null,
    notifiedDueFor: null,
    totalInstallments: installments,
    paidInstallments: installments ? 0 : null
  };
  store.reminders.push(reminder);
  return reminder;
}

function updateReminder(store, id, { name, amount, dueDay, accountId, notifyDaysBefore, totalInstallments }) {
  const r = store.reminders.find(x => x.id === id);
  if (!r) throw new Error('Recordatorio no encontrado');
  if (name !== undefined) {
    if (!name.trim()) throw new Error('El nombre es obligatorio');
    r.name = capLen(name, LEN_NAME);
  }
  if (amount !== undefined) r.amount = amount ? Number(amount) : null;
  if (dueDay !== undefined) {
    const day = Number(dueDay);
    if (!day || day < 1 || day > 31) throw new Error('El día debe estar entre 1 y 31');
    r.dueDay = day;
  }
  if (accountId !== undefined) r.accountId = accountId || null;
  if (notifyDaysBefore !== undefined) r.notifyDaysBefore = (notifyDaysBefore !== null && notifyDaysBefore !== '') ? Number(notifyDaysBefore) : 1;
  if (totalInstallments !== undefined) {
    const installments = totalInstallments ? Number(totalInstallments) : null;
    if (installments && installments < 1) throw new Error('El número de cuotas debe ser mayor a 0');
    r.totalInstallments = installments;
    if (installments && r.paidInstallments === null) r.paidInstallments = 0;
    if (!installments) r.paidInstallments = null;
  }
  return r;
}

// Registra el pago de una cuota: crea el gasto y avisa si se pagó a tiempo (antes o el mismo día de vencimiento).
function payInstallment(store, id, accountId) {
  const r = store.reminders.find(x => x.id === id);
  if (!r) throw new Error('Recordatorio no encontrado');
  if (!r.totalInstallments) throw new Error('Este pago no es un plan de cuotas');
  if (r.paidInstallments >= r.totalInstallments) throw new Error('Ya pagaste todas las cuotas de este plan');

  const cuotaNum = r.paidInstallments + 1;
  let tx = null;

  if (r.amount && accountId) {
    if (!store.accounts.find(a => a.id === accountId)) throw new Error('Cuenta no encontrada');
    const category = ensureCategory(store, 'Cuotas');
    tx = addTransaction(store, {
      type: 'gasto',
      amount: r.amount,
      category,
      description: `${r.name} (cuota ${cuotaNum}/${r.totalInstallments})`,
      accountId
    });
  }

  const todayDay = new Date().getDate();
  const onTime = todayDay <= r.dueDay;
  r.paidInstallments = cuotaNum;
  r.notifiedDueFor = currentYYYYMM();
  const completed = r.paidInstallments >= r.totalInstallments;

  return { tx, onTime, completed, cuotaNum, totalInstallments: r.totalInstallments };
}

function deleteReminder(store, id) {
  const idx = store.reminders.findIndex(r => r.id === id);
  if (idx === -1) throw new Error('Recordatorio no encontrado');
  store.reminders.splice(idx, 1);
}

// Devuelve los avisos pendientes de enviar hoy y marca los recordatorios como notificados.
function checkDueReminders(store, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
  const monthKey = currentYYYYMM();
  const todayCount = daysInMonth(y, m);
  const due = [];

  store.reminders.forEach(r => {
    const effectiveDay = Math.min(r.dueDay, todayCount);
    const dueDate = new Date(y, m - 1, effectiveDay);
    const diffDays = Math.round((dueDate - new Date(y, m - 1, d)) / 86400000);

    if (diffDays === 0 && r.notifiedDueFor !== monthKey) {
      due.push({ reminder: r, kind: 'due' });
      r.notifiedDueFor = monthKey;
    } else if (diffDays === r.notifyDaysBefore && r.notifyDaysBefore > 0 && r.notifiedBeforeFor !== monthKey) {
      due.push({ reminder: r, kind: 'before' });
      r.notifiedBeforeFor = monthKey;
    }
  });

  return due;
}

// Metas de ahorro (chanchitos) atrasadas respecto al ritmo esperado del mes.
// Da 4 días de gracia al inicio del mes y solo avisa una vez por mes por meta.
function checkPocketsBehind(store, now = new Date()) {
  const monthKey = currentYYYYMM();
  const dayOfMonth = now.getDate();
  if (dayOfMonth < 5) return [];
  const totalDays = daysInMonth(now.getFullYear(), now.getMonth() + 1);
  const expectedPct = dayOfMonth / totalDays;
  const behind = [];

  store.pockets.forEach(p => {
    if (!p.notifyBehind || !p.monthlyTarget || p.monthlyTarget <= 0) return;
    if (p.lastNotifiedMonth === monthKey) return;
    const saved = (p.contributions || [])
      .filter(c => c.date && c.date.slice(0, 7) === monthKey)
      .reduce((s, c) => s + c.amount, 0);
    const actualPct = saved / p.monthlyTarget;
    if (actualPct < expectedPct - 0.15) {
      behind.push({ pocket: p, saved, expectedPct, actualPct });
      p.lastNotifiedMonth = monthKey;
    }
  });

  return behind;
}

/* ---------------- Accounts ---------------- */
const CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'diners', 'otra'];
const LIQUID_TYPES = ['ahorro', 'corriente', 'efectivo'];
// 'red' no es una opción decorativa: es el mismo rojo semántico de gastos/alertas
// en el frontend (--red). 'steel' lo reemplaza.
const ACCOUNT_COLORS = ['accent', 'accent2', 'ochre', 'lavender', 'sage', 'steel'];

function addAccount(store, { type, name, balance, network, bank, creditLimit, billingDay, closingDay, interestRate, monthlyDeposit, color }) {
  if (!['ahorro', 'corriente', 'efectivo', 'tarjeta'].includes(type)) throw new Error('Tipo de cuenta inválido');
  if (!name || !name.trim()) throw new Error('El nombre es obligatorio');
  if (type === 'efectivo' && Number(balance) < 0) throw new Error('El efectivo no puede empezar en negativo');
  const acc = { id: genId(), type, name: capLen(name, LEN_NAME), balance: Number(balance) || 0 };
  if (type === 'tarjeta') {
    acc.network = CARD_NETWORKS.includes(network) ? network : 'otra';
    if (creditLimit) acc.creditLimit = Number(creditLimit) || null;
    if (billingDay) acc.billingDay = Number(billingDay) || null;
    if (closingDay) acc.closingDay = Number(closingDay) || null;
  }
  if (type === 'ahorro' || type === 'corriente') {
    acc.interestRate = interestRate ? Number(interestRate) : null;
    acc.monthlyDeposit = monthlyDeposit ? Number(monthlyDeposit) : null;
    acc.lastInterestMonth = currentYYYYMM();
  }
  if (bank && type !== 'efectivo') acc.bank = capLen(bank, LEN_NAME);
  if (ACCOUNT_COLORS.includes(color)) acc.color = color;
  store.accounts.push(acc);
  return acc;
}

function updateAccount(store, id, { name, balance, network, bank, creditLimit, billingDay, closingDay, interestRate, monthlyDeposit, color }) {
  const acc = store.accounts.find(a => a.id === id);
  if (!acc) throw new Error('Cuenta no encontrada');
  if (name !== undefined) {
    if (!name.trim()) throw new Error('El nombre es obligatorio');
    acc.name = capLen(name, LEN_NAME);
  }
  if (balance !== undefined) {
    if (acc.type === 'efectivo' && Number(balance) < 0) throw new Error('El efectivo no puede quedar en negativo');
    acc.balance = Number(balance) || 0;
  }
  if (network !== undefined && acc.type === 'tarjeta') acc.network = CARD_NETWORKS.includes(network) ? network : 'otra';
  if (bank !== undefined && acc.type !== 'efectivo') acc.bank = bank ? capLen(bank, LEN_NAME) : null;
  if (color !== undefined) acc.color = ACCOUNT_COLORS.includes(color) ? color : null;
  if (acc.type === 'tarjeta') {
    if (creditLimit !== undefined) acc.creditLimit = creditLimit ? Number(creditLimit) : null;
    if (billingDay !== undefined) acc.billingDay = billingDay ? Number(billingDay) : null;
    if (closingDay !== undefined) acc.closingDay = closingDay ? Number(closingDay) : null;
  }
  if (acc.type === 'ahorro' || acc.type === 'corriente') {
    if (interestRate !== undefined) acc.interestRate = interestRate ? Number(interestRate) : null;
    if (monthlyDeposit !== undefined) acc.monthlyDeposit = monthlyDeposit ? Number(monthlyDeposit) : null;
  }
  return acc;
}

function deleteAccount(store, id) {
  const idx = store.accounts.findIndex(a => a.id === id);
  if (idx === -1) throw new Error('Cuenta no encontrada');
  store.transactions = store.transactions.filter(t => t.accountId !== id);
  store.cardPayments = store.cardPayments.filter(p => p.cardId !== id && p.sourceId !== id);
  store.reminders.forEach(r => { if (r.accountId === id) r.accountId = null; });
  store.accounts.splice(idx, 1);
}

/* ---------------- Categories ---------------- */
function ensureCategory(store, name) {
  const clean = capLen(name, LEN_NAME);
  if (!clean) return 'Otros';
  if (!store.categories.some(c => c.toLowerCase() === clean.toLowerCase())) {
    store.categories.push(clean);
  }
  return store.categories.find(c => c.toLowerCase() === clean.toLowerCase());
}

/* ---------------- Transactions ---------------- */
const CASH_OVERDRAFT_MSG = 'No hay suficiente efectivo para este gasto. El efectivo no puede quedar en negativo (eso significaría dinero que no existe) — registra la diferencia como un préstamo personal en Préstamos → Entre personas, o usa otra cuenta.';

// El efectivo es dinero físico: nunca puede ser negativo (a diferencia de una tarjeta,
// que sí representa deuda real). netAmount es positivo para ingreso, negativo para gasto.
function assertNoNegativeCash(acc, netAmount) {
  if (!acc || acc.type !== 'efectivo') return;
  if (acc.balance + netAmount < -0.001) throw new Error(CASH_OVERDRAFT_MSG);
}

function addTransaction(store, { type, amount, date, description, category, accountId }) {
  if (type !== 'ingreso' && type !== 'gasto') throw new Error('Tipo de transacción inválido');
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  const acc = store.accounts.find(a => a.id === accountId);
  if (!acc) throw new Error('Cuenta no encontrada');
  assertNoNegativeCash(acc, type === 'ingreso' ? amt : -amt);
  const cat = ensureCategory(store, category);
  const tx = {
    id: genId(),
    type,
    amount: amt,
    date: date || todayStr(),
    description: capLen(description, LEN_NOTE),
    category: cat,
    accountId
  };
  applyTxEffect(store, tx, 1);
  store.transactions.push(tx);
  return tx;
}

function updateTransaction(store, id, patch) {
  const tx = store.transactions.find(t => t.id === id);
  if (!tx) throw new Error('Transacción no encontrada');

  const newType = patch.type !== undefined ? patch.type : tx.type;
  const newAmount = patch.amount !== undefined ? (Number(patch.amount) || 0) : tx.amount;
  const newAccountId = patch.accountId !== undefined ? patch.accountId : tx.accountId;
  if (patch.accountId !== undefined && !store.accounts.find(a => a.id === newAccountId)) throw new Error('Cuenta no encontrada');

  // Se valida ANTES de mutar nada, simulando reversa + reaplicación sobre el saldo actual
  // (si la transacción se queda en la misma cuenta, su efecto viejo se resta primero).
  const newAcc = store.accounts.find(a => a.id === newAccountId);
  if (newAcc && newAcc.type === 'efectivo') {
    let projected = newAcc.balance;
    if (tx.accountId === newAccountId) projected -= (tx.type === 'ingreso' ? tx.amount : -tx.amount);
    projected += (newType === 'ingreso' ? newAmount : -newAmount);
    if (projected < -0.001) throw new Error(CASH_OVERDRAFT_MSG);
  }

  applyTxEffect(store, tx, -1);
  if (patch.type !== undefined) tx.type = patch.type;
  if (patch.amount !== undefined) tx.amount = newAmount;
  if (patch.date !== undefined) tx.date = patch.date;
  if (patch.description !== undefined) tx.description = capLen(patch.description, LEN_NOTE);
  if (patch.category !== undefined) tx.category = ensureCategory(store, patch.category);
  if (patch.accountId !== undefined) tx.accountId = patch.accountId;
  applyTxEffect(store, tx, 1);
  return tx;
}

function deleteTransaction(store, id) {
  const tx = store.transactions.find(t => t.id === id);
  if (!tx) throw new Error('Transacción no encontrada');
  applyTxEffect(store, tx, -1);
  store.transactions = store.transactions.filter(t => t.id !== id);
}

/* ---------------- Pockets ---------------- */
const POCKET_COLORS = ACCOUNT_COLORS;

// Una cuenta solo puede estar "apartada" para un chanchito a la vez.
function assertAccountLinkable(store, accountId, ignorePocketId) {
  if (!accountId) return;
  const acc = store.accounts.find(a => a.id === accountId);
  if (!acc) throw new Error('Cuenta no encontrada');
  if (acc.type === 'tarjeta') throw new Error('No puedes apartar una tarjeta de crédito para una meta');
  const taken = store.pockets.find(p => p.linkedAccountId === accountId && p.id !== ignorePocketId);
  if (taken) throw new Error(`Esa cuenta ya está apartada para la meta "${taken.name}"`);
}

function addPocket(store, { name, balance, rate, target, targetDate, monthlyTarget, linkedAccountId, notifyBehind, color, isPrimary }) {
  if (!name || !name.trim()) throw new Error('El nombre es obligatorio');
  const r = rate ? Number(rate) : null;
  assertAccountLinkable(store, linkedAccountId || null);
  const pocket = {
    id: genId(),
    name: capLen(name, LEN_NAME),
    balance: Number(balance) || 0,
    rate: (r && r > 0) ? r : null,
    lastMonth: currentYYYYMM(),
    target: target ? Number(target) : null,
    targetDate: targetDate || null,
    monthlyTarget: monthlyTarget ? Number(monthlyTarget) : null,
    linkedAccountId: linkedAccountId || null,
    notifyBehind: !!notifyBehind,
    lastNotifiedMonth: null,
    color: POCKET_COLORS.includes(color) ? color : null,
    isPrimary: isPrimary ? true : store.pockets.length === 0,
    contributions: []
  };
  store.pockets.push(pocket);
  return pocket;
}

function updatePocket(store, id, { name, rate, target, targetDate, monthlyTarget, linkedAccountId, notifyBehind, color, isPrimary }) {
  const p = store.pockets.find(x => x.id === id);
  if (!p) throw new Error('Bolsillo no encontrado');
  if (name !== undefined) {
    if (!name.trim()) throw new Error('El nombre es obligatorio');
    p.name = capLen(name, LEN_NAME);
  }
  if (rate !== undefined) {
    const r = rate ? Number(rate) : null;
    p.rate = (r && r > 0) ? r : null;
  }
  if (target !== undefined) p.target = target ? Number(target) : null;
  if (targetDate !== undefined) p.targetDate = targetDate || null;
  if (monthlyTarget !== undefined) p.monthlyTarget = monthlyTarget ? Number(monthlyTarget) : null;
  if (linkedAccountId !== undefined) {
    assertAccountLinkable(store, linkedAccountId || null, p.id);
    p.linkedAccountId = linkedAccountId || null;
  }
  if (notifyBehind !== undefined) p.notifyBehind = !!notifyBehind;
  if (color !== undefined) p.color = POCKET_COLORS.includes(color) ? color : null;
  if (isPrimary === true) {
    store.pockets.forEach(x => { x.isPrimary = (x.id === p.id); });
  }
  return p;
}

function deletePocket(store, id) {
  const idx = store.pockets.findIndex(p => p.id === id);
  if (idx === -1) throw new Error('Bolsillo no encontrado');
  const wasPrimary = store.pockets[idx].isPrimary;
  store.pockets.splice(idx, 1);
  if (wasPrimary && store.pockets.length > 0) store.pockets[0].isPrimary = true;
}

function movePocket(store, id, direction, amount, { date, note } = {}) {
  const p = store.pockets.find(x => x.id === id);
  if (!p) throw new Error('Bolsillo no encontrado');
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  if (direction === 'meter') {
    p.balance += amt;
    if (!p.contributions) p.contributions = [];
    p.contributions.push({ id: genId(), amount: amt, date: date || todayStr(), note: capLen(note, LEN_NOTE) || null });
  } else if (direction === 'sacar') {
    if (amt > p.balance) throw new Error('No hay suficiente saldo en el bolsillo');
    p.balance -= amt;
    if (!p.contributions) p.contributions = [];
    p.contributions.push({ id: genId(), amount: -amt, date: date || todayStr(), note: capLen(note, LEN_NOTE) || null });
  } else {
    throw new Error('Dirección inválida');
  }
  return p;
}

function deletePocketContribution(store, pocketId, contribId) {
  const p = store.pockets.find(x => x.id === pocketId);
  if (!p) throw new Error('Bolsillo no encontrado');
  const idx = (p.contributions || []).findIndex(c => c.id === contribId);
  if (idx === -1) throw new Error('Aporte no encontrado');
  const [removed] = p.contributions.splice(idx, 1);
  p.balance -= removed.amount;
}

/* ---------------- Deudas y compromisos mensuales ---------------- */
const DEUDA_TYPES_VALID = ['agua', 'luz', 'gas', 'internet', 'prestamo', 'alquiler', 'suscripcion', 'otro'];
const LENDER_TYPES = ['banco', 'financiera', 'app', 'persona'];

function addDeuda(store, { name, type, amount, dueDay, accountId, description, variableAmount, autoDebit, lenderType, lenderName, interestRate, principal, remainingBalance, totalInstallments, startDate }) {
  if (!name || !name.trim()) throw new Error('El nombre es obligatorio');
  const t = DEUDA_TYPES_VALID.includes(type) ? type : 'otro';
  const isPrestamo = t === 'prestamo';
  const deuda = {
    id: genId(),
    name: capLen(name, LEN_NAME),
    type: t,
    amount: amount ? Number(amount) : null,
    dueDay: Number(dueDay) || 1,
    accountId: accountId || null,
    description: capLen(description, LEN_NOTE),
    variableAmount: !isPrestamo && !!variableAmount,
    autoDebit: !isPrestamo && !!autoDebit
  };
  if (isPrestamo) {
    deuda.lenderType = LENDER_TYPES.includes(lenderType) ? lenderType : 'banco';
    deuda.lenderName = capLen(lenderName, LEN_NAME) || null;
    deuda.interestRate = interestRate ? Number(interestRate) : null;
    deuda.principal = principal ? Number(principal) : null;
    deuda.remainingBalance = (remainingBalance !== undefined && remainingBalance !== null && remainingBalance !== '')
      ? Number(remainingBalance) : deuda.principal;
    deuda.totalInstallments = totalInstallments ? Number(totalInstallments) : null;
    deuda.paidInstallments = deuda.totalInstallments ? 0 : null;
    deuda.startDate = startDate || todayStr();
  }
  store.deudas.push(deuda);
  return deuda;
}

function updateDeuda(store, id, patch) {
  const d = store.deudas.find(x => x.id === id);
  if (!d) throw new Error('Compromiso no encontrado');
  if (patch.name !== undefined) { if (!patch.name.trim()) throw new Error('El nombre es obligatorio'); d.name = capLen(patch.name, LEN_NAME); }
  if (patch.type !== undefined) d.type = DEUDA_TYPES_VALID.includes(patch.type) ? patch.type : 'otro';
  if (patch.amount !== undefined) d.amount = patch.amount ? Number(patch.amount) : null;
  if (patch.dueDay !== undefined) d.dueDay = Number(patch.dueDay) || 1;
  if (patch.accountId !== undefined) d.accountId = patch.accountId || null;
  if (patch.description !== undefined) d.description = capLen(patch.description, LEN_NOTE);
  if (d.type === 'prestamo') {
    d.variableAmount = false;
    if (patch.lenderType !== undefined) d.lenderType = LENDER_TYPES.includes(patch.lenderType) ? patch.lenderType : 'banco';
    if (patch.lenderName !== undefined) d.lenderName = capLen(patch.lenderName, LEN_NAME) || null;
    if (patch.interestRate !== undefined) d.interestRate = patch.interestRate ? Number(patch.interestRate) : null;
    if (patch.principal !== undefined) d.principal = patch.principal ? Number(patch.principal) : null;
    if (patch.remainingBalance !== undefined) {
      d.remainingBalance = (patch.remainingBalance !== null && patch.remainingBalance !== '') ? Number(patch.remainingBalance) : d.principal;
    }
    if (patch.totalInstallments !== undefined) {
      const n = patch.totalInstallments ? Number(patch.totalInstallments) : null;
      d.totalInstallments = n;
      if (n && !d.paidInstallments) d.paidInstallments = 0;
      if (!n) d.paidInstallments = null;
    }
    if (patch.startDate !== undefined) d.startDate = patch.startDate || d.startDate;
  } else {
    if (patch.variableAmount !== undefined) d.variableAmount = !!patch.variableAmount;
    if (patch.autoDebit !== undefined) d.autoDebit = !!patch.autoDebit;
  }
  return d;
}

function deleteDeuda(store, id) {
  const idx = store.deudas.findIndex(d => d.id === id);
  if (idx === -1) throw new Error('Compromiso no encontrado');
  store.deudaPayments = store.deudaPayments.filter(p => p.deudaId !== id);
  store.deudas.splice(idx, 1);
}

function payDeuda(store, id, { accountId, month, amount } = {}) {
  const d = store.deudas.find(x => x.id === id);
  if (!d) throw new Error('Compromiso no encontrado');
  const monthKey = month || currentYYYYMM();
  if (store.deudaPayments.some(p => p.deudaId === id && p.month === monthKey)) {
    throw new Error('Este compromiso ya fue marcado como pagado este mes');
  }
  const paidAmount = (amount !== undefined && amount !== null && amount !== '') ? Number(amount) : d.amount;
  let txId = null;
  if (paidAmount && accountId) {
    if (!store.accounts.find(a => a.id === accountId)) throw new Error('Cuenta no encontrada');
    const cat = ensureCategory(store, 'Servicios');
    const tx = addTransaction(store, { type: 'gasto', amount: paidAmount, category: cat, description: d.name, accountId });
    txId = tx.id;
  }
  const payment = { id: genId(), deudaId: id, month: monthKey, paidDate: todayStr(), accountId: accountId || null, txId, amount: paidAmount || null };
  store.deudaPayments.push(payment);

  if (d.type === 'prestamo' && paidAmount) {
    if (d.remainingBalance !== null && d.remainingBalance !== undefined) {
      d.remainingBalance = Math.max(0, Math.round((d.remainingBalance - paidAmount) * 100) / 100);
    }
    if (d.totalInstallments) {
      d.paidInstallments = Math.min(d.totalInstallments, (d.paidInstallments || 0) + 1);
    }
  }
  return payment;
}

function unPayDeuda(store, paymentId) {
  const p = store.deudaPayments.find(x => x.id === paymentId);
  if (!p) throw new Error('Pago no encontrado');
  if (p.txId) { try { deleteTransaction(store, p.txId); } catch (_) {} }
  const d = store.deudas.find(x => x.id === p.deudaId);
  if (d && d.type === 'prestamo' && p.amount) {
    if (d.remainingBalance !== null && d.remainingBalance !== undefined) {
      d.remainingBalance = Math.round((d.remainingBalance + p.amount) * 100) / 100;
    }
    if (d.totalInstallments && d.paidInstallments) {
      d.paidInstallments = Math.max(0, d.paidInstallments - 1);
    }
  }
  store.deudaPayments = store.deudaPayments.filter(x => x.id !== paymentId);
}

/* ---------------- Préstamos entre personas (bidireccional) ----------------
 * A diferencia de "deudas" (que asume que el usuario siempre es quien paga a una
 * entidad, con interés/cuotas), esto es un registro simple de dinero entre el
 * usuario y una persona — en cualquier dirección — con un solo vencimiento y sin
 * interés. `direction` decide si el recordatorio dice "paga" o "cobra". */
// returnMode 'cuotas' es solo para direction==='me_deben' (dinero que el usuario
// prestó y que le devuelven en cuotas) — es lo que pide la sección "Préstamos que
// doy"; para 'debo' (yo le debo a una persona) ese caso vive en `deudas` con
// lenderType==='persona', que ya soporta cuotas/interés/tasa.
function addPersonLoan(store, { direction, personName, amount, date, dueDate, note, phone, returnMode, installmentAmount, totalInstallments, reminderFrequency }) {
  if (!personName || !personName.trim()) throw new Error('El nombre de la persona es obligatorio');
  const amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  const dir = direction === 'me_deben' ? 'me_deben' : 'debo';
  const isCuotas = dir === 'me_deben' && returnMode === 'cuotas';
  const loan = {
    id: genId(),
    direction: dir,
    personName: capLen(personName, LEN_NAME),
    amount: amt,
    date: date || todayStr(),
    dueDate: dueDate || null,
    note: capLen(note, LEN_NOTE),
    phone: capLen(phone, LEN_PHONE) || null,
    paid: false,
    paidDate: null,
    returnMode: isCuotas ? 'cuotas' : 'unico',
    installmentAmount: isCuotas && installmentAmount ? Number(installmentAmount) : null,
    totalInstallments: isCuotas && totalInstallments ? Number(totalInstallments) : null,
    reminderFrequency: (dir === 'me_deben' && ['monthly', 'once'].includes(reminderFrequency)) ? reminderFrequency : null
  };
  store.personLoans.push(loan);
  return loan;
}

function updatePersonLoan(store, id, patch) {
  const p = store.personLoans.find(x => x.id === id);
  if (!p) throw new Error('Préstamo no encontrado');
  if (patch.direction !== undefined) p.direction = patch.direction === 'me_deben' ? 'me_deben' : 'debo';
  if (patch.personName !== undefined) {
    if (!patch.personName.trim()) throw new Error('El nombre de la persona es obligatorio');
    p.personName = capLen(patch.personName, LEN_NAME);
  }
  if (patch.amount !== undefined) {
    const amt = Number(patch.amount);
    if (!amt || amt <= 0) throw new Error('Monto inválido');
    p.amount = amt;
  }
  if (patch.date !== undefined) p.date = patch.date || todayStr();
  if (patch.dueDate !== undefined) p.dueDate = patch.dueDate || null;
  if (patch.note !== undefined) p.note = capLen(patch.note, LEN_NOTE);
  if (patch.phone !== undefined) p.phone = capLen(patch.phone, LEN_PHONE) || null;
  if (p.direction === 'me_deben') {
    if (patch.returnMode !== undefined) p.returnMode = patch.returnMode === 'cuotas' ? 'cuotas' : 'unico';
    if (patch.installmentAmount !== undefined) p.installmentAmount = (p.returnMode === 'cuotas' && patch.installmentAmount) ? Number(patch.installmentAmount) : null;
    if (patch.totalInstallments !== undefined) p.totalInstallments = (p.returnMode === 'cuotas' && patch.totalInstallments) ? Number(patch.totalInstallments) : null;
    if (patch.reminderFrequency !== undefined) p.reminderFrequency = ['monthly', 'once'].includes(patch.reminderFrequency) ? patch.reminderFrequency : null;
  }
  return p;
}

function deletePersonLoan(store, id) {
  const idx = store.personLoans.findIndex(x => x.id === id);
  if (idx === -1) throw new Error('Préstamo no encontrado');
  store.personLoans.splice(idx, 1);
}

function personLoanPending(store, id) {
  const p = store.personLoans.find(x => x.id === id);
  if (!p) throw new Error('Préstamo no encontrado');
  const paidSoFar = (store.personLoanPayments || []).filter(x => x.personLoanId === id).reduce((s, x) => s + (x.amount || 0), 0);
  return Math.max(0, Math.round((p.amount - paidSoFar) * 100) / 100);
}

// Saldar de una vez el saldo pendiente de un préstamo entre personas (lo que quede
// después de los abonos parciales ya registrados) — opcionalmente afecta una cuenta
// (si yo pagaba, sale plata de la cuenta; si a mí me pagaban, entra plata a la cuenta).
function settlePersonLoan(store, id, { accountId } = {}) {
  const p = store.personLoans.find(x => x.id === id);
  if (!p) throw new Error('Préstamo no encontrado');
  if (p.paid) throw new Error('Este préstamo ya está saldado');
  const pending = personLoanPending(store, id);
  let txId = null;
  if (accountId && pending > 0) {
    const acc = store.accounts.find(a => a.id === accountId);
    if (!acc) throw new Error('Cuenta no encontrada');
    const cat = ensureCategory(store, 'Préstamos');
    const type = p.direction === 'debo' ? 'gasto' : 'ingreso';
    const desc = p.direction === 'debo' ? `Pago a ${p.personName}` : `Cobro a ${p.personName}`;
    const tx = addTransaction(store, { type, amount: pending, category: cat, description: desc, accountId });
    txId = tx.id;
  }
  p.paid = true;
  p.paidDate = todayStr();
  p.settleTxId = txId;
  return p;
}

// Abono parcial contra un préstamo entre personas — recalcula el saldo pendiente
// (amount - suma de abonos) y, si el abono lo termina de cubrir, marca el préstamo
// como saldado automáticamente (misma idea que las cuotas de un préstamo bancario).
function payPersonLoan(store, id, { amount, date, note, accountId } = {}) {
  const p = store.personLoans.find(x => x.id === id);
  if (!p) throw new Error('Préstamo no encontrado');
  if (p.paid) throw new Error('Este préstamo ya está saldado');
  let amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  const pending = personLoanPending(store, id);
  if (amt > pending) amt = pending;

  let txId = null;
  if (accountId) {
    const acc = store.accounts.find(a => a.id === accountId);
    if (!acc) throw new Error('Cuenta no encontrada');
    const cat = ensureCategory(store, 'Préstamos');
    const type = p.direction === 'debo' ? 'gasto' : 'ingreso';
    const desc = p.direction === 'debo' ? `Abono a ${p.personName}` : `Cobro a ${p.personName}`;
    const tx = addTransaction(store, { type, amount: amt, category: cat, description: desc, accountId });
    txId = tx.id;
  }

  const payment = { id: genId(), personLoanId: id, amount: amt, date: date || todayStr(), note: capLen(note, LEN_NOTE) || null, txId };
  store.personLoanPayments.push(payment);

  if (Math.round((pending - amt) * 100) / 100 <= 0) {
    p.paid = true;
    p.paidDate = todayStr();
  }
  return payment;
}

function unPayPersonLoan(store, paymentId) {
  const p = store.personLoanPayments.find(x => x.id === paymentId);
  if (!p) throw new Error('Abono no encontrado');
  if (p.txId) { try { deleteTransaction(store, p.txId); } catch (_) {} }
  const loan = store.personLoans.find(x => x.id === p.personLoanId);
  if (loan && loan.paid) {
    loan.paid = false;
    loan.paidDate = null;
    loan.settleTxId = null;
  }
  store.personLoanPayments = store.personLoanPayments.filter(x => x.id !== paymentId);
}

// Préstamos entre personas vencidos o por vencer, para el recordatorio de Telegram.
// Como no son mensuales (a diferencia de deudas/reminders), el "una vez por mes" no
// aplica: "soon" y "due" avisan una sola vez cada uno; "overdue" reavisa una vez por
// día mientras siga sin saldar — es justo el "a veces uno se olvida cobrar" pedido.
function checkPersonLoansDue(store, notifyDaysBefore, now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const todayKey = today.toISOString().slice(0, 10);
  const due = [];
  (store.personLoans || []).forEach(p => {
    if (p.paid || !p.dueDate) return;
    const d = new Date(p.dueDate + 'T00:00:00');
    const diffDays = Math.round((d - today) / 86400000);
    if (diffDays === 0 && !p.notifiedDue) {
      due.push({ loan: p, kind: 'due' });
      p.notifiedDue = true;
    } else if (diffDays === notifyDaysBefore && notifyDaysBefore > 0 && !p.notifiedSoon) {
      due.push({ loan: p, kind: 'soon' });
      p.notifiedSoon = true;
    } else if (diffDays < 0 && p.lastOverdueNotify !== todayKey) {
      due.push({ loan: p, kind: 'overdue', daysOverdue: -diffDays });
      p.lastOverdueNotify = todayKey;
    }
  });
  return due;
}

/* ---------------- Compras en cuotas con tarjeta ----------------
 * El monto TOTAL se carga a la deuda de la tarjeta de una vez (así funciona una
 * compra en cuotas real: el banco te descuenta la línea de crédito completa desde
 * el día 1). paidInstallments es solo un contador informativo de a qué cuota vas —
 * marcarla no mueve dinero, porque ese dinero ya está contado en el saldo de la
 * tarjeta desde la compra; lo que sí mueve dinero es pagar la tarjeta (payCard). */
function addCardCharge(store, { cardId, description, totalAmount, totalInstallments, date }) {
  const card = store.accounts.find(a => a.id === cardId && a.type === 'tarjeta');
  if (!card) throw new Error('Tarjeta no encontrada');
  const amt = Number(totalAmount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  const installments = Math.max(1, Math.round(Number(totalInstallments)) || 1);
  const desc = capLen(description, LEN_NOTE) || 'Compra';
  const cat = ensureCategory(store, 'Compras en cuotas');
  const tx = addTransaction(store, {
    type: 'gasto',
    amount: amt,
    category: cat,
    description: installments > 1 ? `${desc} (${installments} cuotas)` : desc,
    accountId: cardId,
    date
  });
  const charge = {
    id: genId(),
    cardId,
    description: desc,
    totalAmount: amt,
    totalInstallments: installments,
    installmentAmount: Math.round((amt / installments) * 100) / 100,
    paidInstallments: 0,
    purchaseDate: date || todayStr(),
    txId: tx.id
  };
  store.cardCharges.push(charge);
  return charge;
}

function deleteCardCharge(store, id) {
  const c = store.cardCharges.find(x => x.id === id);
  if (!c) throw new Error('Compra no encontrada');
  if (c.txId) { try { deleteTransaction(store, c.txId); } catch (_) {} }
  store.cardCharges = store.cardCharges.filter(x => x.id !== id);
}

// Marca la siguiente cuota como transcurrida (solo informativo, no mueve dinero — ver nota arriba).
function markCardChargeInstallment(store, id) {
  const c = store.cardCharges.find(x => x.id === id);
  if (!c) throw new Error('Compra no encontrada');
  if (c.paidInstallments >= c.totalInstallments) throw new Error('Ya se cumplieron todas las cuotas de esta compra');
  c.paidInstallments += 1;
  return c;
}

/* ---------------- Credit card payments ---------------- */
function payCard(store, { cardId, sourceId, amount }) {
  const card = store.accounts.find(a => a.id === cardId && a.type === 'tarjeta');
  if (!card) throw new Error('Tarjeta no encontrada');
  const source = store.accounts.find(a => a.id === sourceId && a.type !== 'tarjeta');
  if (!source) throw new Error('Cuenta de origen no encontrada');
  let amt = Number(amount);
  if (!amt || amt <= 0) throw new Error('Monto inválido');
  if (amt > source.balance) throw new Error('Fondos insuficientes en la cuenta de origen');
  if (amt > card.balance) amt = card.balance;

  source.balance -= amt;
  card.balance -= amt;
  const payment = { id: genId(), cardId, sourceId, amount: amt, date: todayStr() };
  store.cardPayments.push(payment);
  return payment;
}

function deleteCardPayment(store, id) {
  const p = store.cardPayments.find(x => x.id === id);
  if (!p) throw new Error('Pago no encontrado');
  const card = store.accounts.find(a => a.id === p.cardId);
  const source = store.accounts.find(a => a.id === p.sourceId);
  if (card) card.balance += p.amount;
  if (source) source.balance += p.amount;
  store.cardPayments = store.cardPayments.filter(x => x.id !== id);
}

/* ---------------- Asistente de primera configuración ---------------- */
const GENDER_VALID = ['femenino', 'masculino', 'otro', 'prefiero_no_decir'];
const MIN_AGE_YEARS = 18;

function updateProfile(store, patch) {
  if (!store.profile) store.profile = { ownerName: null, birthDate: null, gender: null };
  if (patch.ownerName !== undefined) {
    store.profile.ownerName = capLen(patch.ownerName, LEN_NAME) || null;
  }
  if (patch.birthDate !== undefined) {
    const raw = (patch.birthDate || '').toString().trim();
    if (!raw) {
      store.profile.birthDate = null;
    } else {
      const d = new Date(raw + 'T00:00:00');
      if (isNaN(d.getTime())) throw new Error('Fecha de nacimiento inválida');
      const today = new Date();
      let age = today.getFullYear() - d.getFullYear();
      const hadBirthdayThisYear = (today.getMonth() > d.getMonth()) ||
        (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
      if (!hadBirthdayThisYear) age--;
      if (age < MIN_AGE_YEARS) throw new Error(`Debes tener al menos ${MIN_AGE_YEARS} años para usar NUVA`);
      store.profile.birthDate = raw;
    }
  }
  if (patch.gender !== undefined) {
    const g = (patch.gender || '').toString().trim();
    if (g && !GENDER_VALID.includes(g)) throw new Error('Género inválido');
    store.profile.gender = g || null;
  }
  return store.profile;
}

function completeSetup(store) {
  store.setupCompleted = true;
  return { setupCompleted: true };
}

module.exports = {
  DEFAULT_CATEGORIES, CARD_NETWORKS, LIQUID_TYPES, DEUDA_TYPES_VALID, LENDER_TYPES, ACCOUNT_COLORS,
  GENDER_VALID, MIN_AGE_YEARS,
  genId, todayStr, currentYYYYMM, daysInMonth, formatMoney,
  emptyStore, normalizeStore,
  getSettings, updateSettings,
  updateProfile, completeSetup,
  applyPocketGrowth, applyAccountInterest, applyTxEffect, computeTotals,
  setMonthlyGoal, getMonthProgress,
  addReminder, updateReminder, deleteReminder, checkDueReminders, checkPocketsBehind, payInstallment,
  addAccount, updateAccount, deleteAccount,
  ensureCategory,
  addTransaction, updateTransaction, deleteTransaction,
  addPocket, updatePocket, deletePocket, movePocket, deletePocketContribution,
  payCard, deleteCardPayment,
  addDeuda, updateDeuda, deleteDeuda, payDeuda, unPayDeuda,
  addPersonLoan, updatePersonLoan, deletePersonLoan, settlePersonLoan, checkPersonLoansDue,
  payPersonLoan, unPayPersonLoan, personLoanPending,
  addCardCharge, deleteCardCharge, markCardChargeInstallment
};

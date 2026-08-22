import type { AppState, Deuda, Pocket } from './types';
import type { TabId } from '../components/layout/Sidebar';

// Portado de computeTotals()/computeUpcomingPayments()/pocketMonthProgress() en
// public/js/app.js — misma lógica, sin tocar server/finance.js.

export function formatMoney(n: number): string {
  n = Number(n) || 0;
  const sign = n < 0 ? '-' : '';
  n = Math.abs(n);
  return sign + 'S/ ' + n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function computeTotals(data: AppState) {
  let totalIngresos = 0;
  let totalGastos = 0;
  data.transactions.forEach((tx) => {
    if (tx.type === 'ingreso') totalIngresos += tx.amount;
    else totalGastos += tx.amount;
  });
  const totalDeuda = data.accounts.filter((a) => a.type === 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const totalLiquid = data.accounts.filter((a) => a.type !== 'tarjeta').reduce((s, a) => s + a.balance, 0);
  const totalBolsillos = data.pockets.reduce((s, p) => s + p.balance, 0);
  const totalAhorrado = totalLiquid + totalBolsillos;
  const balance = totalIngresos - totalGastos;
  return { totalIngresos, totalGastos, balance, totalDeuda, totalAhorrado, totalLiquid };
}

export function nextOccurrence(dueDay: number, today: Date): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  const daysInThisMonth = new Date(y, m + 1, 0).getDate();
  let candidate = new Date(y, m, Math.min(dueDay, daysInThisMonth));
  if (candidate < today) {
    const daysInNextMonth = new Date(y, m + 2, 0).getDate();
    candidate = new Date(y, m + 1, Math.min(dueDay, daysInNextMonth));
  }
  return candidate;
}

export interface UpcomingItem {
  name: string;
  amount: number;
  days: number;
  kind: 'reminder' | 'bankloan' | 'servicio' | 'tarjeta' | 'personloan';
  tab: TabId;
}

// A qué pestaña navegar al hacer clic en un ítem del panel de notificaciones —
// portado del `switchTab(item.tab)` de renderNotifPanel() en app.js.
const KIND_TO_TAB: Record<UpcomingItem['kind'], TabId> = {
  reminder: 'calendario',
  bankloan: 'prestamos',
  servicio: 'servicios',
  tarjeta: 'tarjeta',
  personloan: 'prestamos',
};

export function computeUpcomingPayments(data: AppState, daysAhead: number): UpcomingItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthKey = today.toISOString().slice(0, 7);
  const paidDeudaIds = new Set((data.deudaPayments || []).filter((p) => p.month === monthKey).map((p) => p.deudaId));

  const items: UpcomingItem[] = [];

  (data.reminders || []).forEach((r) => {
    const date = nextOccurrence(r.dueDay, today);
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);
    if (days <= daysAhead) items.push({ name: r.name, amount: r.amount || 0, days, kind: 'reminder', tab: KIND_TO_TAB.reminder });
  });

  (data.deudas || []).forEach((d) => {
    const date = nextOccurrence(d.dueDay, today);
    const occMonthKey = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
    if (occMonthKey === monthKey && paidDeudaIds.has(d.id)) return;
    const days = Math.round((date.getTime() - today.getTime()) / 86400000);
    const isPrestamo = d.type === 'prestamo';
    const kind = isPrestamo ? 'bankloan' : 'servicio';
    if (days <= daysAhead) items.push({ name: d.name, amount: d.amount || 0, days, kind, tab: KIND_TO_TAB[kind] });
  });

  data.accounts
    .filter((a) => a.type === 'tarjeta' && a.billingDay)
    .forEach((c) => {
      const date = nextOccurrence(c.billingDay!, today);
      const days = Math.round((date.getTime() - today.getTime()) / 86400000);
      if (days <= daysAhead && c.balance > 0) items.push({ name: 'Tarjeta ' + c.name, amount: c.balance, days, kind: 'tarjeta', tab: KIND_TO_TAB.tarjeta });
    });

  (data.personLoans || [])
    .filter((p) => !p.paid && p.dueDate)
    .forEach((p) => {
      const date = new Date(p.dueDate + 'T00:00:00');
      const days = Math.round((date.getTime() - today.getTime()) / 86400000);
      if (days <= daysAhead) {
        const verbo = p.direction === 'debo' ? 'Pagar a' : 'Cobrar a';
        items.push({ name: `${verbo} ${p.personName}`, amount: p.amount, days, kind: 'personloan', tab: KIND_TO_TAB.personloan });
      }
    });

  items.sort((a, b) => a.days - b.days);
  return items;
}

// Portado de deudaReferenceAmount() en app.js: promedio de los últimos 3 pagos como
// referencia para compromisos de monto variable (agua, luz…), no un valor exacto.
export function deudaReferenceAmount(d: Deuda, payments: AppState['deudaPayments'] = []): number {
  const pays = payments
    .filter((p) => p.deudaId === d.id && p.amount != null)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 3);
  if (pays.length === 0) return d.amount || 0;
  return pays.reduce((s, p) => s + (p.amount || 0), 0) / pays.length;
}

export interface PocketMonthProgress {
  saved: number;
  target: number;
  pct: number | null;
  behind: boolean;
  daysLeft: number;
}

// Portado de pocketMonthProgress() en public/js/app.js.
export function pocketMonthProgress(p: Pocket): PocketMonthProgress {
  const monthKey = new Date().toISOString().slice(0, 7);
  const saved = (p.contributions || []).filter((c) => c.date && c.date.slice(0, 7) === monthKey).reduce((s, c) => s + c.amount, 0);
  const target = p.monthlyTarget || 0;
  const pct = target > 0 ? Math.round((saved / target) * 100) : null;
  const now = new Date();
  const daysInMonthCount = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expectedPct = Math.round((now.getDate() / daysInMonthCount) * 100);
  const behind = target > 0 && now.getDate() >= 5 && (pct ?? 0) < expectedPct - 15;
  return { saved, target, pct, behind, daysLeft: Math.max(0, daysInMonthCount - now.getDate()) };
}

export function pocketsRemainingThisMonth(data: AppState): number {
  const monthKey = new Date().toISOString().slice(0, 7);
  return data.pockets.reduce((s, p) => {
    if (!p.monthlyTarget) return s;
    const saved = (p.contributions || [])
      .filter((c) => c.date && c.date.slice(0, 7) === monthKey)
      .reduce((sum, c) => sum + c.amount, 0);
    return s + Math.max(0, p.monthlyTarget - saved);
  }, 0);
}

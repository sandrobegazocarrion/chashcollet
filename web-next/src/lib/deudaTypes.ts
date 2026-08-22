import type { DeudaType, LenderType, PersonLoan, PersonLoanPayment } from './types';

// Portado de DEUDA_TYPES/DEUDA_TYPE_ICON/DEUDA_TYPE_COLOR_VAR en public/js/app.js.
export const DEUDA_TYPE_LABELS: Record<DeudaType, string> = {
  agua: 'Agua',
  luz: 'Luz / Electricidad',
  gas: 'Gas',
  internet: 'Internet / TV',
  prestamo: 'Préstamo personal',
  alquiler: 'Alquiler',
  suscripcion: 'Suscripción',
  otro: 'Otro',
};
export const DEUDA_TYPE_ICONS: Record<DeudaType, string> = {
  agua: 'ph-drop',
  luz: 'ph-lightning',
  gas: 'ph-fire',
  internet: 'ph-wifi-high',
  prestamo: 'ph-bank',
  alquiler: 'ph-house',
  suscripcion: 'ph-device-mobile',
  otro: 'ph-list',
};
export const DEUDA_TYPE_COLOR_VARS: Record<DeudaType, string> = {
  agua: '--sage',
  luz: '--amber',
  gas: '--red',
  internet: '--lavender',
  prestamo: '--accent2',
  alquiler: '--ochre',
  suscripcion: '--brand',
  otro: '--text-faint',
};
export const LENDER_LABELS: Record<LenderType, string> = { banco: 'Banco', financiera: 'Financiera', app: 'App / Fintech', persona: 'Persona' };

export function deudaTypeColorVar(type: DeudaType): string {
  return DEUDA_TYPE_COLOR_VARS[type] || '--text-faint';
}

export interface Urgency {
  text: string;
  urgent: boolean;
}

function nextOccurrence(dueDay: number, today: Date): Date {
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

// Portado de deudaUrgencyInfo() en app.js.
export function deudaUrgencyInfo(dueDay: number, paid: boolean): Urgency {
  if (paid) return { text: 'Pagado este mes', urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((nextOccurrence(dueDay, today).getTime() - today.getTime()) / 86400000);
  if (days === 0) return { text: 'Vence hoy', urgent: true };
  if (days < 0) return { text: `Vencido hace ${-days} día${-days === 1 ? '' : 's'}`, urgent: true };
  if (days <= 3) return { text: `Vence en ${days} día${days === 1 ? '' : 's'}`, urgent: true };
  return { text: `Vence en ${days} días`, urgent: false };
}

// Portado de personLoanUrgency() en app.js.
export function personLoanUrgency(dueDate: string | null): Urgency {
  if (!dueDate) return { text: 'Sin fecha', urgent: false };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(`${dueDate}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days === 0) return { text: 'Vence hoy', urgent: true };
  if (days < 0) return { text: `Vencido hace ${-days} día${-days === 1 ? '' : 's'}`, urgent: true };
  if (days <= 3) return { text: `Vence en ${days} día${days === 1 ? '' : 's'}`, urgent: true };
  return { text: `Vence en ${days} días`, urgent: false };
}

export interface CollectionStatus {
  label: string;
  tone: 'green' | 'red' | 'muted';
}

// Estado de cobro para "Préstamos que doy" (direction === 'me_deben'): a diferencia
// de personLoanUrgency (una sola fecha), acá se considera también el recordatorio
// mensual recurrente y si ya hay un abono registrado en el ciclo actual.
export function personLoanCollectionStatus(loan: PersonLoan, payments: PersonLoanPayment[]): CollectionStatus {
  if (loan.paid) return { label: 'Saldado', tone: 'green' };
  if (!loan.dueDate) return { label: 'Sin fecha definida', tone: 'muted' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const myPayments = payments.filter((p) => p.personLoanId === loan.id);
  const lastPaymentDate = myPayments.length ? myPayments.map((p) => p.date).sort().slice(-1)[0] : null;

  if (loan.reminderFrequency === 'monthly') {
    const day = Number(loan.dueDate.slice(8, 10));
    const y = today.getFullYear();
    const m = today.getMonth();
    const daysInThisMonth = new Date(y, m + 1, 0).getDate();
    let mostRecentOccurrence = new Date(y, m, Math.min(day, daysInThisMonth));
    if (mostRecentOccurrence > today) {
      const daysInPrevMonth = new Date(y, m, 0).getDate();
      mostRecentOccurrence = new Date(y, m - 1, Math.min(day, daysInPrevMonth));
    }
    const overdue = !lastPaymentDate || new Date(`${lastPaymentDate}T00:00:00`) < mostRecentOccurrence;
    return overdue ? { label: 'Atrasado', tone: 'red' } : { label: 'Al día', tone: 'green' };
  }

  const d = new Date(`${loan.dueDate}T00:00:00`);
  return d < today ? { label: 'Atrasado', tone: 'red' } : { label: 'Al día', tone: 'green' };
}

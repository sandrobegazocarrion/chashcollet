import type { DeudaType, LenderType, PersonLoan, PersonLoanPayment, PersonLoanRelation } from './types';

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

// Relación con quien te debe — importa en Perú porque cobrarle a un familiar no se
// maneja igual que a un conocido. Decorativos, ninguno reutiliza --red (semántico).
export const RELATION_LABELS: Record<PersonLoanRelation, string> = { amigo: 'Amigo', familiar: 'Familiar', conocido: 'Conocido' };
export const RELATION_COLOR_VARS: Record<PersonLoanRelation, string> = { amigo: '--lavender', familiar: '--sage', conocido: '--steel' };

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
  tone: 'green' | 'amber' | 'red' | 'muted';
}

function nextOccurrenceFromDay(day: number, from: Date): Date {
  const y = from.getFullYear();
  const m = from.getMonth();
  const daysInThisMonth = new Date(y, m + 1, 0).getDate();
  let candidate = new Date(y, m, Math.min(day, daysInThisMonth));
  if (candidate < from) {
    const daysInNextMonth = new Date(y, m + 2, 0).getDate();
    candidate = new Date(y, m + 1, Math.min(day, daysInNextMonth));
  }
  return candidate;
}

// Estado de cobro para "Préstamos que doy" (direction === 'me_deben'), en 3 niveles
// (semáforo, mismo lenguaje que el gauge de utilización de tarjeta): verde = al día,
// ámbar = por vencer / atención, rojo = atrasado. A diferencia de personLoanUrgency
// (una sola fecha), acá se considera también el recordatorio mensual recurrente, si
// ya hay un abono registrado en el ciclo actual, y — sin fecha fija — cuánto tiempo
// lleva prestado (30/60 días, la única señal real disponible en ese caso).
export function personLoanCollectionStatus(loan: PersonLoan, payments: PersonLoanPayment[]): CollectionStatus {
  if (loan.paid) return { label: 'Saldado', tone: 'green' };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!loan.dueDate) {
    if (!loan.date) return { label: 'Sin fecha definida', tone: 'muted' };
    const lent = new Date(`${loan.date}T00:00:00`);
    const daysSince = Math.round((today.getTime() - lent.getTime()) / 86400000);
    if (daysSince > 60) return { label: 'Atrasado', tone: 'red' };
    if (daysSince > 30) return { label: 'Por vencer', tone: 'amber' };
    return { label: 'Al día', tone: 'green' };
  }

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
    const paidThisCycle = !!lastPaymentDate && new Date(`${lastPaymentDate}T00:00:00`) >= mostRecentOccurrence;
    if (!paidThisCycle && mostRecentOccurrence < today) return { label: 'Atrasado', tone: 'red' };
    if (!paidThisCycle && mostRecentOccurrence.getTime() === today.getTime()) return { label: 'Vence hoy', tone: 'red' };
    const nextOcc = nextOccurrenceFromDay(day, new Date(today.getTime() + 86400000));
    const daysToNext = Math.round((nextOcc.getTime() - today.getTime()) / 86400000);
    if (daysToNext <= 7) return { label: 'Por vencer', tone: 'amber' };
    return { label: 'Al día', tone: 'green' };
  }

  const d = new Date(`${loan.dueDate}T00:00:00`);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { label: 'Atrasado', tone: 'red' };
  if (days === 0) return { label: 'Vence hoy', tone: 'red' };
  if (days <= 7) return { label: 'Por vencer', tone: 'amber' };
  return { label: 'Al día', tone: 'green' };
}

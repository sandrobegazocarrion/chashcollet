import { nextOccurrence } from './finance';

export type CardZone = 'safe' | 'warn' | 'danger';

export const IDEAL_UTIL_PCT = 30;

// % de la línea usado, sin tope (para poder detectar sobregiro >100% en el gauge).
export function cardUtilization(balance: number, creditLimit: number): number {
  if (creditLimit <= 0) return 0;
  return (balance / creditLimit) * 100;
}

export function cardZone(pct: number): CardZone {
  if (pct < IDEAL_UTIL_PCT) return 'safe';
  if (pct < 60) return 'warn';
  return 'danger';
}

export const ZONE_VAR: Record<CardZone, string> = {
  safe: '--gauge-safe',
  warn: '--gauge-warn',
  danger: '--red',
};

// Cuánto pagar para bajar la deuda al 30% de la línea (el "ideal" recomendado).
export function amountToReachIdeal(balance: number, creditLimit: number): number {
  const target = creditLimit * (IDEAL_UTIL_PCT / 100);
  return Math.max(0, balance - target);
}

// Días que faltan (o pasaron, en negativo) para la próxima ocurrencia de un día del
// mes guardado en la tarjeta (día de corte o de pago) — portado del mismo cálculo de
// "próxima ocurrencia" que usa el calendario de pagos (ver nextOccurrence en finance.ts).
export function daysUntilDay(day: number | null | undefined, today: Date = new Date()): number | null {
  if (!day) return null;
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const date = nextOccurrence(day, t);
  return Math.round((date.getTime() - t.getTime()) / 86400000);
}

export function formatDaysUntil(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `vencido hace ${-days} d`;
  if (days === 0) return 'hoy';
  return `en ${days} día${days === 1 ? '' : 's'}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export interface PayoffProjection {
  /** Interés que se acumula este mes solo por tener la deuda actual, antes de pagar nada. */
  monthlyInterestCost: number;
  /** Pago mínimo para que la deuda no crezca (interés del mes + 1 centavo). */
  minFloor: number;
  /** El pago simulado no alcanza a cubrir ni el interés del mes: la deuda nunca baja. */
  isTrap: boolean;
  /** Meses hasta terminar de pagar, o null si es una trampa (o excede el horizonte de proyección). */
  months: number | null;
  /** Suma de intereses pagados hasta terminar (o hasta el horizonte, si es trampa). */
  totalInterest: number;
  /** Saldo proyectado mes a mes, para graficar. */
  schedule: { month: number; balance: number }[];
}

const MAX_PROJECTION_MONTHS = 60;

// Proyección de amortización con tasa mensual = TCEA/12 (misma convención que ya usa
// el interés de cuentas de ahorro en server/finance.js — no es la capitalización
// efectiva exacta, pero es consistente en toda la app y fácil de explicar).
export function projectCardPayoff(balance: number, annualRatePct: number, monthlyPayment: number): PayoffProjection {
  const monthlyRate = annualRatePct / 100 / 12;
  const monthlyInterestCost = round2(balance * monthlyRate);
  const minFloor = round2(monthlyInterestCost + 0.01);

  if (balance <= 0 || monthlyPayment <= 0 || monthlyPayment <= monthlyInterestCost) {
    return { monthlyInterestCost, minFloor, isTrap: balance > 0, months: null, totalInterest: 0, schedule: [] };
  }

  let bal = balance;
  let totalInterest = 0;
  let month = 0;
  const schedule: { month: number; balance: number }[] = [];
  while (bal > 0.01 && month < MAX_PROJECTION_MONTHS) {
    const interest = bal * monthlyRate;
    totalInterest += interest;
    bal = Math.max(0, bal + interest - monthlyPayment);
    month += 1;
    schedule.push({ month, balance: round2(bal) });
  }
  const paidOff = bal <= 0.01;

  return {
    monthlyInterestCost,
    minFloor,
    isTrap: !paidOff,
    months: paidOff ? month : null,
    totalInterest: round2(totalInterest),
    schedule,
  };
}

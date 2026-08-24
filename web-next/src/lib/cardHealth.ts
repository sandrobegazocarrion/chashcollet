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

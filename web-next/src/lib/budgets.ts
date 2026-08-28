import type { AppState, Budget } from './types';

export interface BudgetHealth {
  pct: number; // sin tope, puede superar 100
  tone: 'green' | 'amber' | 'red';
}

// Mismo lenguaje de semáforo que ya usa el gauge de utilización de tarjeta (Fase 3)
// y el estado de cobro de Préstamos: verde bajo 80%, ámbar 80-100%, rojo si se excede.
export function budgetHealth(pct: number): BudgetHealth['tone'] {
  if (pct < 80) return 'green';
  if (pct <= 100) return 'amber';
  return 'red';
}

export const BUDGET_TONE_VAR: Record<BudgetHealth['tone'], string> = {
  green: '--green',
  amber: '--amber',
  red: '--red',
};

// Cuánto se gastó contra un presupuesto dado, para el período (YYYY-MM) que el
// propio presupuesto declara — se computa siempre desde transactions reales, nunca
// se guarda en el backend, así que jamás queda desincronizado.
export function budgetSpent(data: AppState, budget: Budget): number {
  return data.transactions
    .filter((t) => t.type === 'gasto' && t.date.slice(0, 7) === budget.period)
    .filter((t) => {
      if (budget.type === 'categoria') return t.category === budget.categoryName;
      if (budget.type === 'cuenta') return t.accountId === budget.accountId;
      return true; // 'general'
    })
    .reduce((s, t) => s + t.amount, 0);
}

export function budgetPct(data: AppState, budget: Budget): number {
  if (budget.amountLimit <= 0) return 0;
  return Math.round((budgetSpent(data, budget) / budget.amountLimit) * 100);
}

export function currentPeriod(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// El presupuesto general del mes en curso, si el usuario configuró uno — usado por
// el widget "¿Cómo voy este mes?" de Inicio para reemplazar el promedio histórico
// implícito por un tope real cuando existe.
export function currentGeneralBudget(data: AppState): Budget | null {
  const period = currentPeriod();
  return data.budgets.find((b) => b.type === 'general' && b.period === period) || null;
}

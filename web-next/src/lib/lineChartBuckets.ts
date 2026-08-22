import type { AppState } from './types';

export type LineChartMode = 'month' | 'week' | 'day';

export interface LineChartBuckets {
  labels: string[];
  ingresos: number[];
  gastos: number[];
}

// Portado de lineChartBuckets() en app.js: 'month' = últimos 6 meses; 'week'/'day'
// acotan al mes actual.
export function computeLineChartBuckets(data: AppState, mode: LineChartMode): LineChartBuckets {
  const now = new Date();

  if (mode === 'month') {
    const map: Record<string, { ingreso: number; gasto: number }> = {};
    data.transactions.forEach((tx) => {
      const key = tx.date ? tx.date.slice(0, 7) : now.toISOString().slice(0, 7);
      (map[key] ||= { ingreso: 0, gasto: 0 })[tx.type] += tx.amount;
    });
    const keys = Object.keys(map).sort().slice(-6);
    const labels = keys.map((k) => {
      const [y, m] = k.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
    });
    return { labels, ingresos: keys.map((k) => map[k].ingreso), gastos: keys.map((k) => map[k].gasto) };
  }

  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const monthTx = data.transactions.filter((tx) => (tx.date || '').slice(0, 7) === monthKey);

  if (mode === 'day') {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const map: Record<number, { ingreso: number; gasto: number }> = {};
    for (let d = 1; d <= daysInMonth; d++) map[d] = { ingreso: 0, gasto: 0 };
    monthTx.forEach((tx) => {
      const day = Number(tx.date.slice(8, 10));
      if (map[day]) map[day][tx.type] += tx.amount;
    });
    const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
    return { labels: keys.map(String), ingresos: keys.map((d) => map[d].ingreso), gastos: keys.map((d) => map[d].gasto) };
  }

  // week: hasta 5 semanas de 7 días dentro del mes actual
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const numWeeks = Math.ceil(daysInMonth / 7);
  const map: Record<number, { ingreso: number; gasto: number }> = {};
  for (let w = 1; w <= numWeeks; w++) map[w] = { ingreso: 0, gasto: 0 };
  monthTx.forEach((tx) => {
    const day = Number(tx.date.slice(8, 10));
    const week = Math.ceil(day / 7);
    if (map[week]) map[week][tx.type] += tx.amount;
  });
  const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
  return { labels: keys.map((w) => `Sem ${w}`), ingresos: keys.map((w) => map[w].ingreso), gastos: keys.map((w) => map[w].gasto) };
}

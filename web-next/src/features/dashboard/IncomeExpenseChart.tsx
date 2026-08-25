import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '../../components/ui/Card';
import { computeLineChartBuckets, type LineChartMode } from '../../lib/lineChartBuckets';
import { formatMoney } from '../../lib/finance';
import { ChartEmptyState } from './ChartEmptyState';
import type { AppState } from '../../lib/types';

const W = 560;
const H = 200;
const PAD = 24;
const EASE = [0.16, 1, 0.3, 1] as const;

function buildPath(values: number[], max: number): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const step = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const points = values.map((v, i) => {
    const x = PAD + i * step;
    const y = max > 0 ? H - PAD - (v / max) * (H - PAD * 2) : H - PAD;
    return [x, y] as const;
  });
  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${points[points.length - 1][0].toFixed(1)},${H - PAD} L${points[0][0].toFixed(1)},${H - PAD} Z`;
  return { line, area };
}

// Espeja .chart-card (Ingresos vs. gastos): SVG en vez de Chart.js — sin dependencia
// extra, misma info (línea + área, toggle mes/semana/día, leyenda con puntos).
export function IncomeExpenseChart({ data }: { data: AppState }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<LineChartMode>('month');
  const { labels, ingresos, gastos } = computeLineChartBuckets(data, mode);
  const max = Math.max(1, ...ingresos, ...gastos);
  const ing = buildPath(ingresos, max);
  const gas = buildPath(gastos, max);
  const totalIng = ingresos.reduce((s, v) => s + v, 0);
  const totalGas = gastos.reduce((s, v) => s + v, 0);

  return (
    <Card className="min-h-[320px]">
      <h2 className="mb-3 text-sm font-bold text-[var(--text)]">Ingresos vs. gastos</h2>

      {/* Totales del periodo visible, en grande — no solo la forma de la línea. */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-[var(--radius-control)] border border-[var(--border-flat)] bg-[var(--surface-raised)] p-3">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--green)]" /> Ingresos
          </span>
          <p className="num mt-1 text-xl font-extrabold text-[var(--green)]">{formatMoney(totalIng)}</p>
        </div>
        <div className="rounded-[var(--radius-control)] border border-[var(--border-flat)] bg-[var(--surface-raised)] p-3">
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--red)]" /> Gastos
          </span>
          <p className="num mt-1 text-xl font-extrabold text-[var(--red)]">{formatMoney(totalGas)}</p>
        </div>
      </div>

      <div className="mb-2.5 inline-flex rounded-[11px] border border-[var(--border)] bg-[var(--surface-raised)] p-[3px]">
        {(['month', 'week', 'day'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-lg px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
              mode === m ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm' : 'text-[var(--text-muted)]'
            }`}
          >
            {m === 'month' ? '6 meses' : m === 'week' ? 'Por semana' : 'Por día'}
          </button>
        ))}
      </div>

      {data.transactions.length === 0 ? (
        <ChartEmptyState icon="ph-chart-line" message="Aún no hay transacciones para graficar." />
      ) : labels.length < 2 ? (
        // Con un solo punto (ej. un usuario nuevo con movimientos en un único mes) el
        // path del SVG queda como un solo "M" sin ningún "L" — no dibuja nada visible,
        // aunque técnicamente "hay datos". Mejor mostrar un empty-state explícito que
        // dejar el área en blanco sin explicación.
        <ChartEmptyState icon="ph-chart-line" message="Con más movimientos aquí verás tu tendencia de ingresos y gastos." />
      ) : (
        <div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Ingresos y gastos">
            <defs>
              <linearGradient id="ing-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--green)" stopOpacity="0.18" />
                <stop offset="100%" stopColor="var(--green)" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="gas-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--red)" stopOpacity="0.14" />
                <stop offset="100%" stopColor="var(--red)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.path
              key={`ing-area-${mode}`}
              d={ing.area}
              fill="url(#ing-fill)"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.7 }}
            />
            <motion.path
              key={`gas-area-${mode}`}
              d={gas.area}
              fill="url(#gas-fill)"
              initial={reduceMotion ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.7 }}
            />
            <motion.path
              key={`ing-line-${mode}`}
              d={ing.line}
              fill="none"
              stroke="var(--green)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: EASE }}
            />
            <motion.path
              key={`gas-line-${mode}`}
              d={gas.line}
              fill="none"
              stroke="var(--red)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={reduceMotion ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, delay: reduceMotion ? 0 : 0.1, ease: EASE }}
            />
          </svg>
          <div className="mt-1 flex justify-between text-[10.5px] text-[var(--text-faint)]">
            {labels.map((l, i) => {
              // Con muchas etiquetas (modo día, hasta 31) mostrar todas amontona el
              // eje — se muestra 1 de cada N, siempre incluyendo la última.
              const skip = labels.length > 12 ? Math.ceil(labels.length / 8) : 1;
              if (i % skip !== 0 && i !== labels.length - 1) return null;
              return (
                <span key={i} title={`${formatMoney(ingresos[i])} / ${formatMoney(gastos[i])}`}>
                  {l}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}

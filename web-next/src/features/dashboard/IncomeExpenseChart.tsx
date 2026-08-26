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

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Barras agrupadas (ingreso/gasto lado a lado por periodo) en vez de línea+área:
// mejor comparación directa y no se deforma sin importar cuántos periodos entren
// (día llega a mostrar hasta 31 grupos).
function buildBars(ingresos: number[], gastos: number[], max: number): { ing: Bar[]; gas: Bar[] } {
  const n = ingresos.length;
  if (n === 0) return { ing: [], gas: [] };
  const groupW = (W - PAD * 2) / n;
  const barW = Math.max(2, Math.min(16, groupW * 0.3));
  const gap = barW * 0.3;
  const baseline = H - PAD;
  const scale = (v: number) => (max > 0 ? (v / max) * (H - PAD * 2) : 0);

  const ing: Bar[] = [];
  const gas: Bar[] = [];
  for (let i = 0; i < n; i++) {
    const cx = PAD + i * groupW + groupW / 2;
    const hIng = scale(ingresos[i]);
    const hGas = scale(gastos[i]);
    ing.push({ x: cx - gap / 2 - barW, y: baseline - hIng, width: barW, height: hIng });
    gas.push({ x: cx + gap / 2, y: baseline - hGas, width: barW, height: hGas });
  }
  return { ing, gas };
}

// Espeja .chart-card (Ingresos vs. gastos): SVG en vez de Chart.js — sin dependencia
// extra, misma info (línea + área, toggle mes/semana/día, leyenda con puntos).
export function IncomeExpenseChart({ data }: { data: AppState }) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<LineChartMode>('month');
  const { labels, ingresos, gastos } = computeLineChartBuckets(data, mode);
  const max = Math.max(1, ...ingresos, ...gastos);
  const { ing, gas } = buildBars(ingresos, gastos, max);
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
            <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="var(--border-flat)" strokeWidth="1" />
            {ing.map((b, i) => (
              <motion.rect
                key={`ing-${mode}-${i}`}
                x={b.x}
                width={b.width}
                rx={2}
                fill="var(--green)"
                initial={reduceMotion ? false : { y: H - PAD, height: 0 }}
                animate={{ y: b.y, height: b.height }}
                transition={{ duration: 0.55, delay: reduceMotion ? 0 : 0.1 + i * 0.02, ease: EASE }}
              />
            ))}
            {gas.map((b, i) => (
              <motion.rect
                key={`gas-${mode}-${i}`}
                x={b.x}
                width={b.width}
                rx={2}
                fill="var(--red)"
                initial={reduceMotion ? false : { y: H - PAD, height: 0 }}
                animate={{ y: b.y, height: b.height }}
                transition={{ duration: 0.55, delay: reduceMotion ? 0 : 0.14 + i * 0.02, ease: EASE }}
              />
            ))}
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

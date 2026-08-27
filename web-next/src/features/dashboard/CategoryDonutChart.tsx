import { motion, useReducedMotion } from 'framer-motion';
import { Card } from '../../components/ui/Card';
import { formatMoney } from '../../lib/finance';
import { ChartEmptyState } from './ChartEmptyState';
import type { AppState } from '../../lib/types';

// Espeja .donut-wrap (Gastos por categoría): conic-gradient de CSS en vez de
// Chart.js — mismo total al centro + leyenda con porcentajes. Los segmentos usan
// una rampa de violetas de marca (posición en el ranking, no identidad de
// categoría) en vez de los colores semánticos de categoryColor.ts — esos quedan
// reservados para badges/iconos de transacciones en el resto de la app.
const EASE = [0.16, 1, 0.3, 1] as const;
const VIOLET_RAMP = [
  'var(--chart-violet-1)',
  'var(--chart-violet-2)',
  'var(--chart-violet-3)',
  'var(--chart-violet-4)',
  'var(--chart-violet-5)',
  'var(--chart-violet-6)',
];

export function CategoryDonutChart({ data }: { data: AppState }) {
  const reduceMotion = useReducedMotion();
  const catMap: Record<string, number> = {};
  data.transactions.forEach((tx) => {
    if (tx.type !== 'gasto') return;
    catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
  });
  const cats = Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]);
  const total = cats.reduce((s, c) => s + catMap[c], 0);
  const colorFor = (i: number) => VIOLET_RAMP[i % VIOLET_RAMP.length];

  let acc = 0;
  const stops = cats.map((c, i) => {
    const pct = total > 0 ? (catMap[c] / total) * 100 : 0;
    const from = acc;
    acc += pct;
    return `${colorFor(i)} ${from}% ${acc}%`;
  });

  return (
    <Card className="flex h-full min-h-[320px] flex-col">
      <h2 className="mb-3.5 text-sm font-bold text-[var(--text)]">Gastos por categoría</h2>
      {cats.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center">
          <ChartEmptyState icon="ph-chart-donut" message="Aún no hay gastos para graficar." />
        </div>
      ) : (
        // Layout siempre apilado (nunca en fila): esta tarjeta vive en una grilla de 2
        // columnas dentro de un contenido con max-w-5xl y una columna de Objetivos de
        // 270px al lado, así que su ancho real nunca alcanza para donut + leyenda en
        // fila — usar un breakpoint de viewport (xl:) para eso desbordaba el contenido
        // sin importar cuán ancha estuviera la ventana, porque el viewport no es el
        // ancho real de la tarjeta.
        <div className="flex flex-1 flex-col items-center justify-center gap-5">
          <motion.div
            className="relative h-[164px] w-[164px] shrink-0 rounded-full"
            style={{ background: `conic-gradient(${stops.join(', ')})` }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.75, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-[var(--surface)] text-center">
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Total</span>
              <span className="num text-sm font-extrabold text-[var(--text)]">{formatMoney(total)}</span>
            </div>
          </motion.div>
          <ul className="flex w-full max-w-xs flex-col gap-2">
            {cats.map((c, i) => {
              const pct = total > 0 ? Math.round((catMap[c] / total) * 100) : 0;
              return (
                <motion.li
                  key={c}
                  className="flex items-center gap-2 text-xs text-[var(--text-muted)]"
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.35, delay: reduceMotion ? 0 : 0.35 + i * 0.05, ease: EASE }}
                >
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: colorFor(i) }} />
                  <span className="min-w-0 flex-1 truncate">{c}</span>
                  <b className="num shrink-0 text-xs font-bold text-[var(--text)]">{formatMoney(catMap[c])}</b>
                  <span className="w-8 shrink-0 text-right text-[11px] text-[var(--text-faint)]">{pct}%</span>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}
    </Card>
  );
}

import { motion, useReducedMotion } from 'framer-motion';

export interface BarItem {
  label: string;
  value: number;
  /** Color explícito (ej. `var(--brand)`). Si se omite, se deriva del signo del
      valor: positivo = verde, negativo = rojo, cero = neutro — nunca un color
      decorativo arbitrario para un valor que no es positivo/negativo real. */
  color?: string;
}

interface BarChartProps {
  items: BarItem[];
  orientation?: 'vertical' | 'horizontal';
  /** Alto total en vertical, o alto de cada fila en horizontal. */
  height?: number;
  showLabels?: boolean;
  showValues?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

function colorForValue(item: BarItem): string {
  if (item.color) return item.color;
  if (item.value > 0) return 'var(--green)';
  if (item.value < 0) return 'var(--red)';
  return 'var(--brand)';
}

// Primitiva de barras (verticales u horizontales) en SVG/CSS puro. Reemplaza la
// barra segmentada naranja/roja/gris de Historial con la misma paleta violeta/
// verde/rojo del resto de la app. No se conecta a ninguna pantalla en esta
// fase — solo queda lista para las siguientes.
//
// Uso — barras verticales (ej. tendencia mes a mes):
//   <BarChart items={months.map((m) => ({ label: m.label, value: m.total }))} height={120} />
//
// Uso — barras horizontales con color explícito (ej. desglose por categoría):
//   <BarChart
//     orientation="horizontal"
//     items={cats.map((c) => ({ label: c.name, value: c.amount, color: `var(${categoryColorVar(c.name)})` }))}
//     formatValue={formatMoney}
//   />
export function BarChart({
  items,
  orientation = 'vertical',
  height = 120,
  showLabels = true,
  showValues = false,
  formatValue = (v) => String(v),
  className = '',
}: BarChartProps) {
  const reduceMotion = useReducedMotion();
  if (items.length === 0) return null;

  const max = Math.max(...items.map((i) => Math.abs(i.value)), 1);

  if (orientation === 'horizontal') {
    return (
      <div className={`flex flex-col gap-2.5 ${className}`}>
        {items.map((item, i) => {
          const pct = (Math.abs(item.value) / max) * 100;
          return (
            <div key={i} className="flex items-center gap-3">
              {showLabels && <span className="w-20 shrink-0 truncate text-xs text-[var(--text-muted)]">{item.label}</span>}
              <div className="h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                <motion.div
                  className="h-full rounded-[var(--radius-pill)]"
                  style={{ background: colorForValue(item) }}
                  initial={reduceMotion ? false : { width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.6, delay: reduceMotion ? 0 : i * 0.05, ease: EASE }}
                />
              </div>
              {showValues && <span className="num w-16 shrink-0 text-right text-xs font-semibold text-[var(--text)]">{formatValue(item.value)}</span>}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-end gap-2" style={{ height }}>
        {items.map((item, i) => {
          const barH = Math.max(3, (Math.abs(item.value) / max) * height);
          return (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              {showValues && <span className="num text-[10px] text-[var(--text-faint)]">{formatValue(item.value)}</span>}
              <motion.div
                className="w-full rounded-t-[4px]"
                style={{ background: colorForValue(item) }}
                initial={reduceMotion ? false : { height: 0 }}
                animate={{ height: barH }}
                transition={{ duration: 0.5, delay: reduceMotion ? 0 : i * 0.05, ease: EASE }}
              />
            </div>
          );
        })}
      </div>
      {showLabels && (
        <div className="mt-1.5 flex gap-2">
          {items.map((item, i) => (
            <span key={i} className="flex-1 truncate text-center text-[10.5px] text-[var(--text-faint)]">
              {item.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

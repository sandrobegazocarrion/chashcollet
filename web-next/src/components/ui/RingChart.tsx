import { useMemo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

export interface RingSegment {
  /** 0-100. Todos los segmentos de un RingChart deben sumar <= 100. */
  pct: number;
  /** Color CSS válido — normalmente `var(--algo)`, nunca un hex suelto. */
  color: string;
  label?: string;
}

interface RingChartProps {
  /** Un solo segmento = gauge simple (ej. "% usado"). Varios = donut tipo
      "gastos por categoría". El resto del círculo (100 - suma) queda en `trackColor`. */
  segments: RingSegment[];
  size?: number;
  strokeWidth?: number;
  trackColor?: string;
  /** Puntas redondeadas (gauge) vs. cuadradas (donut de varios segmentos, para que
      no se vean huecos entre segmentos contiguos). Default: redondeado solo si hay
      un único segmento. */
  rounded?: boolean;
  children?: ReactNode;
  className?: string;
}

const EASE = [0.16, 1, 0.3, 1] as const;

// Primitiva de anillo/dona en SVG puro (stroke-dasharray por segmento, sin
// dependencias de gráficos). Reemplaza: el velocímetro de aguja de Tarjetas de
// crédito (un solo segmento, "% de línea usado") y unifica el donut de "Gastos
// por categoría" (varios segmentos). No se conecta a ninguna pantalla en esta
// fase — solo queda lista para las siguientes.
//
// Uso — gauge simple:
//   <RingChart segments={[{ pct: 46, color: 'var(--amber)' }]} size={72}>
//     <span className="num text-sm font-bold">46%</span>
//   </RingChart>
//
// Uso — donut de varios segmentos:
//   <RingChart
//     segments={cats.map((c) => ({ pct: c.pct, color: `var(${categoryColorVar(c.name)})` }))}
//     size={164}
//     rounded={false}
//   >
//     <span className="text-xs text-[var(--text-faint)]">Total</span>
//     <span className="num text-sm font-bold">{formatMoney(total)}</span>
//   </RingChart>
export function RingChart({
  segments,
  size = 72,
  strokeWidth = 8,
  trackColor = 'var(--border)',
  rounded,
  children,
  className = '',
}: RingChartProps) {
  const reduceMotion = useReducedMotion();
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;
  const useRoundCaps = rounded ?? segments.length <= 1;

  const arcs = useMemo(() => {
    let acc = 0;
    return segments.map((seg) => {
      const from = acc;
      acc += seg.pct;
      return { ...seg, from, to: acc };
    });
  }, [segments]);

  return (
    <div className={`relative shrink-0 ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={strokeWidth} />
        {arcs.map((seg, i) => {
          const segLen = (seg.pct / 100) * c;
          const offset = c - (seg.from / 100) * c;
          return (
            <motion.circle
              key={i}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeLinecap={useRoundCaps ? 'round' : 'butt'}
              strokeDasharray={`${segLen} ${c - segLen}`}
              transform={`rotate(-90 ${cx} ${cy})`}
              initial={reduceMotion ? false : { strokeDashoffset: c }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 0.9, delay: reduceMotion ? 0 : 0.15 + i * 0.08, ease: EASE }}
            />
          );
        })}
      </svg>
      {children && <div className="num absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>}
    </div>
  );
}

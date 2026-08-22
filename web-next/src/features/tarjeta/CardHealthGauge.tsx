import { IDEAL_UTIL_PCT, cardZone, ZONE_VAR } from '../../lib/cardHealth';

interface CardHealthGaugeProps {
  pct: number; // puede superar 100 (sobregiro) — se clampa solo para el dibujo
  simulatedPct?: number | null;
}

// Geometría exacta del prototipo (Main.dc.html): viewBox 180×106, cx90/cy86/r72.
const CX = 90;
const CY = 86;
const R = 72;
const STROKE = 13;

function polar(cx: number, cy: number, r: number, pct: number) {
  const clamped = Math.min(100, Math.max(0, pct));
  const angleDeg = 180 - (clamped / 100) * 180;
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(fromPct: number, toPct: number, r: number) {
  const start = polar(CX, CY, r, fromPct);
  const end = polar(CX, CY, r, toPct);
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 0 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

// Velocímetro semicircular 0-100% con 3 zonas fijas (verde/ámbar/rojo) y marca en el
// 30% "ideal". Sin librería de gráficos — SVG a mano, mismo criterio que el resto del
// Panel (donut de categorías, línea de ingresos/gastos).
export function CardHealthGauge({ pct, simulatedPct }: CardHealthGaugeProps) {
  const clamped = Math.min(100, Math.max(0, pct));
  const zone = cardZone(pct);
  const zoneColor = `var(${ZONE_VAR[zone]})`;
  const needle = polar(CX, CY, R - 18, clamped);
  const tickInner = polar(CX, CY, R - 7, IDEAL_UTIL_PCT);
  const tickOuter = polar(CX, CY, R + 9, IDEAL_UTIL_PCT);

  const hasSim = simulatedPct != null && !Number.isNaN(simulatedPct);
  const simNeedle = hasSim ? polar(CX, CY, R - 18, simulatedPct!) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 180 106" className="w-full max-w-[230px]">
        <path d={arcPath(0, 100, R)} stroke="var(--surface-raised)" strokeWidth={STROKE} fill="none" strokeLinecap="round" />
        <path d={arcPath(0, IDEAL_UTIL_PCT, R)} stroke="var(--gauge-safe)" strokeWidth={STROKE} fill="none" opacity={0.92} />
        <path d={arcPath(IDEAL_UTIL_PCT, 60, R)} stroke="var(--gauge-warn)" strokeWidth={STROKE} fill="none" opacity={0.92} />
        <path d={arcPath(60, 100, R)} stroke="var(--brand)" strokeWidth={STROKE} fill="none" opacity={0.92} />

        {/* Marca en 30% "ideal" */}
        <line
          x1={tickInner.x}
          y1={tickInner.y}
          x2={tickOuter.x}
          y2={tickOuter.y}
          stroke="var(--text)"
          strokeWidth={2}
          strokeDasharray="1 3"
          strokeLinecap="round"
        />

        {/* Aguja simulada (fantasma), si hay una simulación de pago activa */}
        {hasSim && simNeedle && (
          <line x1={CX} y1={CY} x2={simNeedle.x} y2={simNeedle.y} stroke="var(--text-faint)" strokeWidth={2} strokeDasharray="3 3" strokeLinecap="round" />
        )}

        <circle cx={CX} cy={CY} r={6} fill="var(--text)" />
        {/* Aguja real */}
        <line x1={CX} y1={CY} x2={needle.x} y2={needle.y} stroke="var(--text)" strokeWidth={4} strokeLinecap="round" />
      </svg>

      <div className="-mt-1 flex flex-col items-center">
        <span className="num text-3xl font-extrabold tracking-tight" style={{ color: zoneColor }}>
          {Math.round(pct)}%
        </span>
        <span className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Utilización de línea</span>
        {hasSim && (
          <span className="num mt-1 text-xs font-semibold text-[var(--text-muted)]">
            Simulado: <span style={{ color: `var(${ZONE_VAR[cardZone(simulatedPct!)]})` }}>{Math.round(simulatedPct!)}%</span>
          </span>
        )}
      </div>

      <p className="mt-3 max-w-[240px] text-center text-xs leading-relaxed text-[var(--text-muted)]">
        Ideal: mantener el uso bajo 30% para cuidar tu historial crediticio.
      </p>
    </div>
  );
}

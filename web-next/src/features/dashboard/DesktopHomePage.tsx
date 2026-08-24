import { useMemo, useState } from 'react';
import { computeTotals, formatDate, formatMoney } from '../../lib/finance';
import { computeLineChartBuckets } from '../../lib/lineChartBuckets';
import { Mascot } from '../../components/brand/Mascot';
import { MonthlyRing } from './MonthlyRing';
import type { AppState } from '../../lib/types';
import type { TabId } from '../../components/layout/Sidebar';

type Period = '7D' | '1M' | '3M' | '1A' | 'Todo';
const PERIODS: Period[] = ['7D', '1M', '3M', '1A', 'Todo'];

// Fase "Metas y Mascota" (desktop, >=1024px) — reconstrucción 1:1 del artboard
// aprobado: https://claude.ai/code/artifact/5cddac23-367b-4855-9969-41dde7b6fc03
// (Main.dc.html). Datos reales de `data` en todo — nada inventado; donde el
// artboard mostraba algo sin equivalente real (4 metas de ejemplo) se usa el
// estado vacío real de la cuenta en vez de placeholders.
export function DesktopHomePage({ data, onGoTab }: { data: AppState; onGoTab: (tab: TabId) => void }) {
  const totals = computeTotals(data);
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let monthIn = 0;
  let monthOut = 0;
  data.transactions.forEach((tx) => {
    if (!tx.date || tx.date.slice(0, 7) !== monthKey) return;
    if (tx.type === 'ingreso') monthIn += tx.amount;
    else monthOut += tx.amount;
  });
  const monthNet = monthIn - monthOut;

  const [period, setPeriod] = useState<Period>('1M');
  const dayBuckets = useMemo(() => computeLineChartBuckets(data, 'day'), [data]);
  const monthBuckets = useMemo(() => computeLineChartBuckets(data, 'month'), [data]);
  const netSeries = useMemo(() => {
    if (period === '7D') {
      const net = dayBuckets.ingresos.map((v, i) => v - dayBuckets.gastos[i]);
      return net.slice(-7);
    }
    if (period === '1M') return dayBuckets.ingresos.map((v, i) => v - dayBuckets.gastos[i]);
    // 3M/1A/Todo: el bucket mensual real disponible (hasta 6 meses de historial) —
    // sin inventar rango que la data no tiene.
    return monthBuckets.ingresos.map((v, i) => v - monthBuckets.gastos[i]);
  }, [period, dayBuckets, monthBuckets]);
  const { path: trendPath, last: trendLast } = buildSmoothPath(netSeries);

  const goals = data.pockets;
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 4);

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: 'var(--font-ui-d2)' }}>
      {/* ROW 1 */}
      <div className="flex items-stretch gap-4">
        <div
          className="relative flex-[1.5] overflow-hidden rounded-[26px] border p-6"
          style={{ background: 'linear-gradient(135deg,#F0EEFF 0%,#F7F6FF 100%)', borderColor: '#ECE8FF', boxShadow: 'var(--d2-card-shadow)' }}
        >
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[12.5px] font-medium text-[#6B6A78]">Total en tu cuenta</p>
              <p className="num mt-1.5 text-[29px] font-semibold text-[var(--d2-ink)]">{formatMoney(totals.totalLiquid)}</p>
              <p className={`num mt-1 text-xs font-semibold ${monthNet >= 0 ? 'text-[var(--d2-green)]' : 'text-[var(--d2-red)]'}`}>
                <i className={`ph ${monthNet >= 0 ? 'ph-arrow-up' : 'ph-arrow-down'}`} aria-hidden="true" /> {monthNet >= 0 ? '+' : ''}
                {formatMoney(monthNet)} este mes
              </p>
            </div>
            <div className="flex shrink-0 gap-0.5 rounded-full border border-[#ECE8FF] bg-white p-[3px]">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  className={`rounded-full px-2.5 py-1.5 text-[10px] font-semibold ${p === period ? 'bg-[var(--d2-ink)] text-white' : 'text-[var(--d2-muted)]'}`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mt-5 h-[78px]">
            <svg width="100%" height="78" viewBox="0 0 480 78" preserveAspectRatio="none" className="absolute left-0 top-0 block" aria-hidden="true">
              <path d={trendPath} fill="none" stroke="var(--d2-accent)" strokeWidth="2.4" strokeLinecap="round" />
              {trendLast && <circle cx={trendLast[0]} cy={trendLast[1]} r="4" fill="var(--d2-accent)" />}
            </svg>
            {trendLast && (
              <div
                className="num absolute whitespace-nowrap rounded-[9px] bg-[var(--d2-ink)] px-2 py-1 text-[9.5px] font-semibold text-white"
                style={{ left: `${Math.min(78, (trendLast[0] / 480) * 100)}%`, top: -6, transform: 'translateX(-50%)' }}
              >
                {formatMoney(netSeries[netSeries.length - 1] ?? 0)} · Hoy
              </div>
            )}

            {/* Barras crecientes + mascota — firma de marca, sin datos detrás. */}
            <div className="absolute bottom-0 right-0 flex items-end gap-1.5">
              <span className="w-[11px] rounded-t-[5px]" style={{ height: 18, background: 'linear-gradient(180deg,#D3CDFF,#AFA6FF)' }} />
              <span className="w-[11px] rounded-t-[5px]" style={{ height: 29, background: 'linear-gradient(180deg,#B3AAFF,#8B82FA)' }} />
              <span className="w-[11px] rounded-t-[5px]" style={{ height: 41, background: 'linear-gradient(180deg,#9A90FF,#6D64F2)' }} />
              <span className="relative w-[11px] rounded-t-[5px]" style={{ height: 55, background: 'linear-gradient(180deg,#8078F5,#5B53E8)' }}>
                <span className="sparkle absolute h-1.5 w-1.5" style={{ top: -38, left: -8 }} />
                <Mascot pose="chart" className="absolute bottom-[52px] left-1/2 -translate-x-1/2" />
              </span>
            </div>
          </div>

          <div className="mt-3.5 flex gap-2">
            {[
              { icon: 'ph-arrow-down', label: 'Ingresar' },
              { icon: 'ph-arrow-up', label: 'Gasto' },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => onGoTab('transacciones')}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-[13px] border border-[#ECE8FF] bg-white px-1 py-2.5"
              >
                <i className={`ph ${a.icon} text-[14px] text-[var(--d2-ink)]`} aria-hidden="true" />
                <span className="text-[10px] font-medium text-[var(--d2-muted-2)]">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 rounded-[26px] border border-[var(--d2-border)] bg-white p-5" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <MonthlyRing ingresos={monthIn} gastos={monthOut} ahorro={monthNet} meta={data.monthlyGoal} onSetGoal={() => onGoTab('configuracion')} />
        </div>
      </div>

      {/* ROW 2 */}
      <div className="flex flex-1 gap-4">
        <div className="flex flex-[1.3] flex-col rounded-[26px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] font-bold text-[var(--d2-ink)]">Tus metas</p>
            <button type="button" onClick={() => onGoTab('chanchitos')} className="text-[11.5px] font-semibold text-[var(--d2-accent)]">
              Ver todas →
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
              <Mascot pose="sidebar" />
              <p className="text-[12.5px] font-semibold text-[var(--d2-ink)]">Aún no tienes metas activas</p>
              <p className="max-w-[220px] text-[11.5px] leading-relaxed text-[var(--d2-muted)]">Crea tu primera meta y empieza a ver tu progreso acá.</p>
              <button type="button" onClick={() => onGoTab('chanchitos')} className="mt-1 rounded-full bg-[var(--d2-ink)] px-4 py-2 text-[11.5px] font-semibold text-white">
                Crear mi primera meta
              </button>
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              {goals.slice(0, 4).map((g, i) => {
                const tone = GOAL_TONES[i % GOAL_TONES.length];
                const pct = g.target && g.target > 0 ? Math.max(0, Math.min(100, (g.balance / g.target) * 100)) : 0;
                return (
                  <div key={g.id} className="flex flex-col gap-2 rounded-2xl border border-[var(--d2-border)] p-3.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: tone.bg }}>
                      <i className={`ph ${goalIcon(g.name)} text-[15px]`} style={{ color: tone.fg }} aria-hidden="true" />
                    </span>
                    <p className="truncate text-[12.5px] font-semibold text-[var(--d2-ink)]">{g.name}</p>
                    <p className="num text-[11px] text-[var(--d2-muted)]">
                      {formatMoney(g.balance)} / {g.target ? formatMoney(g.target) : '—'}
                    </p>
                    <div className="h-1.5 rounded-full bg-[#F0EFF3]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.fg }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col rounded-[26px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] font-bold text-[var(--d2-ink)]">Últimos movimientos</p>
            <button type="button" onClick={() => onGoTab('transacciones')} className="text-[11.5px] font-semibold text-[var(--d2-accent)]">
              Ver todos →
            </button>
          </div>
          <div className="mt-2 flex flex-col">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-[var(--d2-muted)]">Todavía no hay movimientos.</p>
            ) : (
              recent.map((tx, i) => {
                const isIncome = tx.type === 'ingreso';
                const initial = (tx.description || tx.category || '?').charAt(0).toUpperCase();
                return (
                  <div key={tx.id} className={`flex items-center justify-between py-2.5 ${i < recent.length - 1 ? 'border-b border-[#F3F2F5]' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                        style={isIncome ? { background: 'var(--d2-accent-tint)', color: 'var(--d2-accent-dark)' } : { background: '#F0F0F3', color: '#6B6B76' }}
                      >
                        {initial}
                      </span>
                      <div>
                        <p className="text-[12.5px] font-medium text-[var(--d2-ink)]">{tx.description || tx.category}</p>
                        <p className="text-[10.5px] text-[#B4B2BA]">
                          {tx.category} · {formatDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <span className={`num text-[12.5px] font-semibold ${isIncome ? 'text-[var(--d2-green)]' : 'text-[var(--d2-red)]'}`}>
                      {isIncome ? '+' : '-'}
                      {formatMoney(tx.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ROW 3 */}
      <div className="flex gap-4">
        <div className="flex-1 rounded-[26px] border border-[var(--d2-border)] bg-white p-5" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <p className="text-[13px] font-bold text-[var(--d2-ink)]">Accesos rápidos</p>
          <div className="mt-3 flex gap-2.5">
            {[
              { icon: 'ph-target', label: 'Mis metas', tab: 'chanchitos' as TabId },
              { icon: 'ph-squares-four', label: 'Categorías', tab: 'transacciones' as TabId },
              { icon: 'ph-chart-bar', label: 'Reportes', tab: 'calendario' as TabId },
              { icon: 'ph-gear-six', label: 'Ajustes', tab: 'configuracion' as TabId },
            ].map((a) => (
              <button key={a.label} type="button" onClick={() => onGoTab(a.tab)} className="flex flex-1 flex-col items-center gap-1.5 rounded-[13px] bg-[#F7F7F9] px-1 py-3">
                <i className={`ph ${a.icon} text-base text-[var(--d2-ink)]`} aria-hidden="true" />
                <span className="text-[10px] font-medium text-[var(--d2-muted-2)]">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {goals.length === 0 && (
          <div
            className="relative flex flex-1 items-center justify-between overflow-hidden rounded-[26px] border p-[22px]"
            style={{ background: '#EAF6EF', borderColor: '#DFF0E6', boxShadow: 'var(--d2-card-shadow)' }}
          >
            <div className="relative z-[1] max-w-[200px]">
              <p className="text-[15px] font-extrabold text-[var(--d2-ink)]">Ahorra hoy, disfruta mañana</p>
              <p className="mt-1 text-[11.5px] text-[#5C6B62]">Cada sol cuenta. ¡Tú puedes!</p>
              <button
                type="button"
                onClick={() => onGoTab('chanchitos')}
                className="mt-3 flex items-center gap-1 rounded-full bg-[var(--d2-ink)] px-4 py-2 text-[11.5px] font-semibold text-white"
              >
                Crear nueva meta
                <i className="ph ph-arrow-right text-xs" aria-hidden="true" />
              </button>
            </div>
            <Mascot pose="banner" />
          </div>
        )}
      </div>
    </div>
  );
}

const GOAL_TONES = [
  { bg: '#E4F4EC', fg: 'var(--d2-green)' },
  { bg: '#E6EEFB', fg: 'var(--d2-blue)' },
  { bg: '#FBEDE0', fg: 'var(--d2-orange)' },
  { bg: '#E4F4EC', fg: 'var(--d2-green)' },
];

function goalIcon(name: string): string {
  const n = name.toLowerCase();
  if (/(viaje|playa|vacacion)/.test(n)) return 'ph-airplane-tilt';
  if (/(laptop|compu|tech|celular|equipo)/.test(n)) return 'ph-laptop';
  if (/(emergencia|fondo)/.test(n)) return 'ph-shield-check';
  if (/(ropa|accesorio)/.test(n)) return 'ph-t-shirt';
  return 'ph-flag-banner';
}

// Curva suave tipo Catmull-Rom -> Bezier a través de los puntos de la serie, en el
// mismo viewBox (480x78) del artboard aprobado. La línea ocupa solo los primeros
// ~365px de los 480 (el resto es el espacio de las barras crecientes + mascota,
// que viven ancladas a la derecha). Sin ejes/grid a propósito.
function buildSmoothPath(values: number[]): { path: string; last: readonly [number, number] | null } {
  if (values.length === 0) return { path: '', last: null };
  const W = 365;
  const H = 78;
  const PAD_Y = 10;
  if (values.length === 1) {
    const y = H / 2;
    return { path: `M0,${y} L${W},${y}`, last: [W, y] };
  }
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
    return [x, y] as const;
  });
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const midX = (x0 + x1) / 2;
    d += ` C${midX.toFixed(1)},${y0.toFixed(1)} ${midX.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return { path: d, last: pts[pts.length - 1] };
}

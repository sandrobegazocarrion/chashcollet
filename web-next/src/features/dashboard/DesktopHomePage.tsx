import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { computeTotals, computeUpcomingPayments, formatMoney } from '../../lib/finance';
import { computeLineChartBuckets } from '../../lib/lineChartBuckets';
import { categoryColorVar } from '../../lib/categoryColor';
import { apiCall } from '../../lib/api';
import { CATEGORY_ICONS } from '../transacciones/TransaccionesPage';
import { SAVINGS_TIPS, todaysTipIndex } from '../../lib/tips';
import type { AppState } from '../../lib/types';
import type { TabId } from '../../components/layout/Sidebar';

// Fase 2 ("panel de widgets", >=1024px) — reconstrucción 1:1 del artboard "Web"
// aprobado: https://claude.ai/code/artifact/5cddac23-367b-4855-9969-41dde7b6fc03
// (Main.dc.html). Sin ilustraciones/mascota a propósito — panel denso 100% de
// datos reales; donde el artboard no tiene un dato real detrás (racha de
// ahorro) se omite en vez de inventar un número.
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
  const savingsRate = monthIn > 0 ? Math.round((monthNet / monthIn) * 100) : null;
  const goalPct = data.monthlyGoal ? Math.max(0, Math.min(100, Math.round((monthNet / data.monthlyGoal) * 100))) : null;

  const dayBuckets = useMemo(() => computeLineChartBuckets(data, 'day'), [data]);
  const monthBuckets = useMemo(() => computeLineChartBuckets(data, 'month'), [data]);
  const netByMonth = monthBuckets.ingresos.map((v, i) => v - monthBuckets.gastos[i]);
  const trendPct = useMemo(() => {
    if (netByMonth.length < 2) return null;
    const prev = netByMonth[netByMonth.length - 2];
    const cur = netByMonth[netByMonth.length - 1];
    if (prev === 0) return null;
    return Math.round(((cur - prev) / Math.abs(prev)) * 100);
  }, [netByMonth]);
  const { path: trendPath } = buildSmoothPath(netByMonth);

  const todayStr = now.toISOString().slice(0, 10);
  const todaySpend = data.transactions.filter((tx) => tx.type === 'gasto' && tx.date === todayStr).reduce((s, t) => s + t.amount, 0);
  const last7Gastos = dayBuckets.gastos.slice(-7);
  const maxDay = Math.max(1, ...last7Gastos);

  const monthCatMap: Record<string, number> = {};
  data.transactions.forEach((tx) => {
    if (tx.type !== 'gasto' || tx.date.slice(0, 7) !== monthKey) return;
    monthCatMap[tx.category] = (monthCatMap[tx.category] || 0) + tx.amount;
  });
  const topCats = Object.keys(monthCatMap).sort((a, b) => monthCatMap[b] - monthCatMap[a]);
  const topCatsBars = topCats.slice(0, 3);
  const maxCat = Math.max(1, ...topCatsBars.map((c) => monthCatMap[c]));

  const upcoming = computeUpcomingPayments(data, Infinity);
  const urgent = upcoming.find((i) => i.days <= 2) || upcoming[0];

  const { data: linkStatus } = useQuery({
    queryKey: ['telegram-link-status'],
    queryFn: () => apiCall<{ linked: boolean }>('GET', '/api/telegram/link-status'),
  });
  const linked = !!linkStatus?.linked;

  const [tipDismissed, setTipDismissed] = useState(false);
  const tipText = SAVINGS_TIPS[todaysTipIndex()].replace(/^\p{Emoji}\s*/u, '');

  return (
    <div className="flex flex-col gap-3" style={{ fontFamily: 'var(--font-ui-d2)' }}>
      {/* ROW 1 */}
      <div className="flex gap-2.5">
        {/* Cuenta principal */}
        <div className="flex flex-[1.6] flex-col justify-between rounded-[28px] border border-[var(--d2-border)] bg-white p-6" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div>
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-[var(--d2-ink)]">Cuenta principal</p>
              <span className="flex items-center gap-1 rounded-full bg-[var(--d2-bg)] px-2.5 py-[5px] text-[10.5px] font-semibold text-[var(--d2-muted-2)]">
                Este mes
                <i className="ph ph-caret-down text-[9px]" aria-hidden="true" />
              </span>
            </div>
            <p className="mt-4 text-[11px] text-[var(--d2-muted)]">Balance disponible</p>
            <p className="num mt-1 text-[27px] font-semibold text-[var(--d2-ink)]">{formatMoney(totals.totalLiquid)}</p>
          </div>
          <div className="mt-4 flex gap-2.5">
            <button type="button" onClick={() => onGoTab('transacciones')} className="flex-1 rounded-[13px] bg-[var(--d2-ink)] py-3 text-xs font-semibold text-white">
              Ingresar
            </button>
            <button type="button" onClick={() => onGoTab('transacciones')} className="flex-1 rounded-[13px] border border-[var(--d2-border)] bg-white py-3 text-xs font-semibold text-[var(--d2-ink)]">
              Gasto
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-[var(--d2-divider)] pt-3.5">
            <p className="text-[11px] text-[var(--d2-muted)]">
              {goalPct === null ? (
                'Sin meta de ahorro definida'
              ) : (
                <>
                  Meta de ahorro <span className="num font-semibold text-[var(--d2-ink)]">{goalPct}%</span>
                </>
              )}
            </p>
            <button type="button" onClick={() => onGoTab(goalPct === null ? 'configuracion' : 'chanchitos')} className="text-[11px] font-semibold text-[var(--d2-accent)]">
              {goalPct === null ? 'Definir →' : 'Ver detalle →'}
            </button>
          </div>
        </div>

        {/* Ingresos / Gastos */}
        <div className="flex flex-[1.05] flex-col justify-between rounded-[28px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--d2-green-tint)]">
                <i className="ph ph-arrow-up text-sm text-[var(--d2-green)]" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-semibold text-[var(--d2-muted)]">Este mes</span>
            </div>
            <p className="mt-2.5 text-[10.5px] text-[var(--d2-muted)]">Ingresos totales</p>
            <p className="num mt-0.5 text-base font-semibold text-[var(--d2-ink)]">{formatMoney(monthIn)}</p>
          </div>
          <div className="my-3.5 h-px bg-[var(--d2-divider)]" />
          <div>
            <div className="flex items-center justify-between">
              <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--d2-accent-tint-2)]">
                <i className="ph ph-arrow-down text-sm text-[var(--d2-accent)]" aria-hidden="true" />
              </span>
              <span className="text-[10px] font-semibold text-[var(--d2-muted)]">Este mes</span>
            </div>
            <p className="mt-2.5 text-[10.5px] text-[var(--d2-muted)]">Gastos totales</p>
            <p className="num mt-0.5 text-base font-semibold text-[var(--d2-ink)]">{formatMoney(monthOut)}</p>
          </div>
        </div>

        {/* Bot Telegram / Tasa de ahorro */}
        <div className="flex flex-[0.68] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onGoTab('configuracion')}
            className="flex flex-1 flex-col items-center justify-center gap-2 rounded-[28px] border border-[var(--d2-border)] bg-white p-3"
            style={{ boxShadow: 'var(--d2-card-shadow)' }}
          >
            <i className="ph ph-paper-plane-tilt text-lg text-[var(--d2-accent)]" aria-hidden="true" />
            <span className="text-center text-[10px] font-semibold text-[var(--d2-muted-2)]">Bot Telegram</span>
          </button>
          <div className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[28px] bg-[var(--d2-ink)]">
            {savingsRate === null ? (
              <button type="button" onClick={() => onGoTab('transacciones')} className="flex flex-col items-center gap-1 px-2 text-center">
                <i className="ph ph-piggy-bank text-lg text-white/50" aria-hidden="true" />
                <span className="text-[8.5px] leading-tight text-white/50">Registra ingresos para ver tu tasa</span>
              </button>
            ) : (
              <>
                <div className="relative h-14 w-14">
                  <svg width="56" height="56" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="11" />
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="var(--d2-accent)"
                      strokeWidth="11"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.max(0, Math.min(100, savingsRate)) * 2.639} 263.9`}
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="num absolute inset-0 flex items-center justify-center text-[12.5px] font-bold text-white">{savingsRate}%</div>
                </div>
                <p className="mt-1 text-center text-[9px] font-semibold text-white/65">Tasa de ahorro</p>
              </>
            )}
          </div>
        </div>

        {/* Por categoría (racha de ahorro omitida: sin dato real todavía) */}
        <div className="flex flex-[0.85] flex-col gap-2.5">
          <div className="flex flex-1 flex-col justify-center rounded-[28px] border border-[var(--d2-border)] bg-white p-3.5" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
            <p className="text-[9.5px] text-[var(--d2-muted)]">Por categoría</p>
            {topCatsBars.length === 0 ? (
              <p className="mt-2 text-[9.5px] text-[var(--d2-muted)]">Sin gastos este mes.</p>
            ) : (
              <div className="mt-2 flex h-7 items-end gap-[5px]">
                {topCatsBars.map((c, i) => (
                  <span
                    key={c}
                    title={c}
                    className="w-[9px] rounded-t-[3px]"
                    style={{ height: `${Math.max(12, (monthCatMap[c] / maxCat) * 100)}%`, background: i === 0 ? 'var(--d2-accent)' : 'var(--d2-track)' }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Ingresos vs gastos — tendencia */}
        <div className="flex flex-[1.35] flex-col justify-between rounded-[28px] border border-[var(--d2-border)] bg-white p-6" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <i className="ph ph-trend-up text-[15px] text-[var(--d2-accent)]" aria-hidden="true" />
              <span className="text-xs font-medium text-[var(--d2-muted)]">Ingresos vs. gastos</span>
            </span>
            {trendPct !== null && (
              <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-bold ${trendPct >= 0 ? 'bg-[var(--d2-accent-tint)] text-[var(--d2-accent-dark)]' : 'bg-[var(--d2-orange-tint)] text-[var(--d2-orange)]'}`}>
                {trendPct >= 0 ? '+' : ''}
                {trendPct}%
              </span>
            )}
          </div>
          <p className="num mt-2.5 text-[22px] font-semibold text-[var(--d2-ink)]">
            {monthNet >= 0 ? '+' : ''}
            {formatMoney(monthNet)}
          </p>
          <svg width="100%" height="52" viewBox="0 0 260 52" preserveAspectRatio="none" className="mt-2.5 block">
            <path d={trendPath} fill="none" stroke="var(--d2-accent)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>
        </div>
      </div>

      {/* ROW 2 */}
      <div className="flex gap-2.5">
        {/* Así vas este mes */}
        <div className="flex flex-1 flex-col rounded-[28px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-bold text-[var(--d2-ink)]">Así vas este mes</p>
            <span className="rounded-full bg-[var(--d2-bg)] px-2.5 py-[5px] text-[10px] font-semibold text-[var(--d2-muted-2)]">
              {MONTHS_ES[now.getMonth()]}
            </span>
          </div>
          <div className="mt-2 flex flex-1 items-center justify-center">
            <div className="relative h-[164px] w-[164px]">
              <div className="absolute inset-0 rounded-full bg-[#F5F3FF]" />
              <div className="absolute inset-[27px] rounded-full bg-[#DCD5FF]" />
              <div className="absolute inset-[56px] rounded-full bg-[var(--d2-accent)]" />
              <p className="num absolute inset-x-0 top-2 text-center text-[10.5px] font-semibold text-[var(--d2-muted-2)]">{formatMoney(monthIn)}</p>
              <p className="num absolute inset-x-0 top-[34px] text-center text-[10.5px] font-semibold text-[var(--d2-accent-dark)]">{formatMoney(monthOut)}</p>
              <p className="num absolute inset-x-0 top-[76px] text-center text-[11px] font-bold text-white">
                {monthNet >= 0 ? '+' : ''}
                {formatMoney(monthNet)}
              </p>
            </div>
          </div>
        </div>

        {/* Actividad reciente */}
        <div className="flex flex-[1.6] flex-col rounded-[28px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => onGoTab('transacciones')} className="flex flex-1 items-center gap-2 rounded-full bg-[var(--d2-bg)] px-3.5 py-[9px] text-left">
              <i className="ph ph-magnifying-glass text-[13px] text-[var(--d2-muted)]" aria-hidden="true" />
              <span className="text-[11.5px] text-[var(--d2-muted)]">Buscar movimiento…</span>
            </button>
            <button type="button" onClick={() => onGoTab('transacciones')} className="whitespace-nowrap rounded-full bg-[var(--d2-ink)] px-3.5 py-2 text-[11px] font-semibold text-white">
              Todos
            </button>
            <button type="button" onClick={() => onGoTab('transacciones')} className="whitespace-nowrap rounded-full bg-[var(--d2-bg)] px-3.5 py-2 text-[11px] font-semibold text-[var(--d2-muted-2)]">
              Ingresos
            </button>
            <button type="button" onClick={() => onGoTab('transacciones')} className="whitespace-nowrap rounded-full bg-[var(--d2-bg)] px-3.5 py-2 text-[11px] font-semibold text-[var(--d2-muted-2)]">
              Gastos
            </button>
          </div>

          <div className="mt-4 flex flex-1 gap-3">
            <div className="flex flex-1 flex-col justify-between rounded-[18px] border border-[var(--d2-border)] p-3.5">
              <div className="flex h-8 items-end gap-[3px]">
                {last7Gastos.map((v, i) => (
                  <span
                    key={i}
                    className="w-[3px] rounded-sm"
                    style={{ height: `${Math.max(10, (v / maxDay) * 100)}%`, background: v === maxDay && v > 0 ? 'var(--d2-accent)' : 'var(--d2-track)' }}
                  />
                ))}
              </div>
              <div>
                <p className="num mt-2 text-sm font-semibold text-[var(--d2-ink)]">{formatMoney(todaySpend)}</p>
                <p className="mt-0.5 text-[9.5px] text-[var(--d2-muted)]">Gasto de hoy</p>
              </div>
            </div>

            <div className="flex-1 rounded-[18px] border border-[var(--d2-border)] p-3.5">
              <p className="mb-2 text-[11px] font-bold text-[var(--d2-ink)]">Categorías</p>
              {topCats.length === 0 ? (
                <p className="text-[10.5px] text-[var(--d2-muted)]">Sin gastos este mes.</p>
              ) : (
                topCats.slice(0, 3).map((c) => (
                  <div key={c} className="flex items-center gap-2 py-[5px]">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px]" style={{ background: `color-mix(in srgb, var(${categoryColorVar(c)}) 15%, transparent)` }}>
                      <i className={`ph ${CATEGORY_ICONS[c] || 'ph-credit-card'} text-[10px]`} style={{ color: `var(${categoryColorVar(c)})` }} aria-hidden="true" />
                    </span>
                    <span className="text-[10.5px] text-[var(--d2-muted-3)]">{c}</span>
                  </div>
                ))
              )}
            </div>

            {!linked && (
              <button
                type="button"
                onClick={() => onGoTab('configuracion')}
                className="flex flex-1 flex-col justify-between rounded-[18px] border border-[var(--d2-border)] p-3.5 text-left"
                style={{ background: 'var(--d2-accent-tint-2)' }}
              >
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-white">
                  <i className="ph ph-paper-plane-tilt text-[13px] text-[var(--d2-accent)]" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-[11px] font-bold text-[var(--d2-ink)]">Conecta tu bot</span>
                  <span className="mt-0.5 block text-[9.5px] leading-snug text-[var(--d2-muted-2)]">Registra gastos por Telegram.</span>
                  <span className="mt-2 inline-block rounded-full bg-[var(--d2-ink)] px-3 py-[7px] text-[10px] font-semibold text-white">Conectar</span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Vence pronto / Consejo del día */}
        <div className="flex flex-[0.85] flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onGoTab(urgent?.tab || 'calendario')}
            className="flex flex-1 flex-col justify-center gap-1.5 rounded-[28px] border border-[var(--d2-border)] bg-white p-4 text-left"
            style={{ boxShadow: 'var(--d2-card-shadow)' }}
          >
            <span className="flex items-center gap-2">
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[var(--d2-orange-tint)]">
                <i className="ph ph-clock text-[13px] text-[var(--d2-orange)]" aria-hidden="true" />
              </span>
              <span className="text-[10.5px] font-bold text-[var(--d2-ink)]">Vence pronto</span>
            </span>
            <span className="text-[10px] leading-snug text-[var(--d2-muted-2)]">
              {!urgent
                ? 'No tienes pagos pendientes declarados.'
                : urgent.days < 0
                  ? `${urgent.name} vencido hace ${-urgent.days} día${-urgent.days === 1 ? '' : 's'} · `
                  : urgent.days === 0
                    ? `${urgent.name} vence hoy · `
                    : `${urgent.name} vence en ${urgent.days} día${urgent.days === 1 ? '' : 's'} · `}
              {urgent && <span className="num font-semibold text-[var(--d2-ink)]">{formatMoney(urgent.amount)}</span>}
            </span>
            <span className="text-[10px] font-semibold text-[var(--d2-accent)]">Ir al calendario →</span>
          </button>

          {!tipDismissed && (
            <div className="relative flex-1 rounded-[28px] border border-[var(--d2-border)] bg-white p-4" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
              <button
                type="button"
                onClick={() => setTipDismissed(true)}
                aria-label="Descartar consejo"
                className="absolute right-3.5 top-3.5 text-[var(--d2-muted)]"
              >
                <i className="ph ph-x text-[10px]" aria-hidden="true" />
              </button>
              <p className="text-[10px] font-semibold text-[var(--d2-muted)]">Consejo del día</p>
              <p className="mt-1.5 max-w-[85%] text-[10.5px] leading-snug text-[var(--d2-ink)]">{tipText}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MONTHS_ES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Curva suave tipo Catmull-Rom -> Bezier, viewBox 260x52 (igual al artboard aprobado).
function buildSmoothPath(values: number[]): { path: string } {
  if (values.length === 0) return { path: '' };
  const W = 260;
  const H = 52;
  const PAD_Y = 6;
  if (values.length === 1) {
    const y = H / 2;
    return { path: `M0,${y} L${W},${y}` };
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
  return { path: d };
}

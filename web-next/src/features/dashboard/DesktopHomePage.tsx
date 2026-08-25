import { useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { computeTotals, formatMoney, pocketsRemainingThisMonth } from '../../lib/finance';
import { computeLineChartBuckets } from '../../lib/lineChartBuckets';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { ActivityFeed } from './ActivityFeed';
import type { AppState } from '../../lib/types';
import type { SubViewType } from './SubView';

interface DesktopHomePageProps {
  data: AppState;
  onOpenSubView: (type: SubViewType) => void;
  onNewGoal: () => void;
  onOpenGoals: () => void;
}

// Réplica del layout de referencia que pasó el usuario: mismo sidebar/header de
// siempre (sin cambios), pero el contenido de Inicio en desktop (>=1024px) pasa a
// un grid de 9 tarjetas más denso. Reutiliza toda la lógica real ya existente
// (StatsRow/MonthCompareCard/IncomeExpenseChart/CategoryDonutChart/ActivityFeed)
// y solo se construyen de cero las piezas nuevas: gauge circular, sparkline de
// tasa de ahorro, tarjeta de presupuesto y tarjeta compacta de meta.
export function DesktopHomePage({ data, onOpenSubView, onNewGoal, onOpenGoals }: DesktopHomePageProps) {
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

  const pocketsRemaining = pocketsRemainingThisMonth(data);
  const safeToSpend = totals.totalLiquid - totals.totalDeuda - pocketsRemaining;
  const availablePct = totals.totalLiquid > 0 ? Math.max(0, Math.min(100, Math.round((safeToSpend / totals.totalLiquid) * 100))) : 0;

  const monthBuckets = useMemo(() => computeLineChartBuckets(data, 'month'), [data]);
  const dayBuckets = useMemo(() => computeLineChartBuckets(data, 'day'), [data]);

  // Tasa de ahorro de meses anteriores (mismos buckets que "Ingresos vs. gastos"),
  // para el sparkline y el "vs. mes anterior" — sin inventar historial que no existe.
  const monthRates = monthBuckets.ingresos.map((ing, i) => (ing > 0 ? Math.round(((ing - monthBuckets.gastos[i]) / ing) * 100) : null));
  const prevRate = monthRates.length >= 2 ? monthRates[monthRates.length - 2] : null;
  const rateDelta = savingsRate !== null && prevRate !== null ? savingsRate - prevRate : null;

  // "Balance de hoy" real, reconstruido hacia atrás desde el líquido actual con el
  // flujo neto diario de los últimos 30 días — no hay snapshots históricos de saldo
  // guardados, así que esta es la única forma honesta de trazar una tendencia.
  const trendPoints = useMemo(() => {
    const nets = dayBuckets.ingresos.slice(-30).map((v, i) => v - dayBuckets.gastos.slice(-30)[i]);
    let running = totals.totalLiquid;
    const points = [running];
    for (let i = nets.length - 1; i >= 0; i--) {
      running -= nets[i];
      points.unshift(running);
    }
    return points;
  }, [dayBuckets, totals.totalLiquid]);

  // "Presupuesto" implícito = promedio de gasto de los últimos meses completos
  // (sin contar el actual, que sigue en curso) — no existe un campo real de
  // presupuesto en la app, así que se deriva 100% de gastos históricos reales.
  const pastMonthsGastos = monthBuckets.gastos.slice(0, -1).filter((_, i) => monthBuckets.ingresos[i] > 0 || monthBuckets.gastos[i] > 0);
  const avgBudget = pastMonthsGastos.length > 0 ? pastMonthsGastos.reduce((s, v) => s + v, 0) / pastMonthsGastos.length : null;
  const budgetPct = avgBudget && avgBudget > 0 ? Math.round((monthOut / avgBudget) * 100) : null;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  const monthTotal = monthIn + monthOut;
  const inPct = monthTotal > 0 ? Math.round((monthIn / monthTotal) * 100) : 50;
  const outPct = 100 - inPct;
  const monthLabel = now.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  const mainGoal = data.pockets[0];
  const goalPct = mainGoal && mainGoal.target && mainGoal.target > 0 ? Math.max(0, Math.min(100, Math.round((mainGoal.balance / mainGoal.target) * 100))) : 0;
  const goalRemaining = mainGoal && mainGoal.target ? Math.max(0, mainGoal.target - mainGoal.balance) : 0;

  return (
    <div className="flex flex-col gap-4">
      {/* ROW 1 */}
      <div className="flex items-stretch gap-4">
        <Card className="flex flex-[1.6] flex-col justify-between">
          <div className="flex items-start justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <i className="ph ph-wallet" aria-hidden="true" /> Lo que tengo
            </p>
            <span className="flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--text-muted)]">
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </span>
          </div>
          <p className="num mt-2 text-4xl font-extrabold tracking-tight text-[var(--text)]">{formatMoney(totals.totalLiquid)}</p>
          <span
            className={`num mt-3 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12px] font-bold ${
              monthNet >= 0 ? 'bg-[var(--green)]/[0.14] text-[var(--green)]' : 'bg-[var(--red)]/[0.12] text-[var(--red)]'
            }`}
          >
            <i className={`ph ${monthNet >= 0 ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
            {monthNet >= 0 ? '+' : ''}
            {formatMoney(monthNet)} · Flujo neto de este mes
          </span>
          <TrendMini points={trendPoints} label={formatMoney(totals.totalLiquid)} />
        </Card>

        <Card className="flex flex-1 flex-col justify-between">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <i className="ph ph-wallet" aria-hidden="true" /> Balance disponible
          </p>
          <div className="mt-2 flex items-end justify-between gap-2">
            <div>
              <p className={`num text-2xl font-extrabold ${safeToSpend >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{formatMoney(safeToSpend)}</p>
              <p className="mt-1 text-[11.5px] text-[var(--text-muted)]">Disponible para usar</p>
            </div>
            <RingGauge pct={availablePct} colorVar="--green" size={54} />
          </div>
        </Card>

        <Card className="flex flex-1 flex-col justify-between">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <i className="ph ph-piggy-bank" aria-hidden="true" /> Tasa de ahorro
          </p>
          {savingsRate === null ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-faint)]">Registra ingresos este mes para ver tu tasa de ahorro.</p>
          ) : (
            <>
              <p className="num mt-1 text-3xl font-extrabold text-[var(--brand)]">{savingsRate}%</p>
              {rateDelta !== null && (
                <p className={`num mt-1 text-[11.5px] font-semibold ${rateDelta >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  <i className={`ph ${rateDelta >= 0 ? 'ph-arrow-up' : 'ph-arrow-down'}`} aria-hidden="true" /> {Math.abs(rateDelta)}% vs. mes anterior
                </p>
              )}
            </>
          )}
          <Sparkline values={monthRates.filter((v): v is number => v !== null)} />
        </Card>
      </div>

      {/* ROW 2 */}
      <div className="flex items-stretch gap-4">
        <Card className="flex flex-[1.3] flex-col">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <i className="ph ph-calendar-blank" aria-hidden="true" /> Resumen de {monthLabel}
            </p>
            <button
              type="button"
              onClick={() => onOpenSubView('balance')}
              className={`num text-sm font-extrabold ${monthNet >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}
            >
              {monthNet >= 0 ? '+' : ''}
              {formatMoney(monthNet)}
            </button>
          </div>
          <div className="mt-3 flex justify-between text-sm">
            <button type="button" onClick={() => onOpenSubView('ingresos')} className="text-left">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Ingresos</p>
              <p className="num text-base font-extrabold text-[var(--green)]">{formatMoney(monthIn)}</p>
            </button>
            <button type="button" onClick={() => onOpenSubView('gastos')} className="text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Gastos</p>
              <p className="num text-base font-extrabold text-[var(--red)]">{formatMoney(monthOut)}</p>
            </button>
          </div>
          <div className="mt-3 flex h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
            <div className="bg-[var(--green)]" style={{ width: `${inPct}%` }} />
            <div className="bg-[var(--red)]" style={{ width: `${outPct}%` }} />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-semibold">
            <span className="text-[var(--green)]">{inPct}% Ingresos</span>
            <span className="text-[var(--red)]">{outPct}% Gastos</span>
          </div>
        </Card>

        <Card className="flex flex-1 flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <i className="ph ph-gauge" aria-hidden="true" /> ¿Cómo voy este mes?
            </p>
            {budgetPct !== null && budgetPct >= 90 && (
              <span className="rounded-[var(--radius-pill)] bg-[var(--amber)]/[0.16] px-2 py-0.5 text-[10px] font-bold text-[var(--amber)]">Atención</span>
            )}
          </div>
          {budgetPct === null ? (
            <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--text-faint)]">Con más meses de historial verás cómo va tu gasto acá.</p>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-[var(--text)]">
              Has usado el <b className="num text-[var(--text)]">{budgetPct}%</b> de tu gasto promedio y quedan{' '}
              <b className="num text-[var(--text)]">{daysLeft}</b> día{daysLeft === 1 ? '' : 's'}.
            </p>
          )}
          <button type="button" onClick={() => onOpenSubView('gastos')} className="mt-3 text-left text-[12.5px] font-bold text-[var(--brand)]">
            Ver detalles →
          </button>
        </Card>

        <Card className="flex flex-1 flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
              <i className="ph ph-target" aria-hidden="true" /> Tus metas
            </p>
            <button type="button" onClick={onOpenGoals} className="text-[11.5px] font-bold text-[var(--brand)]">
              Ver todas →
            </button>
          </div>
          {!mainGoal ? (
            <div className="mt-2 flex flex-1 flex-col justify-center gap-2">
              <p className="text-[12.5px] leading-relaxed text-[var(--text-faint)]">Crea tu primera meta de ahorro para verla acá.</p>
              <button type="button" onClick={onNewGoal} className="w-fit text-[12.5px] font-bold text-[var(--brand)]">
                + Nueva meta
              </button>
            </div>
          ) : (
            <>
              <p className="num mt-2 text-base font-extrabold text-[var(--text)]">
                {formatMoney(mainGoal.balance)} <span className="text-[var(--text-faint)]">/ {mainGoal.target ? formatMoney(mainGoal.target) : '—'}</span>
              </p>
              <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{mainGoal.name}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                <div className="h-full rounded-[var(--radius-pill)] bg-[var(--green)]" style={{ width: `${goalPct}%` }} />
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                Te faltan <span className="num font-semibold text-[var(--text)]">{formatMoney(goalRemaining)}</span> para alcanzar tu objetivo.
              </p>
              <button type="button" onClick={onOpenGoals} className="mt-2 text-left text-[12.5px] font-bold text-[var(--brand)]">
                Ver objetivo →
              </button>
            </>
          )}
        </Card>
      </div>

      {/* ROW 3 */}
      <div className="flex items-stretch gap-4">
        <div className="flex-[1.4]">
          <IncomeExpenseChart data={data} />
        </div>
        <div className="flex-1">
          <CategoryDonutChart data={data} />
        </div>
        <div className="flex-1">
          <ActivityFeed transactions={data.transactions} accounts={data.accounts} />
        </div>
      </div>
    </div>
  );
}

function RingGauge({ pct, colorVar, size = 54 }: { pct: number; colorVar: string; size?: number }) {
  const r = 22;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <circle
          cx="28"
          cy="28"
          r={r}
          fill="none"
          stroke={`var(${colorVar})`}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * c} ${c}`}
          transform="rotate(-90 28 28)"
        />
      </svg>
      <div className="num absolute inset-0 flex items-center justify-center text-[11px] font-bold text-[var(--text)]">{pct}%</div>
    </div>
  );
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="mt-2 h-6" aria-hidden="true" />;
  const W = 100;
  const H = 24;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * H;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-6 w-full" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrendMini({ points, label }: { points: number[]; label: string }) {
  if (points.length < 2) return <div className="mt-3 h-14" aria-hidden="true" />;
  const W = 100;
  const H = 56;
  const PAD = 4;
  const min = Math.min(...points);
  const max = Math.max(...points, min + 1);
  const range = max - min || 1;
  const pts = points.map((v, i) => {
    const x = (i / (points.length - 1)) * W;
    const y = H - PAD - ((v - min) / range) * (H - PAD * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return (
    <div className="relative mt-3 h-14">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={last[0]} cy={last[1]} r="2.4" fill="var(--brand)" />
      </svg>
      <div
        className="num absolute rounded-[8px] bg-[var(--text)] px-2 py-1 text-[10px] font-bold text-[var(--bg)]"
        style={{ left: `${Math.min(78, (last[0] / W) * 100)}%`, top: 0, transform: 'translate(-50%,-100%)', whiteSpace: 'nowrap' }}
      >
        {label}
      </div>
    </div>
  );
}

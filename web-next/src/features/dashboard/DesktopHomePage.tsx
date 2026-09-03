import { useMemo, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { computeTotals, formatMoney, pocketsRemainingThisMonth } from '../../lib/finance';
import { currentGeneralBudget, budgetHealth, BUDGET_TONE_VAR } from '../../lib/budgets';
import { computeLineChartBuckets } from '../../lib/lineChartBuckets';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { ActivityFeed } from './ActivityFeed';
import { CardShell, AddCardTile } from '../tarjeta/CardShell';
import type { AppState } from '../../lib/types';
import type { SubViewType } from './SubView';

interface DesktopHomePageProps {
  data: AppState;
  onOpenSubView: (type: SubViewType) => void;
  onNewGoal: () => void;
  onOpenGoals: () => void;
  onOpenTarjeta: () => void;
  onOpenPresupuestos: () => void;
}

// Pase de refinamiento visual (pedido: "elegante, pro, minimalista, tecnológico,
// estilo Apple/fintech premium") sobre el layout hero+grid anterior. Mismos datos
// y misma lógica real de siempre — lo que cambia es la jerarquía y el tratamiento:
// "Lo que tengo" pasa a ser un panel de tinta (navy, igual al sidebar) que forma
// una "L" continua de marca, con "Balance disponible" plegado ahí adentro en vez
// de repetir el mismo número en una tarjeta aparte. El resto de tarjetas (locales
// a este archivo, no tocan el sistema compartido) ganan más aire y una sombra de
// dos capas más sutil. IncomeExpenseChart/CategoryDonutChart/ActivityFeed se
// reutilizan tal cual (son también de mobile) para no duplicar lógica ni arriesgar
// el diseño compartido.
export function DesktopHomePage({ data, onOpenSubView, onNewGoal, onOpenGoals, onOpenTarjeta, onOpenPresupuestos }: DesktopHomePageProps) {
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

  // Tasa de ahorro de meses anteriores (mismos buckets que "Ingresos vs. gastos"),
  // para las barras y el "vs. mes anterior" — sin inventar historial que no existe.
  const monthRates = monthBuckets.ingresos.map((ing, i) => (ing > 0 ? Math.round(((ing - monthBuckets.gastos[i]) / ing) * 100) : null));
  const prevRate = monthRates.length >= 2 ? monthRates[monthRates.length - 2] : null;
  const rateDelta = savingsRate !== null && prevRate !== null ? savingsRate - prevRate : null;

  // "Lo que tengo" mes a mes: reconstruido hacia atrás desde el líquido actual con
  // el flujo neto de cada uno de los últimos 6 meses (mismos buckets que "Ingresos
  // vs. gastos") — no hay snapshots históricos de saldo guardados, así que esta es
  // la única forma honesta de trazar cómo fue evolucionando.
  const trendPoints = useMemo(() => {
    const nets = monthBuckets.ingresos.map((v, i) => v - monthBuckets.gastos[i]);
    const points = new Array<number>(nets.length);
    points[nets.length - 1] = totals.totalLiquid;
    for (let i = nets.length - 2; i >= 0; i--) points[i] = points[i + 1] - nets[i + 1];
    return points;
  }, [monthBuckets, totals.totalLiquid]);

  // Presupuesto (Fase 5): si el usuario configuró un tope general real para este
  // mes, se usa ese — si no, se cae al promedio de gasto de los últimos meses
  // completos como antes (aproximación honesta, no un presupuesto real).
  const realBudget = currentGeneralBudget(data);
  const pastMonthsGastos = monthBuckets.gastos.slice(0, -1).filter((_, i) => monthBuckets.ingresos[i] > 0 || monthBuckets.gastos[i] > 0);
  const avgBudget = pastMonthsGastos.length > 0 ? pastMonthsGastos.reduce((s, v) => s + v, 0) / pastMonthsGastos.length : null;
  const budgetCap = realBudget ? realBudget.amountLimit : avgBudget;
  const budgetPct = budgetCap && budgetCap > 0 ? Math.round((monthOut / budgetCap) * 100) : null;
  const budgetTone = budgetPct !== null ? budgetHealth(budgetPct) : null;
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  const monthTotal = monthIn + monthOut;
  const inPct = monthTotal > 0 ? Math.round((monthIn / monthTotal) * 100) : 50;
  const outPct = 100 - inPct;
  const monthLabel = now.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  const mainGoal = data.pockets[0];
  const goalPct = mainGoal && mainGoal.target && mainGoal.target > 0 ? Math.max(0, Math.min(100, Math.round((mainGoal.balance / mainGoal.target) * 100))) : 0;
  const goalRemaining = mainGoal && mainGoal.target ? Math.max(0, mainGoal.target - mainGoal.balance) : 0;

  const cards = data.accounts.filter((a) => a.type === 'tarjeta');
  const mainCard = cards[0];

  return (
    <div className="flex flex-col gap-5">
      {/* HERO — panel de tinta (mismo navy que el sidebar): "Lo que tengo" +
          "Balance disponible" plegado como línea secundaria (ya no repite el
          mismo número en una tarjeta aparte) + tendencia mensual a todo lo ancho. */}
      <MotionCard delay={0} padded={false}>
        <div className="ink-hero rounded-[var(--radius-card)] p-8" style={{ background: 'var(--sidebar-bg)' }}>
          <div className="flex items-start justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-white/50">
              <i className="ph ph-wallet" aria-hidden="true" /> Lo que tengo
            </p>
            <span className="rounded-[var(--radius-pill)] border border-white/15 px-2.5 py-1 text-[10.5px] font-bold text-white/70">
              {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
            </span>
          </div>

          <div className="mt-5 flex items-end gap-12">
            <div className="w-[400px] shrink-0">
              <p className="num text-[64px] font-extrabold leading-none tracking-[-0.02em] text-white">{formatMoney(totals.totalLiquid)}</p>
              <span
                className={`num mt-4 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-[12px] font-bold ${
                  monthNet >= 0 ? 'text-[var(--ink-success)]' : 'text-[var(--ink-danger)]'
                }`}
              >
                <i className={`ph ${monthNet >= 0 ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
                {monthNet >= 0 ? '+' : ''}
                {formatMoney(monthNet)} · Flujo neto de este mes
              </span>
              <p className="mt-4 text-[12.5px] text-white/45">
                {availablePct}% disponible para usar · {data.accounts.length} cuenta{data.accounts.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="min-w-0 flex-1">
              <TrendMini points={trendPoints} labels={monthBuckets.labels} width={760} height={180} dark />
            </div>
          </div>
        </div>
      </MotionCard>

      {/* ROW 2 */}
      <div className="flex items-stretch gap-5">
        <TileCard className="flex-1" delay={0.08}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">
              <i className="ph ph-piggy-bank" aria-hidden="true" /> Tasa de ahorro
            </p>
          </div>
          {savingsRate === null ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-faint)]">Registra ingresos este mes para ver tu tasa de ahorro.</p>
          ) : (
            <div className="mt-3 flex items-end justify-between gap-4">
              <div>
                <p className="num text-3xl font-extrabold text-[var(--brand)]">{savingsRate}%</p>
                {rateDelta !== null && (
                  <p className={`num mt-1.5 text-[11.5px] font-semibold ${rateDelta >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    <i className={`ph ${rateDelta >= 0 ? 'ph-arrow-up' : 'ph-arrow-down'}`} aria-hidden="true" /> {Math.abs(rateDelta)}% vs. mes anterior
                  </p>
                )}
              </div>
              <RateBars values={monthRates.filter((v): v is number => v !== null)} />
            </div>
          )}
        </TileCard>

        <TileCard className="flex-[1.3]" delay={0.14}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">
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
          <div className="mt-4 flex justify-between text-sm">
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
            <motion.div
              className="bg-[var(--green)]"
              initial={{ width: 0 }}
              animate={{ width: `${inPct}%` }}
              transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
            />
            <motion.div
              className="bg-[var(--red)]"
              initial={{ width: 0 }}
              animate={{ width: `${outPct}%` }}
              transition={{ duration: 0.7, delay: 0.5, ease: EASE }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] font-semibold">
            <span className="text-[var(--green)]">{inPct}% Ingresos</span>
            <span className="text-[var(--red)]">{outPct}% Gastos</span>
          </div>
        </TileCard>

        <TileCard className="flex-1" delay={0.2}>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">
              <i className="ph ph-gauge" aria-hidden="true" /> ¿Cómo voy este mes?
            </p>
            {budgetTone && budgetTone !== 'green' && (
              <span className="flex items-center gap-1.5 text-[10.5px] font-bold" style={{ color: `var(${BUDGET_TONE_VAR[budgetTone]})` }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${BUDGET_TONE_VAR[budgetTone]})` }} />
                {budgetTone === 'red' ? 'Superado' : 'Atención'}
              </span>
            )}
          </div>
          {budgetPct === null ? (
            <p className="mt-3 text-[12.5px] leading-relaxed text-[var(--text-faint)]">Con más meses de historial verás cómo va tu gasto acá.</p>
          ) : (
            <>
              <p className="mt-3 text-[13px] leading-relaxed text-[var(--text)]">
                Has usado el <b className="num text-[var(--text)]">{budgetPct}%</b> de tu {realBudget ? 'presupuesto' : 'gasto promedio'} y quedan{' '}
                <b className="num text-[var(--text)]">{daysLeft}</b> día{daysLeft === 1 ? '' : 's'}.
              </p>
              <div className="mt-2.5 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                <div
                  className="h-full rounded-[var(--radius-pill)]"
                  style={{ width: `${Math.min(100, budgetPct)}%`, background: budgetTone ? `var(${BUDGET_TONE_VAR[budgetTone]})` : 'var(--brand)' }}
                />
              </div>
            </>
          )}
          <button
            type="button"
            onClick={() => (realBudget ? onOpenPresupuestos() : onOpenSubView('gastos'))}
            className="mt-4 text-left text-[12.5px] font-bold text-[var(--brand)]"
          >
            {realBudget ? 'Ver presupuestos →' : 'Ver detalles →'}
          </button>
        </TileCard>
      </div>

      {/* ROW 3 */}
      <div className="flex items-stretch gap-5">
        <div className="flex w-[270px] shrink-0 flex-col gap-5">
          {/* Sin panel envolvente: la tarjeta "de billetera" va directo, más grande,
              aprovechando el espacio que antes se perdía en el header/padding de una
              TileCard. Es el mismo CardShell de la página de Tarjeta — el click ya
              navega ahí, no hace falta un link "Ver" aparte. */}
          <MotionCard delay={0.26} padded={false}>
            {!mainCard ? (
              <AddCardTile onClick={onOpenTarjeta} />
            ) : (
              <>
                <CardShell account={mainCard} expanded={false} onToggle={onOpenTarjeta} compact />
                {cards.length > 1 && (
                  <p className="mt-2.5 text-center text-[11.5px] text-[var(--text-muted)]">
                    +{cards.length - 1} tarjeta{cards.length - 1 === 1 ? '' : 's'} más
                  </p>
                )}
              </>
            )}
          </MotionCard>

          {/* flex-1: llena todo el resto del alto de la columna (antes quedaba
              espacio vacío debajo cuando no había metas todavía). */}
          <TileCard className="flex-1" delay={0.3}>
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">
                  <i className="ph ph-target" aria-hidden="true" /> Tus metas
                </p>
                <button type="button" onClick={onOpenGoals} className="text-[11.5px] font-bold text-[var(--brand)]">
                  Ver todas →
                </button>
              </div>
              {!mainGoal ? (
                <div className="flex flex-1 flex-col justify-center gap-2">
                  <p className="text-[12.5px] leading-relaxed text-[var(--text-faint)]">Crea tu primera meta de ahorro para verla acá.</p>
                  <button type="button" onClick={onNewGoal} className="w-fit text-[12.5px] font-bold text-[var(--brand)]">
                    + Nueva meta
                  </button>
                </div>
              ) : (
                <div className="flex flex-1 flex-col justify-center">
                  <p className="num mt-2 text-base font-extrabold text-[var(--text)]">
                    {formatMoney(mainGoal.balance)} <span className="text-[var(--text-faint)]">/ {mainGoal.target ? formatMoney(mainGoal.target) : '—'}</span>
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-[var(--text-muted)]">{mainGoal.name}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                    <motion.div
                      className="h-full rounded-[var(--radius-pill)] bg-[var(--green)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${goalPct}%` }}
                      transition={{ duration: 0.7, delay: 0.6, ease: EASE }}
                    />
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-[var(--text-muted)]">
                    Te faltan <span className="num font-semibold text-[var(--text)]">{formatMoney(goalRemaining)}</span> para alcanzar tu objetivo.
                  </p>
                  <button type="button" onClick={onOpenGoals} className="mt-2 text-left text-[12.5px] font-bold text-[var(--brand)]">
                    Ver objetivo →
                  </button>
                </div>
              )}
            </div>
          </TileCard>
        </div>

        <MotionCard className="min-w-0 flex-[1.3]" delay={0.36} padded={false}>
          <IncomeExpenseChart data={data} onOpenSubView={onOpenSubView} />
        </MotionCard>
        <MotionCard className="min-w-0 flex-1" delay={0.42} padded={false}>
          <CategoryDonutChart data={data} />
        </MotionCard>
        <MotionCard className="min-w-0 flex-1" delay={0.48} padded={false}>
          <ActivityFeed transactions={data.transactions} accounts={data.accounts} />
        </MotionCard>
      </div>
    </div>
  );
}

const EASE = [0.16, 1, 0.3, 1] as const;

// Sombra de dos capas (contacto ajustado + ambient suave) en vez de una sola
// sombra genérica — mismo radio/borde que el resto de la app (--radius-card),
// solo se refina la profundidad y se le da más aire interno (28px vs. 22px).
const TILE_CLASS =
  'rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-7 shadow-[0_1px_2px_rgba(16,10,40,0.05),0_18px_36px_-22px_rgba(16,10,40,0.14)]';

// Entrada escalonada de tarjetas: fade + leve subida, con delay creciente por
// tarjeta para que el grid se sienta como una sola composición entrando en
// cascada en vez de piezas apareciendo a la vez. Respeta prefers-reduced-motion.
function MotionCard({
  className = '',
  delay,
  padded = true,
  children,
}: {
  className?: string;
  delay: number;
  padded?: boolean;
  children: ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: reduceMotion ? 0 : delay, ease: EASE }}
    >
      {padded ? <div className={`${TILE_CLASS} h-full`}>{children}</div> : children}
    </motion.div>
  );
}

function TileCard({ className = '', delay, children }: { className?: string; delay: number; children: ReactNode }) {
  return (
    <MotionCard className={className} delay={delay}>
      {children}
    </MotionCard>
  );
}

// Barras de tasa de ahorro mes a mes (reemplaza la línea fina anterior): el mes
// actual resaltado en violeta de marca, los anteriores en un tono neutro — se
// lee de un vistazo sin competir con el número grande de al lado.
function RateBars({ values }: { values: number[] }) {
  const reduceMotion = useReducedMotion();
  if (values.length === 0) return <div className="h-14 w-28 shrink-0" aria-hidden="true" />;
  const H = 52;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  return (
    <div className="flex h-14 shrink-0 items-end gap-1.5">
      {values.map((v, i) => {
        const h = Math.max(3, ((v - min) / range) * H);
        const isLast = i === values.length - 1;
        return (
          <motion.div
            key={i}
            className={`w-2.5 rounded-full ${isLast ? 'bg-[var(--brand)]' : 'bg-[var(--border-flat)]'}`}
            initial={reduceMotion ? false : { height: 0 }}
            animate={{ height: h }}
            transition={{ duration: 0.5, delay: reduceMotion ? 0 : 0.3 + i * 0.06, ease: EASE }}
          />
        );
      })}
    </div>
  );
}

// Barras mes a mes (una por mes de "Lo que tengo"), seleccionables por click: el
// mes elegido se resalta (color pleno + leve escala) y el resto se atenúa, con el
// tooltip animándose hacia la barra seleccionada. Arranca con el mes actual ya
// seleccionado. Respeta prefers-reduced-motion. `dark` ajusta la paleta para
// vivir sobre el panel de tinta del hero.
function TrendMini({
  points,
  labels,
  width = 480,
  height = 130,
  dark = false,
}: {
  points: number[];
  labels: string[];
  width?: number;
  height?: number;
  dark?: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const W = width;
  const H = height;
  const PAD_Y = 14;
  const [selected, setSelected] = useState(points.length - 1);

  const bars = useMemo(() => {
    if (points.length === 0) return [];
    const min = Math.min(...points, 0);
    const max = Math.max(...points, min + 1);
    const range = max - min || 1;
    const n = points.length;
    const groupW = W / n;
    const barW = Math.min(40, groupW * 0.5);
    return points.map((v, i) => {
      const cx = i * groupW + groupW / 2;
      const barH = Math.max(3, ((v - min) / range) * (H - PAD_Y * 2));
      return { x: cx - barW / 2, y: H - PAD_Y - barH, width: barW, height: barH, cx };
    });
  }, [points, W, H]);

  if (bars.length < 2) return <div style={{ height: H }} aria-hidden="true" />;
  const activeIdx = Math.min(selected, bars.length - 1);
  const active = bars[activeIdx];
  const tooltipDelay = reduceMotion ? 0 : 0.9;

  const activeFill = dark ? 'var(--ink-accent)' : 'var(--brand)';
  const idleFill = dark ? 'rgba(255,255,255,0.16)' : 'var(--border-flat)';
  const tooltipBg = dark ? 'var(--ink-chip)' : 'var(--text)';
  const tooltipText = dark ? 'var(--sidebar-bg)' : 'var(--bg)';
  const axisClass = dark ? 'text-white/40' : 'text-[var(--text-faint)]';

  return (
    <div className="relative">
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
          {bars.map((b, i) => (
            <motion.rect
              key={i}
              width={b.width}
              rx={6}
              onClick={() => setSelected(i)}
              className="cursor-pointer"
              initial={reduceMotion ? false : { x: b.x, y: H - PAD_Y, height: 0, fill: idleFill }}
              animate={{ x: b.x, y: b.y, height: b.height, fill: i === activeIdx ? activeFill : idleFill }}
              transition={{
                height: { duration: 0.6, delay: reduceMotion ? 0 : 0.15 + i * 0.05, ease: EASE },
                y: { duration: 0.6, delay: reduceMotion ? 0 : 0.15 + i * 0.05, ease: EASE },
                fill: { duration: 0.25 },
              }}
            />
          ))}
        </svg>
        <motion.div
          className="num absolute rounded-[8px] px-2 py-1 text-[10px] font-bold"
          style={{
            transform: 'translate(-50%,-100%)',
            whiteSpace: 'nowrap',
            background: tooltipBg,
            color: tooltipText,
          }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{
            opacity: 1,
            left: `${Math.min(92, Math.max(8, (active.cx / W) * 100))}%`,
            top: `${Math.max(0, (active.y / H) * 100 - 12)}%`,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : tooltipDelay, ease: EASE }}
        >
          {formatMoney(points[activeIdx])}
        </motion.div>
      </div>
      <div className={`mt-1.5 flex justify-between text-[10.5px] ${axisClass}`}>
        {labels.map((l, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSelected(i)}
            className={`num transition-opacity ${i === activeIdx ? 'font-bold opacity-100' : 'opacity-70 hover:opacity-100'}`}
            style={i === activeIdx && dark ? { color: 'var(--ink-chip)' } : i === activeIdx ? { color: 'var(--text)' } : undefined}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

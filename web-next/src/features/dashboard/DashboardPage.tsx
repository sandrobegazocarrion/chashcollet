import { computeTotals, computeUpcomingPayments, pocketsRemainingThisMonth } from '../../lib/finance';
import type { AppState } from '../../lib/types';
import type { TabId } from '../../components/layout/Sidebar';
import { NetWorthHero } from './NetWorthHero';
import { AlertCard } from './AlertCard';
import { MonthCompareCard } from './MonthCompareCard';
import { StatsRow } from './StatsRow';
import { ActivityFeed } from './ActivityFeed';
import { ObjectivesPanel } from './ObjectivesPanel';
import { TipBanner } from './TipBanner';
import { IncomeExpenseChart } from './IncomeExpenseChart';
import { CategoryDonutChart } from './CategoryDonutChart';
import { SubView, type SubViewType } from './SubView';

interface DashboardPageProps {
  data: AppState;
  onNewGoal: () => void;
  onOpenGoals: () => void;
  onGoTab: (tab: TabId) => void;
  onRegisterIncome: () => void;
  subView: SubViewType | null;
  svMonth: Date;
  onOpenSubView: (type: SubViewType) => void;
  onCloseSubView: () => void;
  onPrevSvMonth: () => void;
  onNextSvMonth: () => void;
}

// Mismo orden que .dash-layout en public/index.html: columna de Objetivos a la
// izquierda (fija) + columna principal con hero → stats → gráficos → alertas → tip
// del día → actividad reciente, en ese orden exacto.
export function DashboardPage({
  data,
  onNewGoal,
  onOpenGoals,
  onGoTab,
  onRegisterIncome,
  subView,
  svMonth,
  onOpenSubView,
  onCloseSubView,
  onPrevSvMonth,
  onNextSvMonth,
}: DashboardPageProps) {
  // Espeja showSubView(): al abrir Ingresos/Gastos/Balance, reemplaza TODO el
  // contenido del Panel (incluida la columna de Objetivos), igual que el original
  // activa #view-<tipo> en vez de #tab-dashboard.
  if (subView) {
    return <SubView type={subView} data={data} month={svMonth} onPrevMonth={onPrevSvMonth} onNextMonth={onNextSvMonth} onBack={onCloseSubView} />;
  }

  const totals = computeTotals(data);

  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
  const prevMonthLabel = prevDate.toLocaleDateString('es-PE', { month: 'long' });
  let monthIn = 0;
  let monthOut = 0;
  let prevMonthOut = 0;
  data.transactions.forEach((tx) => {
    if (!tx.date) return;
    const key = tx.date.slice(0, 7);
    if (key === monthKey) {
      if (tx.type === 'ingreso') monthIn += tx.amount;
      else monthOut += tx.amount;
    } else if (key === prevMonthKey && tx.type === 'gasto') {
      prevMonthOut += tx.amount;
    }
  });
  const monthNet = monthIn - monthOut;
  const savingsRate = monthIn > 0 ? Math.round((monthNet / monthIn) * 100) : null;
  // % de gasto vs. el mes anterior — la única comparación mes-a-mes que se puede
  // calcular con datos reales sin inventar un histórico de saldo que no existe.
  const spendVsPrevPct = prevMonthOut > 0 ? Math.round(((monthOut - prevMonthOut) / prevMonthOut) * 100) : null;

  const upcoming = computeUpcomingPayments(data, Infinity);
  const urgent = upcoming.find((i) => i.days <= 2) || upcoming[0];

  const pocketsRemaining = pocketsRemainingThisMonth(data);
  const safeToSpend = totals.totalLiquid - totals.totalDeuda - pocketsRemaining;

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <aside className="order-2 w-full shrink-0 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-5 lg:sticky lg:top-[76px] lg:order-1 lg:w-[270px]">
        <ObjectivesPanel pockets={data.pockets} onNewGoal={onNewGoal} onOpenGoal={onOpenGoals} />
      </aside>

      <div className="order-1 flex min-w-0 flex-1 flex-col gap-6 lg:order-2">
        {/* Hero: aire generoso, es el dato que manda en la pantalla. */}
        <NetWorthHero totalLiquid={totals.totalLiquid} monthNet={monthNet} />

        <MonthCompareCard
          monthIn={monthIn}
          monthOut={monthOut}
          monthNet={monthNet}
          spendVsPrevPct={spendVsPrevPct}
          prevMonthLabel={prevMonthLabel}
          onOpenSubView={onOpenSubView}
        />

        {/* Balance disponible y Tasa de ahorro, cada uno su propia tarjeta. */}
        <div className="grid grid-cols-2 gap-3">
          <StatsRow safeToSpend={safeToSpend} savingsRate={savingsRate} onRegisterIncome={onRegisterIncome} />
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <IncomeExpenseChart data={data} onOpenSubView={onOpenSubView} />
          <CategoryDonutChart data={data} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <AlertCard urgent={urgent} onGoTab={onGoTab} />
          {/* Espeja la mini-tarjeta "dark" (elevada, .mini-card.dark) del original:
              mismo botón clicable, ahora navega a la página de Configuración en vez
              de abrir el modal directo. */}
          <button
            type="button"
            onClick={() => onGoTab('configuracion')}
            className="flex w-full flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-flat)] p-[22px] text-left transition-colors hover:bg-[var(--surface-raised)]"
          >
            <span className="mb-3 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--surface-raised)] text-[var(--text)]">
              <i className="ph ph-telegram-logo text-sm" aria-hidden="true" />
            </span>
            <p className="text-sm font-bold text-[var(--text)]">Bot de Telegram</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">
              Registra gastos y consulta tu resumen sin abrir la app.
            </p>
            <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--text)]">
              Ver cómo conectarlo <i className="ph ph-arrow-right" aria-hidden="true" />
            </span>
          </button>
        </div>

        <TipBanner />

        <ActivityFeed transactions={data.transactions} accounts={data.accounts} limit={5} onViewAll={() => onGoTab('transacciones')} />
      </div>
    </div>
  );
}

import { Card } from '../../components/ui/Card';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { formatMoney } from '../../lib/finance';
import type { AppState, Transaction } from '../../lib/types';

export type SubViewType = 'ingresos' | 'gastos' | 'balance';

interface SubViewProps {
  type: SubViewType;
  data: AppState;
  month: Date;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onBack: () => void;
}

export const SUBVIEW_META: Record<SubViewType, { title: string; icon: string }> = {
  ingresos: { title: 'Ingresos del mes', icon: 'ph-trend-up' },
  gastos: { title: 'Gastos del mes', icon: 'ph-trend-down' },
  balance: { title: 'Balance neto', icon: 'ph-scales' },
};

function monthKeyOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function monthLabelOf(d: Date): string {
  const l = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  return l.charAt(0).toUpperCase() + l.slice(1);
}

// Espeja las sub-vistas #view-ingresos / #view-gastos / #view-balance de
// public/index.html (showSubView() / renderIngresosView() / renderGastosView() /
// renderBalanceView() en app.js): se abren al hacer clic en Ingresos/Gastos/Balance
// de .month-compare-card, con su propia navegación de mes (sv-prev/sv-next) — CSS
// bars en vez de Chart.js, igual que el resto del Panel.
export function SubView({ type, data, month, onPrevMonth, onNextMonth, onBack }: SubViewProps) {
  const meta = SUBVIEW_META[type];
  const monthKey = monthKeyOf(month);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <GradientButton type="button" variant="ghost" onClick={onBack}>
            <i className="ph ph-arrow-left" aria-hidden="true" /> Volver
          </GradientButton>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--text)]">
            <i className={`ph ${meta.icon}`} aria-hidden="true" /> {meta.title}
          </h1>
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-1">
          <IconButton icon="ph-caret-left" label="Mes anterior" onClick={onPrevMonth} />
          <span className="min-w-[130px] text-center text-sm font-semibold text-[var(--text)]">{monthLabelOf(month)}</span>
          <IconButton icon="ph-caret-right" label="Mes siguiente" onClick={onNextMonth} />
        </div>
      </div>

      {type === 'balance' ? <BalanceSubView data={data} monthKey={monthKey} /> : <FlowSubView data={data} monthKey={monthKey} type={type} />}
    </div>
  );
}

function buildDailyData(data: AppState, monthKey: string, type: 'ingreso' | 'gasto') {
  const [y, m] = monthKey.split('-').map(Number);
  const daysCount = new Date(y, m, 0).getDate();
  const byDay = new Array(daysCount + 1).fill(0);
  const txList: Transaction[] = [];
  data.transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(monthKey) || tx.type !== type) return;
    const d = parseInt(tx.date.slice(8, 10), 10);
    byDay[d] += tx.amount;
    txList.push(tx);
  });
  return { daysCount, byDay, txList };
}

function FlowSubView({ data, monthKey, type }: { data: AppState; monthKey: string; type: 'ingresos' | 'gastos' }) {
  const txType = type === 'ingresos' ? 'ingreso' : 'gasto';
  const { daysCount, byDay, txList } = buildDailyData(data, monthKey, txType);
  const colorVar = type === 'ingresos' ? '--green' : '--red';
  const sign = type === 'ingresos' ? '+' : '-';

  return (
    <>
      <Card>
        <h2 className="mb-3.5 text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {type === 'ingresos' ? 'Ingresos por día' : 'Gastos por día'}
        </h2>
        <DailyBarChart byDay={byDay} daysCount={daysCount} colorVar={colorVar} />
      </Card>
      <Card>
        <SubViewTxList txList={txList} sign={sign} colorVar={colorVar} />
      </Card>
    </>
  );
}

function BalanceSubView({ data, monthKey }: { data: AppState; monthKey: string }) {
  let totalIn = 0;
  let totalOut = 0;
  data.transactions.forEach((tx) => {
    if (!tx.date || !tx.date.startsWith(monthKey)) return;
    if (tx.type === 'ingreso') totalIn += tx.amount;
    else totalOut += tx.amount;
  });
  const net = totalIn - totalOut;
  const rate = totalIn > 0 ? Math.max(0, Math.round((net / totalIn) * 100)) : null;
  const goodRate = rate !== null && rate >= 20;

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ingresos</p>
          <p className="num mt-2.5 text-2xl font-extrabold text-[var(--green)]">{formatMoney(totalIn)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Gastos</p>
          <p className="num mt-2.5 text-2xl font-extrabold text-[var(--red)]">{formatMoney(totalOut)}</p>
        </Card>
        <Card className="text-center">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Balance neto</p>
          <p className={`num mt-2.5 text-2xl font-extrabold ${net >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
            {net >= 0 ? '+' : ''}
            {formatMoney(net)}
          </p>
        </Card>
      </div>

      {totalIn === 0 && totalOut === 0 ? (
        <Card>
          <p className="py-10 text-center text-sm text-[var(--text-faint)]">Sin movimientos este mes</p>
        </Card>
      ) : (
        <Card>
          <h2 className="mb-4 text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Comparación del mes</h2>
          <div className="flex h-40 items-end justify-center gap-10">
            {[
              { label: 'Ingresos', value: totalIn, colorVar: '--green' },
              { label: 'Gastos', value: totalOut, colorVar: '--red' },
            ].map((bar) => {
              const max = Math.max(1, totalIn, totalOut);
              return (
                <div key={bar.label} className="flex w-24 flex-col items-center gap-2">
                  <span className="num text-sm font-bold text-[var(--text)]">{formatMoney(bar.value)}</span>
                  <div className="flex h-28 w-full items-end">
                    <div
                      className="w-full rounded-t-[8px]"
                      style={{ height: `${Math.max(3, (bar.value / max) * 100)}%`, background: `var(${bar.colorVar})` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-[var(--text-muted)]">{bar.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tasa de ahorro</h2>
        {rate === null ? (
          <p className="text-sm text-[var(--text-faint)]">Sin ingresos registrados este mes.</p>
        ) : (
          <>
            <div className="mb-1.5 flex items-center justify-between text-[13px] font-semibold text-[var(--text-muted)]">
              <span>Porcentaje ahorrado</span>
              <span className={goodRate ? 'text-[var(--green)]' : 'text-[var(--amber)]'}>{rate}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)]">
              <div
                className={`h-full rounded-[var(--radius-pill)] ${goodRate ? 'bg-[var(--green)]' : 'bg-[var(--amber)]'}`}
                style={{ width: `${Math.min(100, rate)}%` }}
              />
            </div>
            <p className="mt-2.5 text-xs text-[var(--text-muted)]">
              {goodRate ? '✅ ¡Excelente tasa de ahorro!' : '⚠️ Meta recomendada: ahorrar al menos 20% de los ingresos.'}
            </p>
          </>
        )}
      </Card>
    </>
  );
}

function DailyBarChart({ byDay, daysCount, colorVar }: { byDay: number[]; daysCount: number; colorVar: string }) {
  const max = Math.max(1, ...byDay.slice(1));
  const skip = daysCount > 20 ? 3 : daysCount > 10 ? 2 : 1;

  return (
    <div>
      <div className="flex h-48 items-end gap-[3px]">
        {byDay.slice(1).map((v, i) => (
          <div key={i} className="group relative flex h-full flex-1 items-end" title={formatMoney(v)}>
            <div
              className="w-full rounded-t-[3px] transition-[height]"
              style={{ height: v > 0 ? `${Math.max(3, (v / max) * 100)}%` : '2px', background: `var(${colorVar})`, opacity: v > 0 ? 1 : 0.25 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[3px] text-[10px] text-[var(--text-faint)]">
        {byDay.slice(1).map((_, i) => {
          const day = i + 1;
          if (day % skip !== 0 && day !== daysCount) return <span key={i} className="flex-1" />;
          return (
            <span key={i} className="flex-1 text-center">
              {day}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SubViewTxList({ txList, sign, colorVar }: { txList: Transaction[]; sign: string; colorVar: string }) {
  if (txList.length === 0) {
    return <p className="py-10 text-center text-sm text-[var(--text-faint)]">Sin movimientos este mes</p>;
  }
  const sorted = [...txList].sort((a, b) => b.date.localeCompare(a.date));
  const total = sorted.reduce((s, t) => s + t.amount, 0);

  return (
    <div>
      <p className="mb-3 text-[12.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {sorted.length} movimiento{sorted.length !== 1 ? 's' : ''} · Total: <span className="text-[var(--text)]">{formatMoney(total)}</span>
      </p>
      <div className="flex flex-col divide-y divide-[var(--border)]">
        {sorted.map((tx) => (
          <div key={tx.id} className="flex items-center gap-3 py-2.5">
            <span className="w-11 shrink-0 text-xs text-[var(--text-faint)]">
              {tx.date.slice(8, 10)}/{tx.date.slice(5, 7)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-[var(--text)]">{tx.description || tx.category || '—'}</p>
              <p className="truncate text-xs text-[var(--text-muted)]">{tx.category}</p>
            </div>
            <span className="num shrink-0 text-sm font-bold" style={{ color: `var(${colorVar})` }}>
              {sign}
              {formatMoney(tx.amount)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

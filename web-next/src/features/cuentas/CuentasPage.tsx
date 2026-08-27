import { useMemo, useState, type FormEvent } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { RingChart } from '../../components/ui/RingChart';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatDate, formatMoney } from '../../lib/finance';
import { ACCOUNT_COLOR_PALETTE, accountColorKey, accountColorVar, accountColorSoft, type AccountColorKey } from '../../lib/accountColor';
import { categoryColorVar } from '../../lib/categoryColor';
import { PERUVIAN_BANKS } from '../../lib/banks';
import { BankBadge } from '../../components/ui/BankBadge';
import type { Account, AccountType, AppState } from '../../lib/types';

const TYPE_LABELS: Record<Exclude<AccountType, 'tarjeta'>, string> = {
  ahorro: 'Cuenta de ahorros',
  corriente: 'Cuenta corriente',
  efectivo: 'Efectivo en mano',
};
const TYPE_ICONS: Record<Exclude<AccountType, 'tarjeta'>, string> = {
  ahorro: 'ph-vault',
  corriente: 'ph-bank',
  efectivo: 'ph-coins',
};
// Versión corta de TYPE_LABELS para el chip de la tarjeta de cuenta — la larga
// ("Cuenta de ahorros") se repite con el propio nombre de la cuenta y no deja
// espacio para nombres largos.
const TYPE_LABELS_SHORT: Record<Exclude<AccountType, 'tarjeta'>, string> = {
  ahorro: 'Ahorros',
  corriente: 'Corriente',
  efectivo: 'Efectivo',
};
// "Hoy"/"Ayer" cuando aplica, si no la fecha corta — mismo criterio que el resto
// de la app para no mostrar hora (los movimientos reales solo tienen fecha).
function relativeDate(iso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yestDate = new Date();
  yestDate.setDate(yestDate.getDate() - 1);
  const yesterday = yestDate.toISOString().slice(0, 10);
  if (iso === today) return 'Hoy';
  if (iso === yesterday) return 'Ayer';
  return formatDate(iso);
}

const CATEGORY_ICONS: Record<string, string> = {
  Comida: 'ph-hamburger',
  Transporte: 'ph-car',
  Hogar: 'ph-house-simple',
  Entretenimiento: 'ph-film-strip',
  Salud: 'ph-pill',
  Otros: 'ph-credit-card',
};

interface FormState {
  type: Exclude<AccountType, 'tarjeta'>;
  name: string;
  balance: string;
  bank: string;
  interestRate: string;
  monthlyDeposit: string;
}

const EMPTY_FORM: FormState = { type: 'ahorro', name: '', balance: '', bank: '', interestRate: '', monthlyDeposit: '' };

function accountToForm(acc: Account): FormState {
  return {
    type: acc.type as Exclude<AccountType, 'tarjeta'>,
    name: acc.name,
    balance: String(acc.balance),
    bank: acc.bank || '',
    interestRate: acc.interestRate != null ? String(acc.interestRate) : '',
    monthlyDeposit: acc.monthlyDeposit != null ? String(acc.monthlyDeposit) : '',
  };
}

function formToBody(f: FormState) {
  return {
    type: f.type,
    name: f.name.trim(),
    balance: Number(f.balance) || 0,
    bank: f.type !== 'efectivo' ? f.bank || undefined : undefined,
    interestRate: f.type !== 'efectivo' && f.interestRate ? Number(f.interestRate) : undefined,
    monthlyDeposit: f.type !== 'efectivo' && f.monthlyDeposit ? Number(f.monthlyDeposit) : undefined,
  };
}

// Espeja #tab-cuentas ("Mi Billetera") de la app vieja: hero con el total + reparto
// por cuenta, grid de tarjetas (solo líquido — ahorro, corriente/sueldo y efectivo;
// las de crédito viven en la pestaña Tarjeta). El detalle de cada cuenta (datos
// editables + comparativo de ingresos/gastos) ya no queda fijo debajo de la grilla:
// se abre bajo demanda en un modal al hacer clic en la tarjeta o en su lápiz.
export function CuentasPage({ data }: { data: AppState }) {
  const liquid = data.accounts.filter((a) => a.type !== 'tarjeta');
  const liquidIds = useMemo(() => new Set(liquid.map((a) => a.id)), [liquid]);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailAccount = liquid.find((a) => a.id === detailId) || null;

  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  // Evolución mensual del total de la billetera (solo cuentas líquidas, últimos
  // 6 meses con actividad) — mismo criterio que computeLineChartBuckets pero
  // acotado a esta billetera, para no mezclar movimientos de tarjeta de crédito.
  const liquidMonthBuckets = useMemo(() => {
    const now = new Date();
    const currentKey = now.toISOString().slice(0, 7);
    const map: Record<string, { ingreso: number; gasto: number }> = {};
    data.transactions.forEach((tx) => {
      if (!liquidIds.has(tx.accountId || '')) return;
      const key = tx.date ? tx.date.slice(0, 7) : currentKey;
      (map[key] ||= { ingreso: 0, gasto: 0 })[tx.type] += tx.amount;
    });
    if (!map[currentKey]) map[currentKey] = { ingreso: 0, gasto: 0 };
    const keys = Object.keys(map).sort().slice(-6);
    const labels = keys.map((k) => {
      const [y, m] = k.split('-');
      return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'short', year: '2-digit' });
    });
    const fullLabels = keys.map((k) => {
      const [y, m] = k.split('-');
      const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
      return label.charAt(0).toUpperCase() + label.slice(1);
    });
    return { keys, labels, fullLabels, ingresos: keys.map((k) => map[k].ingreso), gastos: keys.map((k) => map[k].gasto) };
  }, [data.transactions, liquidIds]);

  const addAccount = useApiMutation<unknown, Account>('POST', '/api/accounts');
  const updateAccount = useApiMutation<{ id: string } & Record<string, unknown>, Account>('PUT', (b) => `/api/accounts/${b.id}`);
  const deleteAccount = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/accounts/${b.id}`);
  const setColor = useApiMutation<{ id: string; color: AccountColorKey }, Account>('PUT', (b) => `/api/accounts/${b.id}`);

  function openCreate() {
    setForm(EMPTY_FORM);
    setError(null);
    setCreating(true);
  }
  function openEdit(acc: Account) {
    setForm(accountToForm(acc));
    setError(null);
    setEditing(acc);
  }
  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await updateAccount.mutateAsync({ id: editing.id, ...formToBody(form) });
      } else {
        const created = await addAccount.mutateAsync(formToBody(form));
        setDetailId(created.id);
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.');
    }
  }

  async function handleDelete(acc: Account) {
    if (!confirm(`¿Eliminar "${acc.name}"? También se eliminarán sus transacciones asociadas.`)) return;
    try {
      await deleteAccount.mutateAsync({ id: acc.id });
      setDetailId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.');
    }
  }

  if (liquid.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Mi Billetera" actionLabel="Nueva cuenta" onAction={openCreate} />
        <EmptyState
          icon="ph-wallet"
          title="Todavía no tienes cuentas en tu billetera"
          subtitle="Crea una cuenta de ahorros, corriente o efectivo para ver el total de tu dinero aquí."
          cta={{ label: '+ Nueva cuenta', onClick: openCreate }}
        />
        <AccountFormModal open={creating} onClose={closeModal} title="Nueva cuenta" form={form} setForm={setForm} onSubmit={handleSubmit} loading={addAccount.isPending} error={error} />
      </div>
    );
  }

  const total = liquid.reduce((s, a) => s + a.balance, 0);
  const sorted = [...liquid].sort((a, b) => b.balance - a.balance);

  // Reconstrucción hacia atrás del total de la billetera mes a mes, igual técnica
  // que "Lo que tengo" de Inicio: no hay snapshots históricos de saldo guardados,
  // así que se resta el flujo neto de cada mes desde el total actual.
  const liquidNets = liquidMonthBuckets.ingresos.map((v, i) => v - liquidMonthBuckets.gastos[i]);
  const trendPoints = new Array<number>(liquidNets.length);
  if (liquidNets.length > 0) {
    trendPoints[liquidNets.length - 1] = total;
    for (let i = liquidNets.length - 2; i >= 0; i--) trendPoints[i] = trendPoints[i + 1] - liquidNets[i + 1];
  }
  const activeMonthIdx = selectedMonthIdx !== null ? Math.min(selectedMonthIdx, trendPoints.length - 1) : trendPoints.length - 1;

  const lockedFor = (accountId: string) => data.pockets.find((p) => p.linkedAccountId === accountId) || null;

  // Flujo neto del mes, sumando solo las cuentas líquidas (la misma billetera que
  // muestra el hero) — igual que el "flujo neto de este mes" de Inicio, pero
  // acotado a esta billetera en vez de toda la app.
  const monthKey = new Date().toISOString().slice(0, 7);
  let monthIn = 0;
  let monthOut = 0;
  data.transactions.forEach((t) => {
    if (!t.date || t.date.slice(0, 7) !== monthKey || !liquidIds.has(t.accountId || '')) return;
    if (t.type === 'ingreso') monthIn += t.amount;
    else monthOut += t.amount;
  });
  const monthNet = monthIn - monthOut;

  const lockedCount = liquid.filter((a) => lockedFor(a.id)).length;

  const recentAcrossLiquid = [...data.transactions]
    .filter((t) => liquidIds.has(t.accountId || ''))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 6);

  const lastMovementFor = (accountId: string) =>
    [...data.transactions]
      .filter((t) => t.accountId === accountId)
      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))[0] || null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi Billetera" />

      {/* Hero: panel de tinta navy (mismo tratamiento que "Lo que tengo" de Inicio) —
          total + badge de flujo neto del mes + reparto por cuenta con el color real
          de cada una. */}
      <div className="rounded-[var(--radius-card)] p-8" style={{ background: 'var(--sidebar-bg)' }}>
        <div className="flex items-start justify-between">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-white/50">
            <i className="ph ph-wallet" aria-hidden="true" /> Total en tu billetera
          </p>
          {liquidMonthBuckets.fullLabels.length > 0 && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMonthPickerOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-white/15 px-2.5 py-1 text-[10.5px] font-bold text-white/70 hover:border-white/30"
              >
                {liquidMonthBuckets.fullLabels[activeMonthIdx]}
                <i className="ph ph-caret-down text-[9px]" aria-hidden="true" />
              </button>
              {monthPickerOpen && (
                <div className="absolute right-0 top-[calc(100%+6px)] z-10 w-48 rounded-[14px] border border-white/10 bg-[#171e38] p-1.5 shadow-[0_18px_36px_-12px_rgba(0,0,0,.5)]">
                  {liquidMonthBuckets.fullLabels.map((l, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setSelectedMonthIdx(i);
                        setMonthPickerOpen(false);
                      }}
                      className={`block w-full rounded-[10px] px-3 py-1.5 text-left text-[12.5px] ${
                        i === activeMonthIdx ? 'bg-white/10 font-bold text-white' : 'text-white/70 hover:bg-white/5'
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-8 lg:flex-row lg:items-start">
          <div className="lg:w-[380px] lg:shrink-0">
            <p className="num text-[52px] font-extrabold leading-none tracking-tight text-white">{formatMoney(total)}</p>
            {monthIn > 0 || monthOut > 0 ? (
              <span
                className={`num mt-4 inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] bg-white/10 px-3 py-1.5 text-[12px] font-bold ${
                  monthNet >= 0 ? 'text-[var(--ink-success)]' : 'text-[var(--ink-danger)]'
                }`}
              >
                <i className={`ph ${monthNet >= 0 ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
                {monthNet >= 0 ? '+' : ''}
                {formatMoney(monthNet)} · Flujo neto de este mes
              </span>
            ) : (
              <p className="mt-4 text-[12.5px] text-white/45">Sin movimientos este mes todavía.</p>
            )}
            <p className="mt-2 text-[12.5px] text-white/45">
              {liquid.length} cuenta{liquid.length === 1 ? '' : 's'}
              {lockedCount > 0 ? ` · ${lockedCount} apartada${lockedCount === 1 ? '' : 's'} para metas` : ''}
            </p>
          </div>

          {trendPoints.length >= 2 && (
            <div className="min-w-0 flex-1 lg:border-l lg:border-white/10 lg:pl-8">
              <EvolutionBars points={trendPoints} labels={liquidMonthBuckets.labels} selectedIdx={activeMonthIdx} onSelect={setSelectedMonthIdx} />
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-col gap-2.5">
          {sorted.map((a) => {
            const pct = total > 0 ? Math.max(2, Math.round((a.balance / total) * 100)) : 0;
            return (
              <div key={a.id} className="flex items-center gap-2.5">
                <span className="w-28 shrink-0 truncate text-xs text-white/55">{a.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-white/10">
                  <div
                    className="h-full rounded-[var(--radius-pill)] transition-[width]"
                    style={{ width: `${pct}%`, background: accountColorVar(accountColorKey(a)) }}
                  />
                </div>
                <span className="num w-24 shrink-0 text-right text-xs font-bold text-white">{formatMoney(a.balance)}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Grid de cuentas (.wallet-cards / .wcard): cada tarjeta abre su detalle bajo
          demanda en un modal — ya no hay una cuenta "activa" fija con panel siempre
          visible debajo. El lápiz aparece al pasar el mouse o enfocar con teclado. */}
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Mis cuentas</p>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {liquid.map((a) => {
          const key = accountColorKey(a);
          const colorVar = accountColorVar(key);
          const isCashDescalce = a.type === 'efectivo' && a.balance < 0;
          const locked = lockedFor(a.id);
          const pct = total > 0 ? Math.max(0, (a.balance / total) * 100) : 0;
          const last = lastMovementFor(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setDetailId(a.id)}
              className={`group relative flex flex-col gap-3 rounded-[var(--radius-card)] border-[1.5px] bg-[var(--surface)] p-4.5 text-left transition-all hover:border-[var(--text-muted)] ${
                isCashDescalce ? 'border-[var(--amber)]' : 'border-[var(--border)]'
              }`}
            >
              <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)] opacity-0 shadow-[0_4px_10px_rgba(10,10,10,.1)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <i className="ph ph-pencil-simple text-sm" aria-hidden="true" />
              </span>

              <div className="flex items-center justify-between gap-2 pr-7">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                    style={{ background: accountColorSoft(key, 15), color: colorVar }}
                  >
                    <i className={`ph ${TYPE_ICONS[a.type as Exclude<AccountType, 'tarjeta'>]}`} aria-hidden="true" />
                  </span>
                  <p className="min-w-0 truncate text-[13px] font-bold text-[var(--text)]">
                    {locked && <i className="ph ph-lock-simple mr-1" aria-hidden="true" title={`Apartada para: ${locked.name}`} />}
                    {a.name}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[10.5px] font-semibold text-[var(--text-muted)]">
                  {TYPE_LABELS_SHORT[a.type as Exclude<AccountType, 'tarjeta'>]}
                </span>
              </div>

              <p className="num text-xl font-extrabold text-[var(--text)]">{formatMoney(isCashDescalce ? 0 : a.balance)}</p>

              {isCashDescalce ? (
                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--amber)]/35 bg-[var(--amber)]/[0.16] px-2 py-0.5 text-[10.5px] font-bold text-[var(--amber)]">
                  <i className="ph ph-warning" aria-hidden="true" /> Descalce {formatMoney(-a.balance)}
                </span>
              ) : (
                <>
                  <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                    <div className="h-full rounded-[var(--radius-pill)]" style={{ width: `${pct}%`, background: 'var(--brand)' }} />
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--text-faint)]">{pct.toFixed(1)}% de tu billetera</span>
                    {last && (
                      <span className={`num font-bold ${last.type === 'ingreso' ? 'text-[var(--green)]' : 'text-[var(--text-muted)]'}`}>
                        {last.type === 'ingreso' ? '+' : '-'}
                        {formatMoney(last.amount)}
                      </span>
                    )}
                  </div>
                </>
              )}

              {a.bank && (
                <div>
                  <BankBadge code={a.bank} />
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--text-faint)]">
                <span className="flex items-center gap-1">
                  <i className="ph ph-clock-counter-clockwise" aria-hidden="true" />
                  Último movimiento · {last ? relativeDate(last.date) : '—'}
                </span>
                <span className="flex items-center gap-0.5 font-bold text-[var(--brand)]">
                  Ver <i className="ph ph-caret-right text-[10px]" aria-hidden="true" />
                </span>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-raised)] text-center transition-colors hover:border-[var(--text-muted)]"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_6px_rgba(16,10,40,0.08)]">
            <i className="ph ph-plus" aria-hidden="true" />
          </span>
          <span className="text-[13px] font-bold text-[var(--text)]">Agregar una cuenta</span>
          <span className="text-[11.5px] text-[var(--text-faint)]">Banco, efectivo o billetera digital</span>
        </button>
      </div>

      {/* Movimientos recientes de la billetera + distribución del dinero entre cuentas. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Movimientos por cuenta</p>
          </div>
          {recentAcrossLiquid.length === 0 ? (
            <EmptyState bare compact icon="ph-receipt" title="Todavía no hay movimientos en tu billetera." />
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {recentAcrossLiquid.map((t) => {
                const acc = liquid.find((a) => a.id === t.accountId);
                const isIncome = t.type === 'ingreso';
                return (
                  <div key={t.id} className="flex items-center gap-2.5 py-2.5 first:pt-0 last:pb-0">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px]"
                      style={{ background: `color-mix(in srgb, var(${categoryColorVar(t.category)}) 13%, transparent)`, color: `var(${categoryColorVar(t.category)})` }}
                    >
                      <i className={`ph ${CATEGORY_ICONS[t.category] || 'ph-credit-card'}`} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[12.5px] font-semibold text-[var(--text)]">{t.description || t.category}</p>
                      <p className="text-[11px] text-[var(--text-faint)]">
                        {acc?.name || '—'} · {formatDate(t.date)}
                      </p>
                    </div>
                    <span className={`num shrink-0 text-[12.5px] font-bold ${isIncome ? 'text-[var(--green)]' : 'text-[var(--text-muted)]'}`}>
                      {isIncome ? '+' : '-'}
                      {formatMoney(t.amount)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <p className="mb-4 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">Distribución de tu dinero</p>
          <div className="flex flex-col items-center gap-4">
            <RingChart
              size={140}
              strokeWidth={16}
              rounded={false}
              segments={sorted.map((a) => ({
                pct: total > 0 ? (a.balance / total) * 100 : 0,
                color: accountColorVar(accountColorKey(a)),
              }))}
            >
              <span className="text-[9.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Total</span>
              <span className="num text-sm font-extrabold text-[var(--text)]">{formatMoney(total)}</span>
            </RingChart>
            <ul className="flex w-full flex-col gap-2">
              {sorted.map((a) => {
                const pct = total > 0 ? Math.round((a.balance / total) * 100) : 0;
                return (
                  <li key={a.id} className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: accountColorVar(accountColorKey(a)) }} />
                    <span className="min-w-0 flex-1 truncate">{a.name}</span>
                    <b className="num shrink-0 text-xs font-bold text-[var(--text)]">{formatMoney(a.balance)}</b>
                    <span className="w-8 shrink-0 text-right text-[11px] text-[var(--text-faint)]">{pct}%</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      </div>

      {/* Detalle bajo demanda (antes .wb-detail, siempre visible debajo de la grilla;
          ahora un modal que se abre solo al elegir una cuenta puntual). */}
      <AccountDetailModal
        account={detailAccount}
        data={data}
        onClose={() => setDetailId(null)}
        onEdit={openEdit}
        onDelete={handleDelete}
        onSetColor={(color) => detailAccount && setColor.mutate({ id: detailAccount.id, color })}
      />

      <AccountFormModal
        open={creating || !!editing}
        onClose={closeModal}
        title={editing ? 'Editar cuenta' : 'Nueva cuenta'}
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        loading={addAccount.isPending || updateAccount.isPending}
        error={error}
        lockType={!!editing}
      />
    </div>
  );
}

function AccountDetailModal({
  account,
  data,
  onClose,
  onEdit,
  onDelete,
  onSetColor,
}: {
  account: Account | null;
  data: AppState;
  onClose: () => void;
  onEdit: (a: Account) => void;
  onDelete: (a: Account) => void;
  onSetColor: (color: AccountColorKey) => void;
}) {
  if (!account) return null;

  const icon = TYPE_ICONS[account.type as Exclude<AccountType, 'tarjeta'>] || 'ph-vault';
  const isCashDescalce = account.type === 'efectivo' && account.balance < 0;
  const locked = data.pockets.find((p) => p.linkedAccountId === account.id) || null;

  const monthKey = new Date().toISOString().slice(0, 7);
  let mIn = 0;
  let mOut = 0;
  data.transactions.forEach((t) => {
    if (t.accountId !== account.id || !t.date || t.date.slice(0, 7) !== monthKey) return;
    if (t.type === 'ingreso') mIn += t.amount;
    else mOut += t.amount;
  });
  const mTotal = mIn + mOut;
  const inPct = mTotal > 0 ? Math.round((mIn / mTotal) * 100) : 50;

  const recent = [...data.transactions]
    .filter((t) => t.accountId === account.id)
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 4);

  return (
    <Modal open={!!account} onClose={onClose} size="lg">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
              <i className={`ph ${icon}`} aria-hidden="true" /> {account.name}
            </h2>
            <div className="flex gap-1.5">
              <IconButton icon="ph-pencil-simple" label="Editar" onClick={() => onEdit(account)} />
              <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={() => onDelete(account)} />
            </div>
          </div>

          {isCashDescalce && (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--amber)]/35 bg-[var(--amber)]/[0.1] p-3.5 text-sm text-[var(--text)]">
            <i className="ph ph-warning-circle mt-0.5 text-[var(--amber)]" aria-hidden="true" />
            <span>
              El efectivo no puede ser negativo — hay <strong className="num">{formatMoney(-account.balance)}</strong> en gastos
              registrados que este dinero físico no cubre.
            </span>
          </div>
        )}

        <dl className="flex flex-col">
          <Field label="Nombre" value={account.name} />
          <Field label="Tipo" value={TYPE_LABELS[account.type as Exclude<AccountType, 'tarjeta'>]} />
          {account.bank && <Field label="Banco" value={PERUVIAN_BANKS[account.bank] || account.bank} />}
          {(account.type === 'ahorro' || account.type === 'corriente') && (
            <>
              <Field label="Tasa de interés anual" value={account.interestRate ? `${account.interestRate}%` : '—'} />
              <Field label="Depósito automático" value={account.monthlyDeposit ? `${formatMoney(account.monthlyDeposit)} / mes` : '—'} />
            </>
          )}
          {locked && <Field label="Apartada para" value={locked.name} />}
          <Field label="Saldo actual" value={formatMoney(isCashDescalce ? 0 : account.balance)} strong />
        </dl>

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Color de la cuenta</p>
        <div className="flex gap-2">
          {ACCOUNT_COLOR_PALETTE.map((key) => {
            const isActive = accountColorKey(account) === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={`Color ${key}`}
                onClick={() => onSetColor(key)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                style={{ background: accountColorVar(key) }}
              >
                {isActive && <i className="ph ph-check text-xs" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        </div>

        <div className="lg:border-l lg:border-[var(--border)] lg:pl-5">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ingresos vs. gastos · esta cuenta</p>
        <div className="mb-2 flex h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
          <div className="h-full bg-[var(--green)]" style={{ width: `${inPct}%` }} />
          <div className="h-full bg-[var(--red)]" style={{ width: `${100 - inPct}%` }} />
        </div>
        <div className="mb-5 flex justify-between text-xs font-bold">
          <span className="flex items-center gap-1 text-[var(--green)]">
            <i className="ph ph-arrow-up" aria-hidden="true" /> <span className="num">{formatMoney(mIn)}</span>
          </span>
          <span className="flex items-center gap-1 text-[var(--red)]">
            <i className="ph ph-arrow-down" aria-hidden="true" /> <span className="num">{formatMoney(mOut)}</span>
          </span>
        </div>

        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Movimientos recientes</p>
        {recent.length === 0 ? (
          <p className="py-2 text-sm text-[var(--text-muted)]">Sin movimientos todavía en esta cuenta.</p>
        ) : (
          <div className="flex flex-col">
            {recent.map((t) => {
              const isIncome = t.type === 'ingreso';
              const colorVar = categoryColorVar(t.category);
              return (
                <div key={t.id} className="flex items-center gap-2.5 border-t border-[var(--border)] py-2 first:border-t-0">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]"
                    style={{ background: `color-mix(in srgb, var(${colorVar}) 13%, transparent)`, color: `var(${colorVar})` }}
                  >
                    <i className={`ph ${CATEGORY_ICONS[t.category] || 'ph-credit-card'}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[12.5px] font-semibold text-[var(--text)]">{t.description || t.category}</p>
                    <p className="text-[11px] text-[var(--text-faint)]">{formatDate(t.date)}</p>
                  </div>
                  <span className={`num shrink-0 text-[12.5px] font-bold ${isIncome ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                    {isIncome ? '+' : '-'}
                    {formatMoney(t.amount)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        </div>
      </div>

      <div className="mt-5 flex justify-end border-t border-[var(--border)] pt-4">
        <GradientButton type="button" variant="ghost" onClick={onClose}>
          Cerrar
        </GradientButton>
      </div>
    </Modal>
  );
}

function Field({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] py-2.5 last:border-b-0">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className={`num font-bold text-[var(--text)] ${strong ? 'text-base' : 'text-sm'}`}>{value}</dd>
    </div>
  );
}

function AccountFormModal({
  open,
  onClose,
  title,
  form,
  setForm,
  onSubmit,
  loading,
  error,
  lockType = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
  lockType?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Select label="Tipo" value={form.type} disabled={lockType} onChange={(e) => setForm({ ...form, type: e.target.value as FormState['type'] })}>
          {(Object.keys(TYPE_LABELS) as Array<keyof typeof TYPE_LABELS>).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Input
          label="Saldo"
          type="number"
          step="0.01"
          required
          value={form.balance}
          onChange={(e) => setForm({ ...form, balance: e.target.value })}
        />
        {form.type !== 'efectivo' && (
          <>
            <Select label="Banco (opcional)" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
              <option value="">Sin banco específico</option>
              {Object.entries(PERUVIAN_BANKS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Tasa de interés % (opcional)"
                type="number"
                step="0.01"
                value={form.interestRate}
                onChange={(e) => setForm({ ...form, interestRate: e.target.value })}
              />
              <Input
                label="Depósito mensual (opcional)"
                type="number"
                step="0.01"
                value={form.monthlyDeposit}
                onChange={(e) => setForm({ ...form, monthlyDeposit: e.target.value })}
              />
            </div>
          </>
        )}
        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}
        <GradientButton type="submit" loading={loading} className="w-full">
          {title === 'Nueva cuenta' ? 'Crear cuenta' : 'Guardar cambios'}
        </GradientButton>
      </form>
    </Modal>
  );
}

const EASE = [0.16, 1, 0.3, 1] as const;

// Barras de evolución mensual del total de la billetera, seleccionables por
// click — mismo patrón que el hero "Lo que tengo" de Inicio (barra activa
// resaltada + tooltip animado), acá acotado a las cuentas líquidas de esta
// pantalla. `selectedIdx`/`onSelect` viven en el componente padre para que el
// chip de mes y las barras compartan el mismo estado.
function EvolutionBars({
  points,
  labels,
  selectedIdx,
  onSelect,
}: {
  points: number[];
  labels: string[];
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const W = 480;
  const H = 170;
  const PAD_Y = 14;

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
  }, [points]);

  if (bars.length < 2) return <div style={{ height: H }} aria-hidden="true" />;
  const active = bars[Math.min(selectedIdx, bars.length - 1)];
  const tooltipDelay = reduceMotion ? 0 : 0.9;

  return (
    <div className="relative">
      <div className="relative" style={{ height: H }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="none">
          {bars.map((b, i) => (
            <motion.rect
              key={i}
              width={b.width}
              rx={6}
              onClick={() => onSelect(i)}
              className="cursor-pointer"
              initial={reduceMotion ? false : { x: b.x, y: H - PAD_Y, height: 0, fill: 'rgba(255,255,255,0.16)' }}
              animate={{ x: b.x, y: b.y, height: b.height, fill: i === selectedIdx ? 'var(--ink-accent)' : 'rgba(255,255,255,0.16)' }}
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
          style={{ transform: 'translate(-50%,-100%)', whiteSpace: 'nowrap', background: 'var(--ink-chip)', color: 'var(--sidebar-bg)' }}
          initial={reduceMotion ? false : { opacity: 0 }}
          animate={{
            opacity: 1,
            left: `${Math.min(92, Math.max(8, (active.cx / W) * 100))}%`,
            top: `${Math.max(0, (active.y / H) * 100 - 12)}%`,
          }}
          transition={{ duration: reduceMotion ? 0 : 0.35, delay: reduceMotion ? 0 : tooltipDelay, ease: EASE }}
        >
          {formatMoney(points[Math.min(selectedIdx, points.length - 1)])}
        </motion.div>
      </div>
      <div className="mt-1.5 flex justify-between text-[10.5px] text-white/40">
        {labels.map((l, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelect(i)}
            className={`transition-opacity ${i === selectedIdx ? 'font-bold text-white' : 'opacity-70 hover:opacity-100'}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

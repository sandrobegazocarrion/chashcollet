import { useEffect, useMemo, useRef, useState } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import { categoryColorVar } from '../../lib/categoryColor';
import { ImportWizard } from './ImportWizard';
import { TransactionSheet } from './TransactionSheet';
import type { AppState, Transaction } from '../../lib/types';

export const CATEGORY_ICONS: Record<string, string> = {
  Comida: 'ph-hamburger',
  Transporte: 'ph-car',
  Hogar: 'ph-house-simple',
  Entretenimiento: 'ph-film-strip',
  Salud: 'ph-pill',
  Otros: 'ph-credit-card',
};
export const ACC_ICONS: Record<string, string> = { ahorro: 'ph-vault', corriente: 'ph-bank', efectivo: 'ph-coins', tarjeta: 'ph-credit-card' };

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// "Hoy" / "Ayer" / "3 de agosto" — portado de dateGroupLabel() en app.js.
function dateGroupLabel(iso: string): string {
  const today = todayStr();
  const yd = new Date();
  yd.setDate(yd.getDate() - 1);
  const yStr = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, '0')}-${String(yd.getDate()).padStart(2, '0')}`;
  if (iso === today) return 'Hoy';
  if (iso === yStr) return 'Ayer';
  const d = new Date(`${iso}T00:00:00`);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  const label = d.toLocaleDateString('es-PE', sameYear ? { day: 'numeric', month: 'long' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Espeja #tab-transacciones de la app vieja: buscador + 3 chips de filtro, stats de
// la lista filtrada, barra de proporción por categoría, y la lista agrupada por
// fecha (Hoy/Ayer/fecha) con acciones que aparecen al pasar el mouse.
export function TransaccionesPage({
  data,
  focusSearchSignal,
  newTxSignal,
}: {
  data: AppState;
  focusSearchSignal?: number;
  newTxSignal?: number;
}) {
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAccount, setFilterAccount] = useState('');
  const [filterCategory, setFilterCategory] = useState('');

  const searchInputRef = useRef<HTMLInputElement>(null);
  // Portado de focusTxSearch() en app.js — el ícono de búsqueda del topbar cambia a
  // esta pestaña y dispara este efecto incrementando focusSearchSignal.
  useEffect(() => {
    if (!focusSearchSignal) return;
    const t = setTimeout(() => {
      searchInputRef.current?.focus();
      searchInputRef.current?.scrollIntoView({ block: 'center' });
    }, 50);
    return () => clearTimeout(t);
  }, [focusSearchSignal]);

  // Mismo mecanismo que focusSearchSignal, para el FAB de mobile: al tocarlo desde
  // cualquier pestaña, <AppShell> navega acá e incrementa newTxSignal.
  useEffect(() => {
    if (!newTxSignal) return;
    setCreating(true);
  }, [newTxSignal]);

  const deleteTx = useApiMutation<{ id: string }, void>('DELETE', (body) => `/api/transactions/${body.id}`);

  function openCreate() {
    setCreating(true);
  }
  function openEdit(tx: Transaction) {
    setEditing(tx);
  }
  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function handleDelete(tx: Transaction) {
    if (!confirm('¿Eliminar este movimiento?')) return;
    try {
      await deleteTx.mutateAsync({ id: tx.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar el movimiento.');
    }
  }

  const hasFilters = !!(filterType || filterAccount || filterCategory || search.trim());

  const list = useMemo(() => {
    let l = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if (filterType) l = l.filter((t) => t.type === filterType);
    if (filterAccount) l = l.filter((t) => t.accountId === filterAccount);
    if (filterCategory) l = l.filter((t) => t.category === filterCategory);
    const q = search.trim().toLowerCase();
    if (q) l = l.filter((t) => (t.description || '').toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
    return l;
  }, [data.transactions, filterType, filterAccount, filterCategory, search]);

  const { sumIn, sumOut } = useMemo(() => {
    let sumIn = 0;
    let sumOut = 0;
    list.forEach((t) => (t.type === 'ingreso' ? (sumIn += t.amount) : (sumOut += t.amount)));
    return { sumIn, sumOut };
  }, [list]);

  const catSegments = useMemo(() => {
    const catMap: Record<string, number> = {};
    list.forEach((t) => {
      if (t.type !== 'gasto') return;
      catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const allCats = Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]);
    const totalGasto = allCats.reduce((s, c) => s + catMap[c], 0);
    const MIN_PCT = 3;
    const main = allCats.filter((c) => totalGasto === 0 || (catMap[c] / totalGasto) * 100 >= MIN_PCT);
    const small = allCats.filter((c) => !main.includes(c));
    const entries = main.map((c) => ({ label: c, amount: catMap[c], colorVar: categoryColorVar(c) }));
    if (small.length) {
      const smallTotal = small.reduce((s, c) => s + catMap[c], 0);
      entries.push({ label: `Varios (${small.length})`, amount: smallTotal, colorVar: '--text-faint' });
    }
    return { entries, totalGasto };
  }, [list]);

  const groups = useMemo(() => {
    const g: { label: string; items: Transaction[] }[] = [];
    let current: { label: string; items: Transaction[] } | null = null;
    list.forEach((tx) => {
      const label = dateGroupLabel(tx.date);
      if (!current || current.label !== label) {
        current = { label, items: [] };
        g.push(current);
      }
      current.items.push(tx);
    });
    return g;
  }, [list]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Transacciones" actionLabel="Nuevo movimiento" onAction={openCreate}>
        <GradientButton variant="ghost" onClick={() => setImporting(true)}>
          <i className="ph ph-upload-simple" aria-hidden="true" /> Importar
        </GradientButton>
      </PageHeader>

      <ImportWizard open={importing} onClose={() => setImporting(false)} data={data} />

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-[220px] max-w-xs flex-1 items-center gap-2 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2">
          <i className="ph ph-magnifying-glass text-[var(--text-faint)]" aria-hidden="true" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Buscar por descripción…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-none bg-transparent text-[13.5px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
          />
        </div>
        <FilterChip
          value={filterType}
          onChange={setFilterType}
          placeholder="Tipo"
          options={[
            { value: 'ingreso', label: 'Ingresos' },
            { value: 'gasto', label: 'Gastos' },
          ]}
        />
        <FilterChip
          value={filterAccount}
          onChange={setFilterAccount}
          placeholder="Cuenta"
          options={data.accounts.map((a) => ({ value: a.id, label: a.name }))}
        />
        <FilterChip
          value={filterCategory}
          onChange={setFilterCategory}
          placeholder="Categoría"
          options={data.categories.map((c) => ({ value: c, label: c }))}
        />
      </div>

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] py-16 text-center">
          <i className="ph ph-receipt text-3xl text-[var(--text-faint)]" aria-hidden="true" />
          <p className="font-semibold text-[var(--text)]">
            {hasFilters ? 'No hay transacciones con estos filtros' : 'No hay transacciones todavía'}
          </p>
          <p className="text-sm text-[var(--text-muted)]">
            {hasFilters ? 'Prueba quitar algún filtro o la búsqueda.' : 'Agrega tu primer ingreso o gasto con el botón de arriba.'}
          </p>
        </div>
      ) : (
        <>
          {/* Stats de la lista filtrada */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatTile icon="ph-list" label="Movimientos" value={String(list.length)} />
            <StatTile icon="ph-arrow-up" label="Ingresos" value={formatMoney(sumIn)} colorVar="--green" />
            <StatTile icon="ph-arrow-down" label="Gastos" value={formatMoney(sumOut)} colorVar="--red" />
          </div>

          {/* Barra de proporción por categoría */}
          {catSegments.entries.length > 0 && (
            <div className="rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4">
              <div className="mb-2.5 flex h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                {catSegments.entries.map((e) => (
                  <span
                    key={e.label}
                    title={e.label}
                    style={{ width: `${catSegments.totalGasto > 0 ? (e.amount / catSegments.totalGasto) * 100 : 0}%`, background: `var(${e.colorVar})` }}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3.5 text-xs text-[var(--text-muted)]">
                {catSegments.entries.map((e) => (
                  <span key={e.label} className="inline-flex items-center">
                    <span className="mr-1.5 h-1.5 w-1.5 rounded-full" style={{ background: `var(${e.colorVar})` }} />
                    {e.label}{' '}
                    <b className="num ml-1 font-bold text-[var(--text)]">
                      {catSegments.totalGasto > 0 ? Math.round((e.amount / catSegments.totalGasto) * 100) : 0}%
                    </b>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Lista agrupada por fecha */}
          <div className="rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] px-3.5 py-1">
            {groups.map((g) => (
              <div key={g.label} className="border-t border-[var(--border)] first:border-t-0">
                <div className="px-1 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{g.label}</div>
                {g.items.map((tx) => {
                  const acc = data.accounts.find((a) => a.id === tx.accountId);
                  const isIncome = tx.type === 'ingreso';
                  const colorVar = categoryColorVar(tx.category);
                  return (
                    <div
                      key={tx.id}
                      className="group flex items-center gap-3.5 rounded-[var(--radius-control)] border-l-2 py-3 pl-3 pr-2.5 hover:bg-[var(--surface-raised)]"
                      style={{ borderLeftColor: `var(${colorVar})` }}
                    >
                      <span
                        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full text-[17px]"
                        style={{ background: `color-mix(in srgb, var(${colorVar}) 13%, transparent)`, color: `var(${colorVar})` }}
                      >
                        <i className={`ph ${CATEGORY_ICONS[tx.category] || 'ph-credit-card'}`} aria-hidden="true" />
                      </span>
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <span className="truncate text-[14.5px] font-semibold text-[var(--text)]">{tx.description || tx.category}</span>
                        <span
                          className="hidden shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold sm:inline-block"
                          style={{ background: `color-mix(in srgb, var(${colorVar}) 13%, transparent)`, color: `var(${colorVar})` }}
                        >
                          {tx.category}
                        </span>
                      </div>
                      <span className="hidden w-[140px] shrink-0 items-center gap-1.5 truncate text-xs text-[var(--text-muted)] md:flex">
                        <i className={`ph ${ACC_ICONS[acc?.type || ''] || 'ph-wallet'} text-[var(--text-faint)]`} aria-hidden="true" />
                        {acc ? acc.name : '(cuenta eliminada)'}
                      </span>
                      <span className={`num w-[110px] shrink-0 text-right text-[14.5px] font-bold ${isIncome ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                        {isIncome ? '+' : '-'}
                        {formatMoney(tx.amount)}
                      </span>
                      <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <IconButton icon="ph-pencil-simple" label="Editar" onClick={() => openEdit(tx)} />
                        <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={() => handleDelete(tx)} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}

      <TransactionSheet open={creating || !!editing} editing={editing} onClose={closeModal} data={data} />
    </div>
  );
}

function StatTile({ icon, label, value, colorVar }: { icon: string; label: string; value: string; colorVar?: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4">
      <span
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-lg"
        style={colorVar ? { color: `var(${colorVar})` } : undefined}
      >
        <i className={`ph ${icon}`} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <p className="num text-xl font-extrabold" style={colorVar ? { color: `var(${colorVar})` } : { color: 'var(--text)' }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function FilterChip({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  const active = !!value;
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`appearance-none rounded-[var(--radius-pill)] border py-2 pl-3.5 text-[12.5px] font-semibold outline-none ${
          active ? 'border-[var(--brand)] bg-[var(--brand)] pr-7 text-white' : 'border-[var(--border)] bg-[var(--surface)] pr-7 text-[var(--text-muted)]'
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {active && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={`Quitar filtro de ${placeholder}`}
          className="absolute right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/15 text-[10px] text-white"
        >
          <i className="ph ph-x" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

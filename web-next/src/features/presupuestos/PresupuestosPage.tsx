import { useMemo, useState, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import { budgetHealth, budgetPct, budgetSpent, BUDGET_TONE_VAR, currentPeriod } from '../../lib/budgets';
import type { AppState, Budget, BudgetType } from '../../lib/types';

const TYPE_LABELS: Record<BudgetType, string> = { general: 'Tope general', categoria: 'Por categoría', cuenta: 'Por cuenta/tarjeta' };

function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
}
function shiftPeriod(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

interface BudgetFormState {
  type: BudgetType;
  categoryName: string;
  accountId: string;
  amountLimit: string;
}
function emptyForm(): BudgetFormState {
  return { type: 'general', categoryName: '', accountId: '', amountLimit: '' };
}

// Pantalla dedicada de Presupuestos (Fase 5): 3 niveles — tope general, por
// categoría y por cuenta/tarjeta — con navegación de mes para ver el histórico.
// El monto gastado nunca se guarda: se calcula en vivo desde `data.transactions`
// (lib/budgets.ts), así que siempre refleja la realidad sin job de recálculo.
export function PresupuestosPage({ data }: { data: AppState }) {
  const [period, setPeriod] = useState(currentPeriod());
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<BudgetFormState>(emptyForm());
  const [editing, setEditing] = useState<Budget | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addBudget = useApiMutation<unknown, Budget>('POST', '/api/budgets');
  const updateBudget = useApiMutation<{ id: string; amountLimit: number }, Budget>('PUT', (b) => `/api/budgets/${b.id}`);
  const deleteBudget = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/budgets/${b.id}`);

  const budgetsThisPeriod = useMemo(() => data.budgets.filter((b) => b.period === period), [data.budgets, period]);
  const general = budgetsThisPeriod.find((b) => b.type === 'general') || null;
  const byCategory = budgetsThisPeriod.filter((b) => b.type === 'categoria');
  const byAccount = budgetsThisPeriod.filter((b) => b.type === 'cuenta');

  const takenCategories = new Set(byCategory.map((b) => b.categoryName));
  const takenAccounts = new Set(byAccount.map((b) => b.accountId));
  const availableCategories = data.categories.filter((c) => !takenCategories.has(c));
  const availableAccounts = data.accounts.filter((a) => !takenAccounts.has(a.id));

  function openCreate() {
    const defaultType: BudgetType = !general ? 'general' : availableCategories.length > 0 ? 'categoria' : 'cuenta';
    setForm({ ...emptyForm(), type: defaultType });
    setError(null);
    setCreating(true);
  }
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addBudget.mutateAsync({
        period,
        type: form.type,
        categoryName: form.type === 'categoria' ? form.categoryName : undefined,
        accountId: form.type === 'cuenta' ? form.accountId : undefined,
        amountLimit: Number(form.amountLimit),
      });
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear el presupuesto.');
    }
  }

  function openEdit(b: Budget) {
    setEditAmount(String(b.amountLimit));
    setError(null);
    setEditing(b);
  }
  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await updateBudget.mutateAsync({ id: editing.id, amountLimit: Number(editAmount) });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  const hasAny = budgetsThisPeriod.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--text)]">Presupuestos</h1>
        <GradientButton onClick={openCreate} disabled={!!general && availableCategories.length === 0 && availableAccounts.length === 0}>
          <i className="ph ph-plus" aria-hidden="true" /> Nuevo presupuesto
        </GradientButton>
      </div>

      <div className="flex items-center gap-2">
        <IconButton icon="ph-caret-left" label="Mes anterior" onClick={() => setPeriod((p) => shiftPeriod(p, -1))} />
        <span className="min-w-[150px] text-center text-sm font-bold capitalize text-[var(--text)]">{monthLabel(period)}</span>
        <IconButton icon="ph-caret-right" label="Mes siguiente" onClick={() => setPeriod((p) => shiftPeriod(p, 1))} />
      </div>

      {!hasAny ? (
        <EmptyState
          icon="ph-wallet"
          title={`Todavía no configuraste un presupuesto para ${monthLabel(period)}`}
          subtitle="Ponle un tope a tu gasto general, a una categoría, o a una cuenta/tarjeta específica — así 'Gastos por categoría' deja de ser solo un espejo retrovisor."
          cta={{ label: '+ Nuevo presupuesto', onClick: openCreate }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {general && <BudgetCard key={general.id} budget={general} data={data} title="Tope general del mes" onEdit={() => openEdit(general)} onDelete={() => deleteBudget.mutate({ id: general.id })} />}
          {byCategory.map((b) => (
            <BudgetCard key={b.id} budget={b} data={data} title={b.categoryName || 'Categoría'} onEdit={() => openEdit(b)} onDelete={() => deleteBudget.mutate({ id: b.id })} />
          ))}
          {byAccount.map((b) => {
            const acc = data.accounts.find((a) => a.id === b.accountId);
            return <BudgetCard key={b.id} budget={b} data={data} title={acc?.name || 'Cuenta'} onEdit={() => openEdit(b)} onDelete={() => deleteBudget.mutate({ id: b.id })} />;
          })}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo presupuesto">
        <form onSubmit={handleCreate} className="flex flex-col gap-4">
          <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as BudgetType })}>
            {!general && <option value="general">{TYPE_LABELS.general}</option>}
            {availableCategories.length > 0 && <option value="categoria">{TYPE_LABELS.categoria}</option>}
            {availableAccounts.length > 0 && <option value="cuenta">{TYPE_LABELS.cuenta}</option>}
          </Select>
          {form.type === 'categoria' && (
            <Select label="Categoría" required value={form.categoryName} onChange={(e) => setForm({ ...form, categoryName: e.target.value })}>
              <option value="">Elige una categoría</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          )}
          {form.type === 'cuenta' && (
            <Select label="Cuenta o tarjeta" required value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value })}>
              <option value="">Elige una cuenta</option>
              {availableAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
          <Input label="Monto tope" type="number" step="0.01" min={0.01} required value={form.amountLimit} onChange={(e) => setForm({ ...form, amountLimit: e.target.value })} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={addBudget.isPending} className="w-full">
            Crear presupuesto
          </GradientButton>
        </form>
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar monto tope">
        <form onSubmit={handleEdit} className="flex flex-col gap-4">
          <Input label="Monto tope" type="number" step="0.01" min={0.01} required value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={updateBudget.isPending} className="w-full">
            Guardar
          </GradientButton>
        </form>
      </Modal>
    </div>
  );
}

function BudgetCard({ budget, data, title, onEdit, onDelete }: { budget: Budget; data: AppState; title: string; onEdit: () => void; onDelete: () => void }) {
  const spent = budgetSpent(data, budget);
  const pct = budgetPct(data, budget);
  const tone = budgetHealth(pct);
  const toneVar = BUDGET_TONE_VAR[tone];
  const remaining = Math.max(0, budget.amountLimit - spent);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">{TYPE_LABELS[budget.type]}</p>
          <p className="truncate text-[15px] font-extrabold text-[var(--text)]">{title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton icon="ph-pencil-simple" label="Editar" onClick={onEdit} />
          <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={onDelete} />
        </div>
      </div>

      <div className="flex items-end justify-between">
        <p className="num text-2xl font-extrabold text-[var(--text)]">{formatMoney(spent)}</p>
        <p className="num text-sm text-[var(--text-muted)]">de {formatMoney(budget.amountLimit)}</p>
      </div>

      <div className="h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
        <div className="h-full rounded-[var(--radius-pill)] transition-[width]" style={{ width: `${Math.min(100, pct)}%`, background: `var(${toneVar})` }} />
      </div>

      <p className="text-[12px] font-semibold" style={{ color: `var(${toneVar})` }}>
        {pct >= 100 ? `Superado por ${formatMoney(spent - budget.amountLimit)}` : `${pct}% usado · quedan ${formatMoney(remaining)}`}
      </p>
    </Card>
  );
}

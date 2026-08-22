import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatDate, formatMoney } from '../../lib/finance';
import { ACCOUNT_COLOR_PALETTE, accountColorKey, accountColorVar, type AccountColorKey } from '../../lib/accountColor';
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailAccount = liquid.find((a) => a.id === detailId) || null;

  const [editing, setEditing] = useState<Account | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

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
        <Card className="flex flex-col items-center gap-2 py-14 text-center">
          <i className="ph ph-wallet text-3xl text-[var(--text-faint)]" aria-hidden="true" />
          <p className="font-semibold text-[var(--text)]">Todavía no tienes cuentas en tu billetera</p>
          <p className="text-sm text-[var(--text-muted)]">
            Crea una cuenta de ahorros, corriente o efectivo para ver el total de tu dinero aquí.
          </p>
        </Card>
        <AccountFormModal open={creating} onClose={closeModal} title="Nueva cuenta" form={form} setForm={setForm} onSubmit={handleSubmit} loading={addAccount.isPending} error={error} />
      </div>
    );
  }

  const total = liquid.reduce((s, a) => s + a.balance, 0);
  const sorted = [...liquid].sort((a, b) => b.balance - a.balance);

  const lockedFor = (accountId: string) => data.pockets.find((p) => p.linkedAccountId === accountId) || null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Mi Billetera" actionLabel="Nueva cuenta" onAction={openCreate} />

      {/* Hero: total + reparto por cuenta (.wallet-hero) */}
      <Card variant="hero">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          <i className="ph ph-wallet" aria-hidden="true" /> Total en tu Billetera
        </p>
        <p className="num mt-1.5 break-words text-3xl font-extrabold tracking-tight text-[var(--text)] sm:text-4xl">{formatMoney(total)}</p>
        <div className="mt-5 flex flex-col gap-2">
          {sorted.map((a) => {
            const pct = total > 0 ? Math.max(2, Math.round((a.balance / total) * 100)) : 0;
            return (
              <div key={a.id} className="flex items-center gap-2.5">
                <span className="w-28 shrink-0 truncate text-xs text-[var(--text-muted)]">{a.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)]">
                  <div
                    className="h-full rounded-[var(--radius-pill)] transition-[width]"
                    style={{ width: `${pct}%`, background: accountColorVar(accountColorKey(a)) }}
                  />
                </div>
                <span className="num w-24 shrink-0 text-right text-xs font-bold text-[var(--text)]">{formatMoney(a.balance)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Grid de cuentas (.wallet-cards / .wcard): cada tarjeta abre su detalle bajo
          demanda en un modal — ya no hay una cuenta "activa" fija con panel siempre
          visible debajo. El lápiz aparece al pasar el mouse o enfocar con teclado. */}
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--text-muted)]">Mis cuentas</p>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {liquid.map((a) => {
          const key = accountColorKey(a);
          const isCashDescalce = a.type === 'efectivo' && a.balance < 0;
          const locked = lockedFor(a.id);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setDetailId(a.id)}
              className={`group relative flex min-h-[150px] flex-col gap-2.5 rounded-[var(--radius-card)] border-[1.5px] p-4.5 text-left transition-all hover:border-[var(--text-muted)] ${
                isCashDescalce ? 'border-[var(--amber)]' : 'border-[var(--border)]'
              }`}
            >
              <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text-muted)] opacity-0 shadow-[0_4px_10px_rgba(10,10,10,.1)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <i className="ph ph-pencil-simple text-sm" aria-hidden="true" />
              </span>
              <span
                className="flex h-[34px] w-[34px] items-center justify-center rounded-[9px] text-white"
                style={{ background: accountColorVar(key) }}
              >
                <i className={`ph ${TYPE_ICONS[a.type as Exclude<AccountType, 'tarjeta'>]}`} aria-hidden="true" />
              </span>
              <p className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
                {locked && <i className="ph ph-lock-simple mr-1" aria-hidden="true" title={`Apartada para: ${locked.name}`} />}
                {a.name}
              </p>
              <p className="num -mt-1 text-xl font-extrabold text-[var(--text)]">{formatMoney(isCashDescalce ? 0 : a.balance)}</p>
              {isCashDescalce && (
                <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--amber)]/35 bg-[var(--amber)]/[0.16] px-2 py-0.5 text-[10.5px] font-bold text-[var(--amber)]">
                  <i className="ph ph-warning" aria-hidden="true" /> Descalce {formatMoney(-a.balance)}
                </span>
              )}
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                {a.bank ? (
                  <>
                    <BankBadge code={a.bank} />
                    <span className="text-xs text-[var(--text-muted)]">{TYPE_LABELS[a.type as Exclude<AccountType, 'tarjeta'>]}</span>
                  </>
                ) : (
                  <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[10.5px] text-[var(--text)]">
                    {TYPE_LABELS[a.type as Exclude<AccountType, 'tarjeta'>]}
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[150px] flex-row items-center justify-center gap-1.5 rounded-[var(--radius-card)] border-[1.5px] border-dashed border-[var(--border)] text-[13px] font-semibold text-[var(--text-faint)] hover:border-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <i className="ph ph-plus" aria-hidden="true" />
          <span>Nueva cuenta</span>
        </button>
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

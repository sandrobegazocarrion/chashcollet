import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { Switch } from '../../components/ui/Switch';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatDate, formatMoney, pocketMonthProgress } from '../../lib/finance';
import { ACCOUNT_COLOR_PALETTE, accountColorKey, accountColorSoft, accountColorVar, type AccountColorKey } from '../../lib/accountColor';
import type { AppState, Pocket } from '../../lib/types';

interface FormState {
  name: string;
  balance: string;
  monthlyTarget: string;
  target: string;
  targetDate: string;
  rate: string;
  linkedAccountId: string;
  notifyBehind: boolean;
}
function emptyForm(): FormState {
  return { name: '', balance: '0', monthlyTarget: '', target: '', targetDate: '', rate: '', linkedAccountId: '', notifyBehind: false };
}
function pocketToForm(p: Pocket): FormState {
  return {
    name: p.name,
    balance: '0',
    monthlyTarget: p.monthlyTarget != null ? String(p.monthlyTarget) : '',
    target: p.target != null ? String(p.target) : '',
    targetDate: p.targetDate || '',
    rate: '',
    linkedAccountId: p.linkedAccountId || '',
    notifyBehind: false,
  };
}

// Espeja #tab-bolsillos ("Chanchito · Ahorro"): banner de prioridad si hay una
// tarjeta muy cara de usar, stats, grid de metas seleccionables (.gcard) y un panel
// de detalle a dos columnas (barras + campos + swatches | historial de aportes).
export function ChanchitosPage({ data }: { data: AppState }) {
  const [selectedId, setSelectedId] = useState(() => data.pockets.find((p) => p.isPrimary)?.id || data.pockets[0]?.id || '');
  const selected = data.pockets.find((p) => p.id === selectedId) || data.pockets[0];

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Pocket | null>(null);
  const [moving, setMoving] = useState<{ pocket: Pocket; direction: 'meter' | 'sacar' } | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [moveAmount, setMoveAmount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addPocket = useApiMutation<unknown, Pocket>('POST', '/api/pockets');
  const updatePocket = useApiMutation<{ id: string } & Record<string, unknown>, Pocket>('PUT', (b) => `/api/pockets/${b.id}`);
  const deletePocket = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/pockets/${b.id}`);
  const setColor = useApiMutation<{ id: string; color: AccountColorKey }, Pocket>('PUT', (b) => `/api/pockets/${b.id}`);
  const setField = useApiMutation<{ id: string } & Record<string, unknown>, Pocket>('PUT', (b) => `/api/pockets/${b.id}`);
  const movePocket = useApiMutation<{ id: string; direction: string; amount: number }, Pocket>('POST', (b) => `/api/pockets/${b.id}/move`);
  const deleteContribution = useApiMutation<{ pocketId: string; cid: string }, void>('DELETE', (b) => `/api/pockets/${b.pocketId}/contributions/${b.cid}`);

  function openCreate() {
    setForm(emptyForm());
    setError(null);
    setCreating(true);
  }
  function openEdit(p: Pocket) {
    setForm(pocketToForm(p));
    setError(null);
    setEditing(p);
  }
  function closeModal() {
    setCreating(false);
    setEditing(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = {
      name: form.name.trim(),
      balance: editing ? undefined : Number(form.balance) || 0,
      monthlyTarget: form.monthlyTarget ? Number(form.monthlyTarget) : undefined,
      target: form.target ? Number(form.target) : undefined,
      targetDate: form.targetDate || undefined,
      rate: form.rate ? Number(form.rate) : undefined,
      linkedAccountId: form.linkedAccountId || undefined,
      notifyBehind: form.notifyBehind,
    };
    try {
      if (editing) {
        const updated = await updatePocket.mutateAsync({ id: editing.id, ...body });
        setSelectedId(updated.id);
      } else {
        const created = await addPocket.mutateAsync(body);
        setSelectedId(created.id);
      }
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la meta.');
    }
  }

  async function handleDelete(p: Pocket) {
    if (!confirm(`¿Eliminar la meta "${p.name}"? Se pierde el saldo apartado.`)) return;
    try {
      await deletePocket.mutateAsync({ id: p.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar.');
    }
  }

  async function handleMove(e: FormEvent) {
    e.preventDefault();
    if (!moving) return;
    setError(null);
    try {
      await movePocket.mutateAsync({ id: moving.pocket.id, direction: moving.direction, amount: Number(moveAmount) });
      setMoving(null);
      setMoveAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo mover el saldo.');
    }
  }

  const priorityCard = useMemo(() => {
    const critical = data.accounts.filter((a) => {
      if (a.type !== 'tarjeta' || !a.creditLimit) return false;
      return a.balance > a.creditLimit || (a.balance / a.creditLimit) * 100 > 90;
    });
    if (critical.length === 0 || data.pockets.length === 0) return null;
    return critical.sort((a, b) => b.balance / b.creditLimit! - a.balance / a.creditLimit!)[0];
  }, [data.accounts, data.pockets.length]);

  if (data.pockets.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Chanchito · Ahorro" actionLabel="Nueva meta" onAction={openCreate} />
        <EmptyState
          icon="ph-piggy-bank"
          title="No tienes chanchitos de ahorro"
          subtitle="Crea uno para empezar a apartar dinero hacia una meta."
          cta={{ label: '+ Nueva meta', onClick: openCreate }}
        />
        <PocketFormModal open={creating} onClose={closeModal} title="Nueva meta de ahorro" form={form} setForm={setForm} onSubmit={handleSubmit} loading={addPocket.isPending} error={error} data={data} isNew />
      </div>
    );
  }

  const totalSaved = data.pockets.reduce((s, p) => s + p.balance, 0);
  let monthSaved = 0;
  let monthTarget = 0;
  let behindCount = 0;
  let trackedCount = 0;
  data.pockets.forEach((p) => {
    if (!p.monthlyTarget) return;
    trackedCount++;
    const mp = pocketMonthProgress(p);
    monthSaved += mp.saved;
    monthTarget += p.monthlyTarget;
    if (mp.behind) behindCount++;
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Chanchito · Ahorro" actionLabel="Nueva meta" onAction={openCreate} />

      {priorityCard && (
        <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--red)]/30 bg-[var(--red)]/[0.13] p-3.5 text-sm text-[var(--text)]">
          <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[var(--red)]" aria-hidden="true" />
          <span>
            Tu tarjeta <strong>{priorityCard.name}</strong>{' '}
            {priorityCard.balance > priorityCard.creditLimit! ? 'está en sobregiro' : `está al ${Math.round((priorityCard.balance / priorityCard.creditLimit!) * 100)}% de uso`} — el
            interés de eso probablemente sea más alto que lo que rinde este ahorro. Considera destinar ese dinero a bajar la tarjeta primero.
          </span>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon="ph-piggy-bank" label="Ahorrado en total" value={formatMoney(totalSaved)} />
        <StatTile
          icon="ph-check"
          label={`Este mes: ${new Date().toLocaleDateString('es-PE', { month: 'long' })}`}
          value={formatMoney(monthSaved) + (monthTarget > 0 ? ` de ${formatMoney(monthTarget)}` : '')}
          colorVar="--green"
        />
        <StatTile icon={behindCount > 0 ? 'ph-warning-circle' : 'ph-check'} label="Metas atrasadas" value={`${behindCount} de ${trackedCount}`} colorVar={behindCount > 0 ? '--amber' : '--green'} />
      </div>

      {/* Grid de metas seleccionables */}
      <div className="flex flex-wrap items-stretch gap-4">
        {data.pockets.map((p) => {
          const key = accountColorKey(p);
          const isActive = p.id === (selected?.id ?? '');
          const linkedAcc = p.linkedAccountId ? data.accounts.find((a) => a.id === p.linkedAccountId) : null;
          const totalPct = p.target && p.target > 0 ? Math.min(100, Math.round((p.balance / p.target) * 100)) : 100;
          const mp = pocketMonthProgress(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedId(p.id)}
              className="relative flex w-[260px] shrink-0 flex-col gap-2 rounded-[var(--radius-card)] border-[1.5px] p-4.5 text-left transition-colors"
              style={{ borderColor: isActive ? accountColorVar(key) : 'var(--border)', background: accountColorSoft(key, isActive ? 10 : 0) }}
            >
              {p.isPrimary && <i className="ph ph-star absolute right-3.5 top-3.5 text-[var(--amber)]" aria-hidden="true" title="Meta principal" />}
              <div className="flex items-center justify-between">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] text-white" style={{ background: accountColorVar(key) }}>
                  <i className="ph ph-piggy-bank" aria-hidden="true" />
                </span>
                {isActive && (
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white" style={{ background: accountColorVar(key) }}>
                    <i className="ph ph-check" aria-hidden="true" />
                  </span>
                )}
              </div>
              <p className="truncate text-[13.5px] font-bold text-[var(--text)]">
                {linkedAcc && <i className="ph ph-lock-simple mr-1" aria-hidden="true" title={`Cuenta apartada: ${linkedAcc.name}`} />}
                {p.name}
              </p>
              <p className="num -mt-1 text-xl font-extrabold text-[var(--text)]">{formatMoney(p.balance)}</p>
              <div className="h-[7px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                <div className="h-full rounded-[var(--radius-pill)]" style={{ width: `${totalPct}%`, background: accountColorVar(key) }} />
              </div>
              {p.monthlyTarget ? (
                <div className={`flex items-center gap-1.5 text-[11px] font-bold ${mp.behind ? 'text-[var(--amber)]' : 'text-[var(--green)]'}`}>
                  <i className={`ph ${mp.behind ? 'ph-warning-circle' : 'ph-check'}`} aria-hidden="true" />
                  {formatMoney(mp.saved)} / {formatMoney(p.monthlyTarget)}
                  {mp.behind ? ' — atrasada' : ''}
                </div>
              ) : (
                <p className="text-[11px] font-semibold text-[var(--text-muted)]">Sin meta mensual</p>
              )}
            </button>
          );
        })}
        <button
          type="button"
          onClick={openCreate}
          className="flex min-h-[172px] w-[260px] shrink-0 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border-[1.5px] border-dashed border-[var(--border)] text-[13px] font-semibold text-[var(--text-faint)] hover:border-[var(--text-muted)] hover:text-[var(--text)]"
        >
          <i className="ph ph-plus text-lg" aria-hidden="true" />
          <span>Nueva meta</span>
        </button>
      </div>

      {/* Panel de detalle */}
      {selected && (
        <PocketDetail
          pocket={selected}
          data={data}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSetColor={(color) => setColor.mutate({ id: selected.id, color })}
          onToggleNotify={(v) => setField.mutate({ id: selected.id, notifyBehind: v })}
          onSetPrimary={() => setField.mutate({ id: selected.id, isPrimary: true })}
          onMeter={() => setMoving({ pocket: selected, direction: 'meter' })}
          onSacar={() => setMoving({ pocket: selected, direction: 'sacar' })}
          onDeleteContribution={(cid) => deleteContribution.mutate({ pocketId: selected.id, cid })}
        />
      )}

      <PocketFormModal open={creating || !!editing} onClose={closeModal} title={editing ? 'Editar meta' : 'Nueva meta de ahorro'} form={form} setForm={setForm} onSubmit={handleSubmit} loading={addPocket.isPending || updatePocket.isPending} error={error} data={data} isNew={!editing} />

      <Modal open={!!moving} onClose={() => setMoving(null)} title={moving ? `${moving.direction === 'meter' ? 'Agregar aporte' : 'Sacar'} · ${moving.pocket.name}` : ''}>
        <form onSubmit={handleMove} className="flex flex-col gap-4">
          <Input label="Monto" type="number" step="0.01" required autoFocus value={moveAmount} onChange={(e) => setMoveAmount(e.target.value)} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={movePocket.isPending} className="w-full">
            Confirmar
          </GradientButton>
        </form>
      </Modal>
    </div>
  );
}

function PocketDetail({
  pocket,
  data,
  onEdit,
  onDelete,
  onSetColor,
  onToggleNotify,
  onSetPrimary,
  onMeter,
  onSacar,
  onDeleteContribution,
}: {
  pocket: Pocket;
  data: AppState;
  onEdit: (p: Pocket) => void;
  onDelete: (p: Pocket) => void;
  onSetColor: (color: AccountColorKey) => void;
  onToggleNotify: (v: boolean) => void;
  onSetPrimary: () => void;
  onMeter: () => void;
  onSacar: () => void;
  onDeleteContribution: (cid: string) => void;
}) {
  const mp = pocketMonthProgress(pocket);
  const linkedAcc = pocket.linkedAccountId ? data.accounts.find((a) => a.id === pocket.linkedAccountId) : null;
  const key = accountColorKey(pocket);

  const contribs = [...(pocket.contributions || [])].sort((a, b) => b.date.localeCompare(a.date));
  const groups: { key: string; items: typeof contribs }[] = [];
  contribs.forEach((c) => {
    const k = c.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (!last || last.key !== k) groups.push({ key: k, items: [c] });
    else last.items.push(c);
  });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.3fr_1fr]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
            <i className="ph ph-piggy-bank" aria-hidden="true" /> {pocket.name}
          </h2>
          <div className="flex gap-1.5">
            <IconButton icon="ph-pencil-simple" label="Editar" onClick={() => onEdit(pocket)} />
            <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={() => onDelete(pocket)} />
          </div>
        </div>

        {mp.behind && pocket.monthlyTarget && (
          <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[var(--amber)]/35 bg-[var(--amber)]/[0.12] p-3.5 text-sm text-[var(--text)]">
            <i className="ph ph-warning-circle mt-0.5 shrink-0 text-[var(--amber)]" aria-hidden="true" />
            <span>
              Vas atrasado para llegar a tu meta de este mes — con {mp.daysLeft} día{mp.daysLeft === 1 ? '' : 's'} restantes, necesitas ahorrar{' '}
              <strong className="num">{formatMoney(mp.daysLeft > 0 ? Math.max(0, (pocket.monthlyTarget - mp.saved) / mp.daysLeft) : Math.max(0, pocket.monthlyTarget - mp.saved))}</strong> por día.
            </span>
          </div>
        )}

        {pocket.monthlyTarget && (
          <div className="mb-4">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Este mes</p>
            <div className="mb-1.5 h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
              <div className="h-full" style={{ width: `${Math.min(100, mp.pct || 0)}%`, background: mp.behind ? 'var(--amber)' : 'var(--green)' }} />
            </div>
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span className="num font-semibold text-[var(--text)]">{formatMoney(mp.saved)} ahorrado</span>
              <span>
                Meta: <span className="num font-semibold text-[var(--text)]">{formatMoney(pocket.monthlyTarget)}</span>
              </span>
            </div>
          </div>
        )}

        {pocket.target != null && (
          <div className="mb-4">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Meta total</p>
            <div className="mb-1.5 h-2 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
              <div className="h-full" style={{ width: `${Math.min(100, Math.round((pocket.balance / pocket.target) * 100))}%`, background: accountColorVar(key) }} />
            </div>
            <div className="flex justify-between text-xs text-[var(--text-muted)]">
              <span className="num font-semibold text-[var(--text)]">
                {formatMoney(pocket.balance)} de {formatMoney(pocket.target)}
              </span>
              {pocket.targetDate && <span>Fecha: {formatDate(pocket.targetDate)}</span>}
            </div>
          </div>
        )}

        <dl className="flex flex-col">
          <DetailRow label="Cuenta apartada" value={linkedAcc ? linkedAcc.name : '—'} icon={linkedAcc ? 'ph-lock-simple' : undefined} />
          <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] py-2.5">
            <dt className="text-xs text-[var(--text-muted)]">Avisarme si me atraso</dt>
            <dd>
              <Switch checked={pocket.notifyBehind} onChange={onToggleNotify} label="Avisarme si me atraso" />
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2.5 py-2.5">
            <dt className="text-xs text-[var(--text-muted)]">Meta principal</dt>
            <dd>
              {pocket.isPrimary ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-[var(--amber)]">
                  <i className="ph ph-star" aria-hidden="true" /> Sí, se muestra en el Panel
                </span>
              ) : (
                <button type="button" onClick={onSetPrimary} className="rounded-[var(--radius-pill)] border border-[var(--border)] px-3 py-1 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-raised)]">
                  Marcar como principal
                </button>
              )}
            </dd>
          </div>
        </dl>

        <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Color de la meta</p>
        <div className="mb-4 flex gap-2">
          {ACCOUNT_COLOR_PALETTE.map((k) => {
            const isActive = accountColorKey(pocket) === k;
            return (
              <button key={k} type="button" aria-label={`Color ${k}`} onClick={() => onSetColor(k)} className="flex h-7 w-7 items-center justify-center rounded-full text-white" style={{ background: accountColorVar(k) }}>
                {isActive && <i className="ph ph-check text-xs" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <GradientButton onClick={onMeter}>
            <i className="ph ph-plus" aria-hidden="true" /> Agregar aporte
          </GradientButton>
          <GradientButton variant="ghost" onClick={onSacar}>
            <i className="ph ph-minus" aria-hidden="true" /> Sacar
          </GradientButton>
        </div>
      </Card>

      <Card>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Aportes</p>
        {groups.length === 0 ? (
          <p className="py-2 text-sm text-[var(--text-muted)]">Sin aportes todavía.</p>
        ) : (
          groups.map((g, gi) => {
            const d = new Date(`${g.key}-01T00:00:00`);
            const label = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
            return (
              <div key={g.key} className={gi > 0 ? 'mt-4' : ''}>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-muted)]">{label.charAt(0).toUpperCase() + label.slice(1)}</p>
                <div className="flex flex-col gap-1.5">
                  {g.items.map((c) => (
                    <div key={c.id} className="flex items-center justify-between rounded-[var(--radius-control)] bg-[var(--surface-raised)] px-3 py-2 text-[12.5px] font-bold text-[var(--text)]">
                      <span className="num">
                        {c.amount >= 0 ? '+' : ''}
                        {formatMoney(c.amount)}
                      </span>
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">
                        {formatDate(c.date)}
                        {c.note ? ` · ${c.note}` : ''}
                      </span>
                      <button type="button" aria-label="Eliminar aporte" onClick={() => onDeleteContribution(c.id)} className="text-[var(--text-faint)] hover:text-[var(--red)]">
                        <i className="ph ph-x text-xs" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </Card>
    </div>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: string }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-[var(--border)] py-2.5">
      <dt className="text-xs text-[var(--text-muted)]">{label}</dt>
      <dd className="flex items-center gap-1.5 text-sm font-bold text-[var(--text)]">
        {icon && <i className={`ph ${icon}`} aria-hidden="true" />}
        {value}
      </dd>
    </div>
  );
}

function StatTile({ icon, label, value, colorVar }: { icon: string; label: string; value: string; colorVar?: string }) {
  return (
    <div className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4">
      <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-lg" style={colorVar ? { color: `var(${colorVar})` } : undefined}>
        <i className={`ph ${icon}`} aria-hidden="true" />
      </span>
      <div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">{label}</p>
        <p className="num text-lg font-extrabold" style={colorVar ? { color: `var(${colorVar})` } : { color: 'var(--text)' }}>
          {value}
        </p>
      </div>
    </div>
  );
}

function PocketFormModal({
  open,
  onClose,
  title,
  form,
  setForm,
  onSubmit,
  loading,
  error,
  data,
  isNew,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
  data: AppState;
  isNew: boolean;
}) {
  const availableAccounts = data.accounts.filter((a) => a.type !== 'tarjeta');
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {isNew && (
          <Input label="Saldo inicial" type="number" min={0} step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
        )}
        <Input
          label="Meta mensual (opcional)"
          type="number"
          min={0}
          step="0.01"
          value={form.monthlyTarget}
          onChange={(e) => setForm({ ...form, monthlyTarget: e.target.value })}
        />
        <Input label="Meta total (opcional)" type="number" min={0} step="0.01" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
        <Input label="Fecha objetivo (opcional)" type="date" value={form.targetDate} onChange={(e) => setForm({ ...form, targetDate: e.target.value })} />
        <Input
          label="Crecimiento automático % mensual (opcional)"
          type="number"
          min={0}
          step="0.01"
          value={form.rate}
          onChange={(e) => setForm({ ...form, rate: e.target.value })}
        />
        <Select label="Apartar una cuenta real (opcional)" value={form.linkedAccountId} onChange={(e) => setForm({ ...form, linkedAccountId: e.target.value })}>
          <option value="">Ninguna (no apartar cuenta)</option>
          {availableAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-[var(--text)]">
          <input type="checkbox" checked={form.notifyBehind} onChange={(e) => setForm({ ...form, notifyBehind: e.target.checked })} />
          Avisarme por Telegram si voy atrasado este mes
        </label>
        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}
        <GradientButton type="submit" loading={loading} className="w-full">
          {isNew ? 'Crear meta' : 'Guardar cambios'}
        </GradientButton>
      </form>
    </Modal>
  );
}

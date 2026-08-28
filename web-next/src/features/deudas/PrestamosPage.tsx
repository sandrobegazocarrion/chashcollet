import { useMemo, useState, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatDate, formatMoney } from '../../lib/finance';
import { monthlyRateToTEA, simulateExtraPayment, solveMonthlyRate } from '../../lib/loanMath';
import { LENDER_LABELS, RELATION_LABELS, RELATION_COLOR_VARS, personLoanCollectionStatus } from '../../lib/deudaTypes';
import type { AppState, Deuda, PersonLoan, PersonLoanReminderFrequency, PersonLoanRelation, PersonLoanReturnMode } from '../../lib/types';
import { DeudaFormModal, deudaToForm, emptyDeudaForm, todayStr, type DeudaFormState } from './shared';
import { EmptyState } from '../../components/ui/EmptyState';

type Tab = 'personales' | 'doy';

// Rediseño de "Préstamos" en dos sub-secciones separadas: A) lo que YO debo (a un
// banco/financiera/app/persona — todo vive en `deudas` con type==='prestamo', ya que
// lenderType ya soportaba 'persona') y B) lo que otros me deben (`personLoans` con
// direction==='me_deben' — la dirección 'debo' de personLoans queda en desuso a
// partir de este rediseño, absorbida por A).
export function PrestamosPage({ data }: { data: AppState }) {
  const [tab, setTab] = useState<Tab>('personales');

  const prestamos = data.deudas.filter((d) => d.type === 'prestamo');
  const debtoTotal = useMemo(() => prestamos.reduce((s, d) => s + (d.remainingBalance ?? d.principal ?? 0), 0), [prestamos]);

  const cuotaMensualTotal = useMemo(() => {
    const prestamoCuotas = prestamos
      .filter((d) => d.totalInstallments && (d.paidInstallments || 0) < d.totalInstallments!)
      .reduce((s, d) => s + (d.amount || 0), 0);
    const tarjetaCuotas = (data.cardCharges || [])
      .filter((c) => c.paidInstallments < c.totalInstallments)
      .reduce((s, c) => s + (c.installmentAmount || 0), 0);
    return prestamoCuotas + tarjetaCuotas;
  }, [prestamos, data.cardCharges]);

  const loansGiven = data.personLoans.filter((p) => p.direction === 'me_deben');
  const { meDebenTotal, meDebenAlDia, meDebenAtrasado } = useMemo(() => {
    const payments = data.personLoanPayments || [];
    const pendingOf = (loan: PersonLoan) => {
      const paid = payments.filter((p) => p.personLoanId === loan.id).reduce((s, p) => s + p.amount, 0);
      return Math.max(0, Math.round((loan.amount - paid) * 100) / 100);
    };
    let total = 0;
    let alDia = 0;
    let atrasado = 0;
    loansGiven
      .filter((l) => !l.paid)
      .forEach((l) => {
        const pending = pendingOf(l);
        total += pending;
        const status = personLoanCollectionStatus(l, payments);
        if (status.tone === 'red') atrasado += pending;
        else alDia += pending;
      });
    return { meDebenTotal: total, meDebenAlDia: alDia, meDebenAtrasado: atrasado };
  }, [loansGiven, data.personLoanPayments]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-[var(--text)]">Préstamos</h1>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Debo en total</p>
          <p className="num text-2xl font-extrabold" style={{ color: debtoTotal > 0 ? 'var(--red)' : 'var(--text)' }}>
            {formatMoney(debtoTotal)}
          </p>
          <p className="text-[11.5px] text-[var(--text-muted)]">en {prestamos.length} préstamo{prestamos.length === 1 ? '' : 's'}</p>
        </Card>
        <Card className="flex flex-col gap-1 !border-[var(--brand)]/30" style={{ background: 'color-mix(in srgb, var(--brand) 8%, var(--surface))' }}>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Cuota mensual total</p>
          <p className="num text-2xl font-extrabold text-[var(--brand)]">{formatMoney(cuotaMensualTotal)}</p>
          <p className="text-[11.5px] text-[var(--text-muted)]">prestamos + compras en cuotas de tarjeta</p>
        </Card>
        <Card className="flex flex-col gap-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Me deben en total</p>
          <p className="num text-2xl font-extrabold text-[var(--green)]">{formatMoney(meDebenTotal)}</p>
          <p className="text-[11.5px] text-[var(--text-muted)]">
            {formatMoney(meDebenAlDia)} al día · {formatMoney(meDebenAtrasado)} atrasado
          </p>
        </Card>
      </div>

      <div className="inline-flex w-fit rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] p-1">
        <button
          type="button"
          onClick={() => setTab('personales')}
          className={`rounded-[var(--radius-pill)] px-4 py-2 text-[13px] font-bold transition-colors ${
            tab === 'personales' ? 'bg-[var(--brand)] text-white shadow-[0_6px_16px_-8px_var(--brand-glow)]' : 'text-[var(--text-muted)]'
          }`}
        >
          <i className="ph ph-bank" aria-hidden="true" /> Préstamos personales
        </button>
        <button
          type="button"
          onClick={() => setTab('doy')}
          className={`rounded-[var(--radius-pill)] px-4 py-2 text-[13px] font-bold transition-colors ${
            tab === 'doy' ? 'bg-[var(--green)] text-white shadow-[0_6px_16px_-8px_color-mix(in_srgb,var(--green)_45%,transparent)]' : 'text-[var(--text-muted)]'
          }`}
        >
          <i className="ph ph-hand-coins" aria-hidden="true" /> Préstamos que doy
        </button>
      </div>

      {tab === 'personales' ? <PrestamosPersonalesTab data={data} /> : <PrestamosQueDoyTab data={data} />}
    </div>
  );
}

/* ============================================================
   A) Préstamos personales — lo que YO debo (banco/financiera/app/persona)
   ============================================================ */
function PrestamosPersonalesTab({ data }: { data: AppState }) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; deuda?: Deuda } | null>(null);
  const [form, setForm] = useState<DeudaFormState>(emptyDeudaForm('prestamo'));
  const [paying, setPaying] = useState<Deuda | null>(null);
  const [payForm, setPayForm] = useState({ accountId: '', amount: '' });
  const [simulating, setSimulating] = useState<Deuda | null>(null);
  const [error, setError] = useState<string | null>(null);

  const addDeuda = useApiMutation<unknown, Deuda>('POST', '/api/deudas');
  const updateDeuda = useApiMutation<{ id: string } & Record<string, unknown>, Deuda>('PUT', (b) => `/api/deudas/${b.id}`);
  const payDeuda = useApiMutation<{ id: string; accountId?: string; amount?: number }, unknown>('POST', (b) => `/api/deudas/${b.id}/pay`);
  const deleteDeuda = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/deudas/${b.id}`);

  const prestamos = data.deudas.filter((d) => d.type === 'prestamo');

  function openCreate() {
    setForm(emptyDeudaForm('prestamo'));
    setError(null);
    setModal({ mode: 'create' });
  }
  function openEdit(d: Deuda) {
    setForm(deudaToForm(d));
    setError(null);
    setModal({ mode: 'edit', deuda: d });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const principal = form.principal ? Number(form.principal) : undefined;
    const amount = form.amount ? Number(form.amount) : undefined;
    const totalInstallments = form.totalInstallments ? Number(form.totalInstallments) : undefined;
    // Si el usuario no ingresó la tasa, se calcula acá y se guarda ya resuelta —
    // así el resto de la app (tarjetas, simulador) siempre lee un interestRate real.
    let interestRate = form.interestRate ? Number(form.interestRate) : undefined;
    if (interestRate === undefined && principal && amount && totalInstallments) {
      const rate = solveMonthlyRate(principal, amount, totalInstallments);
      if (rate != null) interestRate = Math.round(rate * 100 * 100) / 100;
    }
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      type: 'prestamo',
      amount,
      dueDay: Number(form.dueDay),
      lenderType: form.lenderType,
      lenderName: form.lenderName.trim() || undefined,
      interestRate,
      principal,
      totalInstallments,
      startDate: form.startDate || undefined,
    };
    try {
      if (modal?.mode === 'edit' && modal.deuda) await updateDeuda.mutateAsync({ id: modal.deuda.id, ...body });
      else await addDeuda.mutateAsync(body);
      setModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  function openPay(d: Deuda) {
    setPayForm({ accountId: data.accounts.find((a) => a.type !== 'tarjeta')?.id || '', amount: d.amount != null ? String(d.amount) : '' });
    setError(null);
    setPaying(d);
  }
  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    setError(null);
    try {
      await payDeuda.mutateAsync({ id: paying.id, accountId: payForm.accountId || undefined, amount: payForm.amount ? Number(payForm.amount) : undefined });
      setPaying(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">Dinero que le debes a un banco, financiera, app o persona.</p>
        <GradientButton onClick={openCreate}>
          <i className="ph ph-plus" aria-hidden="true" /> Agregar
        </GradientButton>
      </div>

      {prestamos.length === 0 ? (
        <EmptyState mascot="descanso" icon="ph-bank" title="No tienes préstamos registrados" subtitle="Registra lo que le debes a un banco, financiera, app o persona." />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {prestamos.map((d) => (
            <PrestamoPersonalCard key={d.id} deuda={d} accounts={data.accounts} onPay={() => openPay(d)} onSimulate={() => setSimulating(d)} onEdit={() => openEdit(d)} onDelete={() => deleteDeuda.mutate({ id: d.id })} />
          ))}
        </div>
      )}

      <DeudaFormModal open={!!modal} onClose={() => setModal(null)} isEdit={modal?.mode === 'edit'} forcedType="prestamo" form={form} setForm={setForm} onSubmit={handleSubmit} loading={addDeuda.isPending || updateDeuda.isPending} error={error} />

      <Modal open={!!paying} onClose={() => setPaying(null)} title={paying ? `Pagar cuota de ${paying.name}` : ''}>
        <form onSubmit={handlePay} className="flex flex-col gap-4">
          <Select label="Cuenta de origen" value={payForm.accountId} onChange={(e) => setPayForm({ ...payForm, accountId: e.target.value })}>
            <option value="">No mover dinero (solo marcar pagado)</option>
            {data.accounts
              .filter((a) => a.type !== 'tarjeta')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
          </Select>
          <Input label="Monto" type="number" step="0.01" value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={payDeuda.isPending} className="w-full">
            Confirmar pago
          </GradientButton>
        </form>
      </Modal>

      <SimulatorModal deuda={simulating} onClose={() => setSimulating(null)} />
    </section>
  );
}

function PrestamoPersonalCard({
  deuda,
  accounts,
  onPay,
  onSimulate,
  onEdit,
  onDelete,
}: {
  deuda: Deuda;
  accounts: AppState['accounts'];
  onPay: () => void;
  onSimulate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pending = deuda.remainingBalance ?? deuda.principal ?? 0;
  const cuotasRestantes = deuda.totalInstallments != null ? Math.max(0, deuda.totalInstallments - (deuda.paidInstallments || 0)) : null;
  const pct = deuda.totalInstallments ? Math.min(100, Math.round(((deuda.paidInstallments || 0) / deuda.totalInstallments) * 100)) : 0;
  const tea = deuda.interestRate != null ? monthlyRateToTEA(deuda.interestRate / 100) * 100 : null;
  const acc = deuda.accountId ? accounts.find((a) => a.id === deuda.accountId) : null;

  return (
    <Card className="flex flex-col gap-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
              {LENDER_LABELS[deuda.lenderType || 'banco']}
            </span>
            <p className="truncate text-[15px] font-extrabold text-[var(--text)]">{deuda.lenderName || deuda.name}</p>
          </div>
          <p className="mt-0.5 truncate text-[12px] text-[var(--text-faint)]">
            {deuda.name}
            {acc ? ` · ${acc.name}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <IconButton icon="ph-pencil-simple" label="Editar" onClick={onEdit} />
          <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={onDelete} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Monto pendiente</p>
          <p className="num text-lg font-extrabold text-[var(--text)]">{formatMoney(pending)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Cuotas restantes</p>
          <p className="num text-lg font-extrabold text-[var(--text)]">{cuotasRestantes ?? '—'}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Tasa estimada</p>
          <p className="num text-lg font-extrabold text-[var(--text)]">{deuda.interestRate != null ? `${deuda.interestRate}%` : '—'}</p>
          {tea != null && <p className="num text-[11px] text-[var(--text-muted)]">~{tea.toFixed(1)}% TEA</p>}
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Cuota</p>
          <p className="num text-lg font-extrabold text-[var(--text)]">{deuda.amount != null ? formatMoney(deuda.amount) : '—'}</p>
        </div>
      </div>

      {deuda.totalInstallments != null && (
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-semibold text-[var(--text-muted)]">
            <span>Cuotas pagadas</span>
            <span className="num">
              {deuda.paidInstallments || 0} / {deuda.totalInstallments}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
            <div className="h-full bg-[var(--brand)]" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <GradientButton onClick={onPay} className="!px-3 !py-1.5 !text-xs">
          Pagar cuota
        </GradientButton>
        <GradientButton variant="ghost" onClick={onSimulate} className="!px-3 !py-1.5 !text-xs">
          <i className="ph ph-calculator" aria-hidden="true" /> Simular adelanto
        </GradientButton>
      </div>
    </Card>
  );
}

function SimulatorModal({ deuda, onClose }: { deuda: Deuda | null; onClose: () => void }) {
  const [extra, setExtra] = useState('');

  const monthlyRate = useMemo(() => {
    if (!deuda) return null;
    if (deuda.interestRate != null) return deuda.interestRate / 100;
    if (deuda.principal && deuda.amount && deuda.totalInstallments) return solveMonthlyRate(deuda.principal, deuda.amount, deuda.totalInstallments);
    return null;
  }, [deuda]);

  const result = useMemo(() => {
    if (!deuda || monthlyRate == null || !deuda.amount) return null;
    const pending = deuda.remainingBalance ?? deuda.principal ?? 0;
    const extraNum = Number(extra);
    if (!extraNum || extraNum <= 0 || extraNum >= pending) return null;
    return simulateExtraPayment(pending, monthlyRate, deuda.amount, extraNum);
  }, [deuda, monthlyRate, extra]);

  return (
    <Modal open={!!deuda} onClose={onClose} title={deuda ? `Simular adelanto — ${deuda.name}` : ''}>
      <div className="flex flex-col gap-4">
        <p className="text-[13px] text-[var(--text-muted)]">¿Cuánto pagarías de más este mes, además de la cuota?</p>
        <Input label="Monto adelantado" type="number" step="0.01" value={extra} onChange={(e) => setExtra(e.target.value)} />
        {monthlyRate == null && <p className="text-sm text-[var(--red)]">No hay suficientes datos (monto, cuota y n.º de cuotas) para calcular la tasa y simular.</p>}
        {result && result.possible ? (
          <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-4 py-3.5">
            <p className="text-sm font-bold text-[var(--text)]">
              Terminarías <span className="num text-[var(--green)]">{result.monthsSaved}</span> cuota{result.monthsSaved === 1 ? '' : 's'} antes
            </p>
            <p className="num mt-1 text-sm font-bold text-[var(--green)]">Ahorrarías {formatMoney(result.interestSaved)} en intereses</p>
          </div>
        ) : (
          extra && !result && monthlyRate != null && <p className="text-sm text-[var(--text-muted)]">Ingresa un monto menor al saldo pendiente.</p>
        )}
      </div>
    </Modal>
  );
}

/* ============================================================
   B) Préstamos que doy — lo que otros me deben
   ============================================================ */
function PrestamosQueDoyTab({ data }: { data: AppState }) {
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(emptyLoanForm());
  const [editing, setEditing] = useState<PersonLoan | null>(null);
  const [editForm, setEditForm] = useState(emptyLoanForm());
  const [paying, setPaying] = useState<PersonLoan | null>(null);
  const [payForm, setPayForm] = useState({ accountId: '', amount: '', date: todayStr() });
  const [settling, setSettling] = useState<PersonLoan | null>(null);
  const [settleAccountId, setSettleAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const addLoan = useApiMutation<unknown, PersonLoan>('POST', '/api/personloans');
  const updateLoan = useApiMutation<{ id: string } & Record<string, unknown>, PersonLoan>('PUT', (b) => `/api/personloans/${b.id}`);
  const deleteLoan = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/personloans/${b.id}`);
  const payLoan = useApiMutation<{ id: string; accountId?: string; amount: number; date?: string }, unknown>('POST', (b) => `/api/personloans/${b.id}/pay`);
  const settleLoan = useApiMutation<{ id: string; accountId?: string }, PersonLoan>('POST', (b) => `/api/personloans/${b.id}/settle`);
  const remindLoan = useApiMutation<{ id: string }, { ok: boolean }>('POST', (b) => `/api/personloans/${b.id}/remind`);
  const [remindFeedback, setRemindFeedback] = useState<{ id: string; ok: boolean; msg: string } | null>(null);

  async function handleRemind(loan: PersonLoan) {
    try {
      await remindLoan.mutateAsync({ id: loan.id });
      setRemindFeedback({ id: loan.id, ok: true, msg: 'Enviado a tu Telegram ✓' });
    } catch (err) {
      setRemindFeedback({ id: loan.id, ok: false, msg: err instanceof Error ? err.message : 'No se pudo enviar.' });
    }
    setTimeout(() => setRemindFeedback((f) => (f?.id === loan.id ? null : f)), 4000);
  }

  const personLoanPayments = data.personLoanPayments || [];
  const loans = data.personLoans.filter((p) => p.direction === 'me_deben');
  const pendingOf = (loan: PersonLoan) => {
    const paid = personLoanPayments.filter((p) => p.personLoanId === loan.id).reduce((s, p) => s + p.amount, 0);
    return Math.max(0, Math.round((loan.amount - paid) * 100) / 100);
  };
  function openCreate() {
    setForm(emptyLoanForm());
    setError(null);
    setCreating(true);
  }
  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addLoan.mutateAsync({
        direction: 'me_deben',
        personName: form.personName.trim(),
        amount: Number(form.amount),
        date: form.date || undefined,
        note: form.note.trim() || undefined,
        returnMode: form.returnMode,
        installmentAmount: form.returnMode === 'cuotas' ? Number(form.installmentAmount) : undefined,
        totalInstallments: form.returnMode === 'cuotas' ? Number(form.totalInstallments) : undefined,
        reminderFrequency: form.reminderFrequency || undefined,
        dueDate: form.reminderFrequency ? form.reminderDate || undefined : undefined,
        relationType: form.relationType || undefined,
      });
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el préstamo.');
    }
  }

  function openEdit(loan: PersonLoan) {
    setEditForm({
      personName: loan.personName,
      amount: String(loan.amount),
      date: loan.date || todayStr(),
      note: loan.note || '',
      returnMode: loan.returnMode,
      installmentAmount: loan.installmentAmount != null ? String(loan.installmentAmount) : '',
      totalInstallments: loan.totalInstallments != null ? String(loan.totalInstallments) : '',
      reminderFrequency: loan.reminderFrequency,
      reminderDate: loan.dueDate || todayStr(),
      relationType: loan.relationType || null,
    });
    setError(null);
    setEditing(loan);
  }
  async function handleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setError(null);
    try {
      await updateLoan.mutateAsync({
        id: editing.id,
        personName: editForm.personName.trim(),
        note: editForm.note.trim() || undefined,
        returnMode: editForm.returnMode,
        installmentAmount: editForm.returnMode === 'cuotas' ? Number(editForm.installmentAmount) : undefined,
        totalInstallments: editForm.returnMode === 'cuotas' ? Number(editForm.totalInstallments) : undefined,
        reminderFrequency: editForm.reminderFrequency || null,
        dueDate: editForm.reminderFrequency ? editForm.reminderDate || undefined : null,
        relationType: editForm.relationType || null,
      });
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  function openPay(loan: PersonLoan) {
    setPayForm({ accountId: data.accounts.find((a) => a.type !== 'tarjeta')?.id || '', amount: String(pendingOf(loan)), date: todayStr() });
    setError(null);
    setPaying(loan);
  }
  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!paying) return;
    setError(null);
    try {
      await payLoan.mutateAsync({ id: paying.id, accountId: payForm.accountId || undefined, amount: Number(payForm.amount), date: payForm.date || undefined });
      setPaying(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el abono.');
    }
  }

  async function handleSettle(e: FormEvent) {
    e.preventDefault();
    if (!settling) return;
    setError(null);
    try {
      await settleLoan.mutateAsync({ id: settling.id, accountId: settleAccountId || undefined });
      setSettling(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo saldar.');
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] text-[var(--text-muted)]">Dinero que le prestaste a otra persona.</p>
          <p className="text-[11.5px] text-[var(--text-faint)]">Los recordatorios de Telegram llegan a tu chat, no al de la persona que te debe.</p>
        </div>
        <GradientButton onClick={openCreate}>
          <i className="ph ph-plus" aria-hidden="true" /> Prestar
        </GradientButton>
      </div>

      {loans.length === 0 ? (
        <EmptyState mascot="descanso" icon="ph-hand-coins" title="No le prestaste dinero a nadie (todavía)" subtitle="Registra a quién le prestaste para no olvidarte de cobrar." />
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {loans.map((loan) => (
            <PersonLoanCard
              key={loan.id}
              loan={loan}
              pending={pendingOf(loan)}
              payments={personLoanPayments}
              onPay={() => openPay(loan)}
              onSettle={() => {
                setSettleAccountId(data.accounts.find((a) => a.type !== 'tarjeta')?.id || '');
                setError(null);
                setSettling(loan);
              }}
              onEdit={() => openEdit(loan)}
              onDelete={() => deleteLoan.mutate({ id: loan.id })}
              onRemind={() => handleRemind(loan)}
              reminding={remindLoan.isPending}
              remindFeedback={remindFeedback?.id === loan.id ? remindFeedback : null}
            />
          ))}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo préstamo que das">
        <PersonLoanForm form={form} setForm={setForm} onSubmit={handleCreate} loading={addLoan.isPending} error={error} />
      </Modal>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing ? `Editar préstamo · ${editing.personName}` : ''}>
        <PersonLoanForm form={editForm} setForm={setEditForm} onSubmit={handleEdit} loading={updateLoan.isPending} error={error} isEdit />
      </Modal>

      <Modal open={!!paying} onClose={() => setPaying(null)} title={paying ? `Abono de ${paying.personName}` : ''}>
        <form onSubmit={handlePay} className="flex flex-col gap-4">
          <Select label="Cuenta destino" value={payForm.accountId} onChange={(e) => setPayForm({ ...payForm, accountId: e.target.value })}>
            <option value="">No mover dinero (solo registrar)</option>
            {data.accounts
              .filter((a) => a.type !== 'tarjeta')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
          </Select>
          <Input label="Monto abonado" type="number" step="0.01" required value={payForm.amount} onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })} />
          <Input label="Fecha" type="date" value={payForm.date} onChange={(e) => setPayForm({ ...payForm, date: e.target.value })} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={payLoan.isPending} className="w-full">
            Registrar abono
          </GradientButton>
        </form>
      </Modal>

      <Modal open={!!settling} onClose={() => setSettling(null)} title={settling ? `Saldar el resto con ${settling.personName}` : ''}>
        <form onSubmit={handleSettle} className="flex flex-col gap-4">
          <Select label="Cuenta afectada" value={settleAccountId} onChange={(e) => setSettleAccountId(e.target.value)}>
            <option value="">No mover dinero (solo marcar saldado)</option>
            {data.accounts
              .filter((a) => a.type !== 'tarjeta')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
          </Select>
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={settleLoan.isPending} className="w-full">
            Confirmar
          </GradientButton>
        </form>
      </Modal>
    </section>
  );
}

interface LoanFormState {
  personName: string;
  amount: string;
  date: string;
  note: string;
  returnMode: PersonLoanReturnMode;
  installmentAmount: string;
  totalInstallments: string;
  reminderFrequency: PersonLoanReminderFrequency | null;
  reminderDate: string;
  relationType: PersonLoanRelation | null;
}
function emptyLoanForm(): LoanFormState {
  return {
    personName: '', amount: '', date: todayStr(), note: '', returnMode: 'unico', installmentAmount: '', totalInstallments: '',
    reminderFrequency: null, reminderDate: todayStr(), relationType: null,
  };
}

function PersonLoanForm({
  form,
  setForm,
  onSubmit,
  loading,
  error,
  isEdit,
}: {
  form: LoanFormState;
  setForm: (f: LoanFormState) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
  isEdit?: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <Input label="A quién le prestaste" required value={form.personName} onChange={(e) => setForm({ ...form, personName: e.target.value })} />
      {!isEdit && <Input label="Monto prestado" type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />}
      {!isEdit && <Input label="Fecha" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />}

      <Select label="Relación (opcional)" value={form.relationType || ''} onChange={(e) => setForm({ ...form, relationType: (e.target.value || null) as PersonLoanRelation | null })}>
        <option value="">Sin especificar</option>
        {(Object.keys(RELATION_LABELS) as PersonLoanRelation[]).map((k) => (
          <option key={k} value={k}>
            {RELATION_LABELS[k]}
          </option>
        ))}
      </Select>

      <Select label="Forma de devolución" value={form.returnMode} onChange={(e) => setForm({ ...form, returnMode: e.target.value as PersonLoanReturnMode })}>
        <option value="unico">Monto único, sin fecha fija</option>
        <option value="cuotas">En cuotas</option>
      </Select>
      {form.returnMode === 'cuotas' && (
        <div className="grid grid-cols-2 gap-3">
          <Input label="Valor de la cuota" type="number" step="0.01" value={form.installmentAmount} onChange={(e) => setForm({ ...form, installmentAmount: e.target.value })} />
          <Input label="N.º de cuotas" type="number" min={1} value={form.totalInstallments} onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })} />
        </div>
      )}

      <Input label="Nota (opcional)" placeholder="Ej. para su carro, emergencia" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

      <Select
        label="Recordatorio de cobro"
        value={form.reminderFrequency || ''}
        onChange={(e) => setForm({ ...form, reminderFrequency: (e.target.value || null) as PersonLoanReminderFrequency | null })}
      >
        <option value="">Sin recordatorio</option>
        <option value="monthly">Recordarme cada mes</option>
        <option value="once">Una fecha específica</option>
      </Select>
      {form.reminderFrequency && <Input label={form.reminderFrequency === 'monthly' ? 'Día del recordatorio mensual' : 'Fecha del recordatorio'} type="date" value={form.reminderDate} onChange={(e) => setForm({ ...form, reminderDate: e.target.value })} />}

      {error && (
        <p className="text-sm text-[var(--red)]" role="alert">
          {error}
        </p>
      )}
      <GradientButton type="submit" loading={loading} className="w-full">
        {isEdit ? 'Guardar cambios' : 'Registrar'}
      </GradientButton>
    </form>
  );
}

function PersonLoanCard({
  loan,
  pending,
  payments,
  onPay,
  onSettle,
  onEdit,
  onDelete,
  onRemind,
  reminding,
  remindFeedback,
}: {
  loan: PersonLoan;
  pending: number;
  payments: AppState['personLoanPayments'];
  onPay: () => void;
  onSettle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRemind: () => void;
  reminding: boolean;
  remindFeedback: { ok: boolean; msg: string } | null;
}) {
  const status = personLoanCollectionStatus(loan, payments);
  const myPayments = payments.filter((p) => p.personLoanId === loan.id).sort((a, b) => b.date.localeCompare(a.date));
  const lastPayment = myPayments[0] || null;
  const toneVar = status.tone === 'green' ? '--green' : status.tone === 'amber' ? '--amber' : status.tone === 'red' ? '--red' : '--text-faint';
  const cuotaPct = loan.totalInstallments ? Math.min(100, Math.round((myPayments.length / loan.totalInstallments) * 100)) : null;
  const modo = loan.returnMode === 'cuotas' ? 'en cuotas' : loan.reminderFrequency === 'monthly' ? 'recordatorio mensual' : loan.dueDate ? 'pago único' : 'sin fecha fija';

  return (
    <Card className="flex flex-col gap-3.5 border-l-2" style={{ borderLeftColor: `var(${toneVar})` }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {loan.relationType && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ color: `var(${RELATION_COLOR_VARS[loan.relationType]})`, background: `color-mix(in srgb, var(${RELATION_COLOR_VARS[loan.relationType]}) 14%, transparent)` }}
              >
                {RELATION_LABELS[loan.relationType]}
              </span>
            )}
            <p className="truncate text-[15px] font-extrabold text-[var(--text)]">{loan.personName}</p>
          </div>
          <p className="truncate text-[12px] text-[var(--text-faint)]">
            Prestado el {formatDate(loan.date)} · {modo}
            {loan.note ? ` · ${loan.note}` : ''}
          </p>
        </div>
        <span
          className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[10.5px] font-bold"
          style={{ color: `var(${toneVar})`, background: `color-mix(in srgb, var(${toneVar}) 14%, transparent)` }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${toneVar})` }} />
          {status.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Monto pendiente</p>
          <p className="num text-lg font-extrabold text-[var(--green)]">{formatMoney(pending)}</p>
        </div>
        <div>
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Último abono</p>
          <p className="num text-sm font-bold text-[var(--text)]">{lastPayment ? `${formatMoney(lastPayment.amount)} · ${formatDate(lastPayment.date)}` : 'Sin abonos aún'}</p>
        </div>
        {loan.returnMode === 'cuotas' && loan.totalInstallments && (
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Cuota</p>
            <p className="num text-sm font-bold text-[var(--text)]">
              {formatMoney(loan.installmentAmount || 0)} · {myPayments.length}/{loan.totalInstallments}
            </p>
          </div>
        )}
      </div>

      {cuotaPct !== null && (
        <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
          <div className="h-full bg-[var(--green)]" style={{ width: `${cuotaPct}%` }} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!loan.paid && (
          <>
            <GradientButton onClick={onPay} className="!bg-[var(--green)] !px-3 !py-1.5 !text-xs !shadow-none">
              Cobrar abono
            </GradientButton>
            <GradientButton variant="ghost" onClick={onSettle} className="!px-3 !py-1.5 !text-xs">
              Saldar todo
            </GradientButton>
            <GradientButton variant="ghost" onClick={onRemind} loading={reminding} className="!px-3 !py-1.5 !text-xs">
              <i className="ph ph-telegram-logo" aria-hidden="true" /> Recordarme por Telegram
            </GradientButton>
          </>
        )}
        <IconButton icon="ph-pencil-simple" label="Editar" onClick={onEdit} />
        <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={onDelete} />
      </div>
      {remindFeedback && (
        <p className={`text-[11.5px] font-semibold ${remindFeedback.ok ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>{remindFeedback.msg}</p>
      )}
    </Card>
  );
}

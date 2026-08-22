import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import type { AppState, Deuda, PersonLoan } from '../../lib/types';
import { DeudaFormModal, DeudaItem, DeudaSummary, EmptyState, PersonLoansList, deudaToForm, emptyDeudaForm, todayStr, type DeudaFormState } from './shared';

// Espeja #tab-prestamos de public/index.html: dos subsecciones — "De banco,
// financiera o app" (store.deudas con type==='prestamo') y "Entre personas"
// (store.personLoans) — cada una con su propio formulario de alta.
export function PrestamosPage({ data }: { data: AppState }) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; deuda?: Deuda } | null>(null);
  const [form, setForm] = useState<DeudaFormState>(emptyDeudaForm('prestamo'));
  const [paying, setPaying] = useState<Deuda | null>(null);
  const [payForm, setPayForm] = useState({ accountId: '', amount: '' });
  const [error, setError] = useState<string | null>(null);

  const [creatingLoan, setCreatingLoan] = useState(false);
  const [loanForm, setLoanForm] = useState({ direction: 'debo' as 'debo' | 'me_deben', personName: '', amount: '', dueDate: '' });
  const [settling, setSettling] = useState<PersonLoan | null>(null);
  const [settleAccountId, setSettleAccountId] = useState('');

  const addDeuda = useApiMutation<unknown, Deuda>('POST', '/api/deudas');
  const updateDeuda = useApiMutation<{ id: string } & Record<string, unknown>, Deuda>('PUT', (b) => `/api/deudas/${b.id}`);
  const payDeuda = useApiMutation<{ id: string; accountId?: string; amount?: number }, unknown>('POST', (b) => `/api/deudas/${b.id}/pay`);
  const unpayDeuda = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/deuda-payments/${b.id}`);

  const addLoan = useApiMutation<unknown, PersonLoan>('POST', '/api/personloans');
  const deleteLoan = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/personloans/${b.id}`);
  const settleLoan = useApiMutation<{ id: string; accountId?: string }, PersonLoan>('POST', (b) => `/api/personloans/${b.id}/settle`);

  const thisMonth = todayStr().slice(0, 7);
  const paidThisMonth = data.deudaPayments.filter((p) => p.month === thisMonth);
  const paidDeudaIds = new Set(paidThisMonth.map((p) => p.deudaId));

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
  function closeModal() {
    setModal(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = {
      name: form.name.trim(),
      type: 'prestamo',
      amount: form.amount ? Number(form.amount) : undefined,
      dueDay: Number(form.dueDay),
      lenderType: form.lenderType,
      lenderName: form.lenderName.trim() || undefined,
      interestRate: form.interestRate ? Number(form.interestRate) : undefined,
      principal: form.principal ? Number(form.principal) : undefined,
      totalInstallments: form.totalInstallments ? Number(form.totalInstallments) : undefined,
    };
    try {
      if (modal?.mode === 'edit' && modal.deuda) await updateDeuda.mutateAsync({ id: modal.deuda.id, ...body });
      else await addDeuda.mutateAsync(body);
      closeModal();
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

  async function handleAddLoan(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await addLoan.mutateAsync({ direction: loanForm.direction, personName: loanForm.personName.trim(), amount: Number(loanForm.amount), dueDate: loanForm.dueDate || undefined });
      setLoanForm({ direction: 'debo', personName: '', amount: '', dueDate: '' });
      setCreatingLoan(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el préstamo.');
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

  const prestamos = data.deudas.filter((d) => d.type === 'prestamo');

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-lg font-semibold text-[var(--text)]">Préstamos</h1>

      {/* ---- De banco, financiera o app ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--text)]">
            <i className="ph ph-bank text-[var(--text-muted)]" aria-hidden="true" /> De banco, financiera o app
          </h2>
          <GradientButton variant="ghost" onClick={openCreate}>
            <i className="ph ph-plus" aria-hidden="true" /> Agregar
          </GradientButton>
        </div>

        {prestamos.length === 0 ? (
          <EmptyState icon="ph-bank" title="No tienes préstamos de este tipo" subtitle="Registra un préstamo bancario, de financiera o de una app." />
        ) : (
          <>
            <DeudaSummary deudas={prestamos} payments={data.deudaPayments} />
            <div className="flex flex-col gap-2">
              {prestamos.map((d) => (
                <DeudaItem
                  key={d.id}
                  deuda={d}
                  payments={data.deudaPayments}
                  accounts={data.accounts}
                  paid={paidDeudaIds.has(d.id)}
                  paymentRecord={paidThisMonth.find((p) => p.deudaId === d.id)}
                  onPay={() => openPay(d)}
                  onUnpay={(id) => unpayDeuda.mutate({ id })}
                  onEdit={() => openEdit(d)}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {/* ---- Entre personas ---- */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--text)]">
            <i className="ph ph-users-three text-[var(--text-muted)]" aria-hidden="true" /> Entre personas
          </h2>
          <GradientButton variant="ghost" onClick={() => setCreatingLoan(true)}>
            <i className="ph ph-plus" aria-hidden="true" /> Agregar
          </GradientButton>
        </div>

        {data.personLoans.length === 0 ? (
          <EmptyState icon="ph-users-three" title="No tienes préstamos con personas" subtitle="Registra dinero que prestaste o que te prestaron — familiares, amigos, etc." />
        ) : (
          <PersonLoansList
            loans={data.personLoans}
            onSettle={(loan) => {
              setSettleAccountId(data.accounts.find((a) => a.type !== 'tarjeta')?.id || '');
              setError(null);
              setSettling(loan);
            }}
            onDelete={(id) => deleteLoan.mutate({ id })}
          />
        )}
      </section>

      <DeudaFormModal
        open={!!modal}
        onClose={closeModal}
        isEdit={modal?.mode === 'edit'}
        forcedType="prestamo"
        form={form}
        setForm={setForm}
        onSubmit={handleSubmit}
        loading={addDeuda.isPending || updateDeuda.isPending}
        error={error}
      />

      <Modal open={!!paying} onClose={() => setPaying(null)} title={paying ? `Pagar ${paying.name}` : ''}>
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

      <Modal open={creatingLoan} onClose={() => setCreatingLoan(false)} title="Nuevo préstamo entre personas">
        <form onSubmit={handleAddLoan} className="flex flex-col gap-4">
          <Select label="Dirección" value={loanForm.direction} onChange={(e) => setLoanForm({ ...loanForm, direction: e.target.value as 'debo' | 'me_deben' })}>
            <option value="debo">Yo le debo a alguien</option>
            <option value="me_deben">Alguien me debe</option>
          </Select>
          <Input label="Nombre de la persona" required value={loanForm.personName} onChange={(e) => setLoanForm({ ...loanForm, personName: e.target.value })} />
          <Input label="Monto" type="number" step="0.01" required value={loanForm.amount} onChange={(e) => setLoanForm({ ...loanForm, amount: e.target.value })} />
          <Input label="Fecha de vencimiento (opcional)" type="date" value={loanForm.dueDate} onChange={(e) => setLoanForm({ ...loanForm, dueDate: e.target.value })} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={addLoan.isPending} className="w-full">
            Registrar
          </GradientButton>
        </form>
      </Modal>

      <Modal open={!!settling} onClose={() => setSettling(null)} title={settling ? `Saldar con ${settling.personName}` : ''}>
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
    </div>
  );
}

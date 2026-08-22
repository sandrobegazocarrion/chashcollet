import { useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import type { AppState, Deuda } from '../../lib/types';
import { DeudaFormModal, DeudaGroupedList, DeudaSummary, EmptyState, deudaToForm, emptyDeudaForm, todayStr, type DeudaFormState } from './shared';

// Espeja #tab-servicios de public/index.html: pagos recurrentes (agua, luz, alquiler,
// internet, etc.) — los préstamos (bancarios y entre personas) viven en su propia
// pestaña "Préstamos" (PrestamosPage.tsx), igual que en el sidebar original.
export function ServiciosPage({ data }: { data: AppState }) {
  const [modal, setModal] = useState<{ mode: 'create' | 'edit'; deuda?: Deuda } | null>(null);
  const [form, setForm] = useState<DeudaFormState>(emptyDeudaForm('otro'));
  const [paying, setPaying] = useState<Deuda | null>(null);
  const [payForm, setPayForm] = useState({ accountId: '', amount: '' });
  const [error, setError] = useState<string | null>(null);

  const addDeuda = useApiMutation<unknown, Deuda>('POST', '/api/deudas');
  const updateDeuda = useApiMutation<{ id: string } & Record<string, unknown>, Deuda>('PUT', (b) => `/api/deudas/${b.id}`);
  const deleteDeuda = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/deudas/${b.id}`);
  const payDeuda = useApiMutation<{ id: string; accountId?: string; amount?: number }, unknown>('POST', (b) => `/api/deudas/${b.id}/pay`);
  const unpayDeuda = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/deuda-payments/${b.id}`);

  const thisMonth = todayStr().slice(0, 7);
  const paidThisMonth = data.deudaPayments.filter((p) => p.month === thisMonth);
  const paidDeudaIds = new Set(paidThisMonth.map((p) => p.deudaId));

  function openCreate() {
    setForm(emptyDeudaForm('otro'));
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
    const body = {
      name: form.name.trim(),
      type: form.type,
      amount: form.amount ? Number(form.amount) : undefined,
      dueDay: Number(form.dueDay),
      variableAmount: form.variableAmount,
    };
    try {
      if (modal?.mode === 'edit' && modal.deuda) await updateDeuda.mutateAsync({ id: modal.deuda.id, ...body });
      else await addDeuda.mutateAsync(body);
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  async function handleDelete(d: Deuda) {
    if (!confirm(`¿Eliminar "${d.name}"?`)) return;
    try {
      await deleteDeuda.mutateAsync({ id: d.id });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'No se pudo eliminar.');
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

  const servicios = data.deudas.filter((d) => d.type !== 'prestamo');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-[var(--text)]">Servicios</h1>
        <GradientButton onClick={openCreate}>
          <i className="ph ph-plus" aria-hidden="true" /> Agregar
        </GradientButton>
      </div>

      {servicios.length === 0 ? (
        <EmptyState icon="ph-receipt" title="No tienes servicios registrados" subtitle="Agrega tus pagos recurrentes: agua, luz, alquiler, internet, etc." />
      ) : (
        <>
          <DeudaSummary deudas={servicios} payments={data.deudaPayments} />
          <DeudaGroupedList
            deudas={servicios}
            payments={data.deudaPayments}
            accounts={data.accounts}
            paidDeudaIds={paidDeudaIds}
            paidThisMonth={paidThisMonth}
            onPay={openPay}
            onUnpay={(paymentId) => unpayDeuda.mutate({ id: paymentId })}
            onEdit={openEdit}
            onDelete={handleDelete}
          />
        </>
      )}

      <DeudaFormModal open={!!modal} onClose={closeModal} isEdit={modal?.mode === 'edit'} form={form} setForm={setForm} onSubmit={handleSubmit} loading={addDeuda.isPending || updateDeuda.isPending} error={error} />

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
    </div>
  );
}

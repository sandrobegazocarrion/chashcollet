import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/layout/PageHeader';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import { type AccountColorKey } from '../../lib/accountColor';
import { PERUVIAN_BANKS } from '../../lib/banks';
import type { Account, AppState, CardCharge, CardNetwork } from '../../lib/types';
import { CardShell, AddCardTile } from './CardShell';
import { CardDetailPanel } from './CardDetailPanel';

const NETWORK_LABELS: Record<CardNetwork, string> = {
  visa: 'Visa',
  mastercard: 'Mastercard',
  amex: 'Amex',
  diners: 'Diners',
  otra: 'Otra',
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_NEW_CARD = { name: '', bank: '', network: 'otra' as CardNetwork, balance: '', creditLimit: '', billingDay: '', closingDay: '' };

// Tarjeta protagonista (380×240) centrada, con flechas a los lados para navegar entre
// tarjetas reales + "Nueva tarjeta" al final (ver CardShell.tsx). Tocarla la encoge
// con zoom hasta una barra compacta acoplada arriba de un panel de detalle con tabs
// Resumen/Cuotas/Movimientos (ver CardDetailPanel.tsx) — ya no hay panel aparte ni
// secciones de cuotas/pagos sueltas en la página.
export function TarjetaPage({ data }: { data: AppState }) {
  const cards = data.accounts.filter((a) => a.type === 'tarjeta');
  // position: 0..cards.length — cards.length es la posición de "+ Nueva tarjeta".
  const [position, setPosition] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const clampedPosition = Math.min(position, cards.length);
  const isAddPosition = clampedPosition === cards.length;
  const activeCard = isAddPosition ? undefined : cards[clampedPosition];

  const [addingCard, setAddingCard] = useState(false);
  const [addingCharge, setAddingCharge] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newCardForm, setNewCardForm] = useState(EMPTY_NEW_CARD);
  const [chargeForm, setChargeForm] = useState({ description: '', totalAmount: '', totalInstallments: '1', date: todayStr() });
  const liquidAccounts = data.accounts.filter((a) => a.type !== 'tarjeta');
  const [payForm, setPayForm] = useState({ amount: '', sourceId: liquidAccounts[0]?.id || '' });

  const addAccount = useApiMutation<unknown, Account>('POST', '/api/accounts');
  const setColor = useApiMutation<{ id: string; color: AccountColorKey }, Account>('PUT', (b) => `/api/accounts/${b.id}`);
  const addCharge = useApiMutation<unknown, CardCharge>('POST', '/api/cardcharges');
  const deleteCharge = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/cardcharges/${b.id}`);
  const markInstallment = useApiMutation<{ id: string }, CardCharge>('POST', (b) => `/api/cardcharges/${b.id}/mark`);
  const payCard = useApiMutation<unknown, unknown>('POST', '/api/card-payments');
  const deletePayment = useApiMutation<{ id: string }, void>('DELETE', (b) => `/api/card-payments/${b.id}`);

  function goPrev() {
    if (clampedPosition > 0) {
      setPosition(clampedPosition - 1);
      setExpanded(false);
    }
  }
  function goNext() {
    if (clampedPosition < cards.length) {
      setPosition(clampedPosition + 1);
      setExpanded(false);
    }
  }
  function goTo(i: number) {
    setPosition(i);
    setExpanded(false);
  }

  async function handleAddCard(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const newPosition = cards.length;
      await addAccount.mutateAsync({
        type: 'tarjeta',
        name: newCardForm.name.trim(),
        bank: newCardForm.bank || undefined,
        network: newCardForm.network,
        balance: Number(newCardForm.balance) || 0,
        creditLimit: newCardForm.creditLimit ? Number(newCardForm.creditLimit) : undefined,
        billingDay: newCardForm.billingDay ? Number(newCardForm.billingDay) : undefined,
        closingDay: newCardForm.closingDay ? Number(newCardForm.closingDay) : undefined,
      });
      setPosition(newPosition);
      setExpanded(false);
      setNewCardForm(EMPTY_NEW_CARD);
      setAddingCard(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la tarjeta.');
    }
  }

  if (cards.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Tarjeta" actionLabel="Nueva tarjeta" onAction={() => setAddingCard(true)} />
        <p className="text-sm text-[var(--text-muted)]">Todavía no tienes tarjetas de crédito registradas.</p>
        <NewCardModal
          open={addingCard}
          onClose={() => setAddingCard(false)}
          form={newCardForm}
          setForm={setNewCardForm}
          onSubmit={handleAddCard}
          loading={addAccount.isPending}
          error={error}
        />
      </div>
    );
  }

  async function handleAddCharge(e: FormEvent) {
    e.preventDefault();
    if (!activeCard) return;
    setError(null);
    try {
      await addCharge.mutateAsync({
        cardId: activeCard.id,
        description: chargeForm.description.trim(),
        totalAmount: Number(chargeForm.totalAmount),
        totalInstallments: Number(chargeForm.totalInstallments) || 1,
        date: chargeForm.date,
      });
      setChargeForm({ description: '', totalAmount: '', totalInstallments: '1', date: todayStr() });
      setAddingCharge(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar la compra.');
    }
  }

  async function handlePay(e: FormEvent) {
    e.preventDefault();
    if (!activeCard) return;
    setError(null);
    try {
      await payCard.mutateAsync({ cardId: activeCard.id, sourceId: payForm.sourceId, amount: Number(payForm.amount) });
      setPayForm({ amount: '', sourceId: liquidAccounts[0]?.id || '' });
      setPaying(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Tarjeta" actionLabel="Compra en cuotas" onAction={() => setAddingCharge(true)} />

      <div className="flex flex-col items-center gap-4">
        {/* w-full + min-w-0 en el slot del medio: en pantallas angostas (el ancho
            fijo de 380px de la tarjeta desbordaba en celulares reales, ej. Galaxy
            S25 ~393px) las flechas se quedan con su tamaño y la tarjeta se achica
            para que la fila entera quepa sin scroll horizontal. */}
        <div className="flex w-full max-w-[500px] items-center gap-2 sm:gap-3">
          {!expanded && (
            <button
              type="button"
              onClick={goPrev}
              disabled={clampedPosition === 0}
              aria-label="Tarjeta anterior"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-30"
            >
              <i className="ph ph-caret-left" aria-hidden="true" />
            </button>
          )}

          <div className="min-w-0 flex-1">
            {isAddPosition ? (
              <AddCardTile onClick={() => setAddingCard(true)} />
            ) : (
              activeCard && <CardShell account={activeCard} expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
            )}
          </div>

          {!expanded && (
            <button
              type="button"
              onClick={goNext}
              disabled={clampedPosition === cards.length}
              aria-label="Tarjeta siguiente"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] shadow-sm hover:text-[var(--text)] disabled:pointer-events-none disabled:opacity-30"
            >
              <i className="ph ph-caret-right" aria-hidden="true" />
            </button>
          )}
        </div>

        {!expanded && cards.length > 1 && (
          <div className="flex gap-1.5">
            {cards.map((c, i) => (
              <button
                key={c.id}
                type="button"
                aria-label={`Ir a tarjeta ${i + 1}`}
                onClick={() => goTo(i)}
                className="h-[7px] w-[7px] rounded-full transition-colors"
                style={{ background: i === clampedPosition ? 'var(--text)' : 'var(--border)' }}
              />
            ))}
          </div>
        )}

        {!expanded && !isAddPosition && (
          <p className="text-center text-xs text-[var(--text-faint)]">Toca la tarjeta para ver resumen, cuotas y movimientos.</p>
        )}

        {activeCard && (
          <CardDetailPanel
            account={activeCard}
            data={data}
            expanded={expanded}
            onPay={() => setPaying(true)}
            onSimulateApply={(amount) => {
              setPayForm({ ...payForm, amount });
              setPaying(true);
            }}
            onSetColor={(color) => setColor.mutate({ id: activeCard.id, color })}
            onMarkInstallment={(id) => markInstallment.mutate({ id })}
            onDeleteCharge={(id) => deleteCharge.mutate({ id })}
            onDeletePayment={(id) => deletePayment.mutate({ id })}
          />
        )}
      </div>

      <NewCardModal
        open={addingCard}
        onClose={() => setAddingCard(false)}
        form={newCardForm}
        setForm={setNewCardForm}
        onSubmit={handleAddCard}
        loading={addAccount.isPending}
        error={error}
      />

      <Modal open={addingCharge} onClose={() => setAddingCharge(false)} title="Nueva compra en cuotas">
        <form onSubmit={handleAddCharge} className="flex flex-col gap-4">
          <Input
            label="Descripción"
            required
            value={chargeForm.description}
            onChange={(e) => setChargeForm({ ...chargeForm, description: e.target.value })}
          />
          <Input
            label="Monto total"
            type="number"
            step="0.01"
            required
            value={chargeForm.totalAmount}
            onChange={(e) => setChargeForm({ ...chargeForm, totalAmount: e.target.value })}
          />
          <Input
            label="N.º de cuotas"
            type="number"
            min={1}
            required
            value={chargeForm.totalInstallments}
            onChange={(e) => setChargeForm({ ...chargeForm, totalInstallments: e.target.value })}
          />
          <Input
            label="Fecha de compra"
            type="date"
            required
            value={chargeForm.date}
            onChange={(e) => setChargeForm({ ...chargeForm, date: e.target.value })}
          />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={addCharge.isPending} className="w-full">
            Registrar compra
          </GradientButton>
        </form>
      </Modal>

      <Modal open={paying} onClose={() => setPaying(false)} title={`Pagar ${activeCard?.name ?? 'tarjeta'}`}>
        <form onSubmit={handlePay} className="flex flex-col gap-4">
          <Select label="Cuenta de origen" required value={payForm.sourceId} onChange={(e) => setPayForm({ ...payForm, sourceId: e.target.value })}>
            {liquidAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance)}
              </option>
            ))}
          </Select>
          <Input
            label="Monto a pagar"
            type="number"
            step="0.01"
            required
            value={payForm.amount}
            onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
          />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={payCard.isPending} className="w-full">
            Confirmar pago
          </GradientButton>
        </form>
      </Modal>
    </div>
  );
}

interface NewCardFormState {
  name: string;
  bank: string;
  network: CardNetwork;
  balance: string;
  creditLimit: string;
  billingDay: string;
  closingDay: string;
}

function NewCardModal({
  open,
  onClose,
  form,
  setForm,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  form: NewCardFormState;
  setForm: (f: NewCardFormState) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Nueva tarjeta">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Select label="Banco (opcional)" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
          <option value="">Sin banco específico</option>
          {Object.entries(PERUVIAN_BANKS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </Select>
        <Select label="Red" value={form.network} onChange={(e) => setForm({ ...form, network: e.target.value as CardNetwork })}>
          {(Object.keys(NETWORK_LABELS) as CardNetwork[]).map((k) => (
            <option key={k} value={k}>
              {NETWORK_LABELS[k]}
            </option>
          ))}
        </Select>
        <Input
          label="Deuda inicial"
          type="number"
          step="0.01"
          required
          value={form.balance}
          onChange={(e) => setForm({ ...form, balance: e.target.value })}
        />
        <Input
          label="Línea de crédito (opcional)"
          type="number"
          step="0.01"
          value={form.creditLimit}
          onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Día de facturación"
            type="number"
            min={1}
            max={31}
            value={form.billingDay}
            onChange={(e) => setForm({ ...form, billingDay: e.target.value })}
          />
          <Input
            label="Día de corte"
            type="number"
            min={1}
            max={31}
            value={form.closingDay}
            onChange={(e) => setForm({ ...form, closingDay: e.target.value })}
          />
        </div>
        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}
        <GradientButton type="submit" loading={loading} className="w-full">
          Crear tarjeta
        </GradientButton>
      </form>
    </Modal>
  );
}

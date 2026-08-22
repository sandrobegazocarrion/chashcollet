import { useMemo, type FormEvent } from 'react';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { deudaReferenceAmount, formatDate, formatMoney } from '../../lib/finance';
import { DEUDA_TYPE_ICONS, DEUDA_TYPE_LABELS, LENDER_LABELS, deudaTypeColorVar, deudaUrgencyInfo, personLoanUrgency } from '../../lib/deudaTypes';
import type { AppState, Deuda, DeudaType, LenderType, PersonLoan } from '../../lib/types';

// Piezas compartidas entre ServiciosPage y PrestamosPage — en la app vieja
// (public/index.html) viven en dos pestañas separadas del sidebar (#tab-servicios y
// #tab-prestamos) pero comparten el mismo modelo de datos y el mismo render de fila
// (DEUDA_LIST_CONFIG en app.js), así que acá también comparten estos componentes.

export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export interface DeudaFormState {
  name: string;
  type: DeudaType;
  amount: string;
  dueDay: string;
  variableAmount: boolean;
  lenderType: LenderType;
  lenderName: string;
  interestRate: string;
  principal: string;
  totalInstallments: string;
}
export function emptyDeudaForm(type: DeudaType): DeudaFormState {
  return { name: '', type, amount: '', dueDay: '1', variableAmount: false, lenderType: 'banco', lenderName: '', interestRate: '', principal: '', totalInstallments: '' };
}
export function deudaToForm(d: Deuda): DeudaFormState {
  return {
    name: d.name,
    type: d.type,
    amount: d.amount != null ? String(d.amount) : '',
    dueDay: String(d.dueDay),
    variableAmount: d.variableAmount,
    lenderType: d.lenderType || 'banco',
    lenderName: d.lenderName || '',
    interestRate: d.interestRate != null ? String(d.interestRate) : '',
    principal: d.principal != null ? String(d.principal) : '',
    totalInstallments: d.totalInstallments != null ? String(d.totalInstallments) : '',
  };
}

export function EmptyState({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-12 text-center">
      <i className={`ph ${icon} text-3xl text-[var(--text-faint)]`} aria-hidden="true" />
      <p className="font-semibold text-[var(--text)]">{title}</p>
      <p className="text-sm text-[var(--text-muted)]">{subtitle}</p>
    </Card>
  );
}

// Espeja .deudas-summary: total del mes + cuántas pagadas + barra de progreso.
export function DeudaSummary({ deudas, payments }: { deudas: Deuda[]; payments: AppState['deudaPayments'] }) {
  const monthKey = todayStr().slice(0, 7);
  const paymentsThisMonth = payments.filter((p) => p.month === monthKey);
  const paidIds = new Set(paymentsThisMonth.map((p) => p.deudaId));

  const totalMes = deudas.reduce((s, d) => s + (d.type === 'prestamo' || !d.variableAmount ? d.amount || 0 : deudaReferenceAmount(d, payments)), 0);
  const pagado = paymentsThisMonth.reduce((s, p) => s + (deudas.some((d) => d.id === p.deudaId) ? p.amount || 0 : 0), 0);
  const pendiente = Math.max(0, totalMes - pagado);
  const paidCount = deudas.filter((d) => paidIds.has(d.id)).length;
  const pct = deudas.length > 0 ? Math.round((paidCount / deudas.length) * 100) : 0;
  const mesLabel = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  return (
    <Card>
      <div className="mb-3.5 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            Este mes · {mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1)}
          </p>
          <p className="num text-2xl font-extrabold tracking-tight text-[var(--text)]">
            {formatMoney(totalMes)} <span className="text-sm font-medium text-[var(--text-muted)]">/ mes aprox.</span>
          </p>
        </div>
        <div className="text-right">
          <p className="num text-xl font-extrabold text-[var(--green)]">
            {paidCount}/{deudas.length}
          </p>
          <p className="text-[11px] font-semibold text-[var(--text-faint)]">pagadas</p>
        </div>
      </div>
      <div className="mb-2.5 h-2 overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)]">
        <div className="h-full rounded-[var(--radius-pill)] bg-[var(--green)]" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex flex-wrap gap-3.5 text-[12.5px] font-bold">
        <span className="num text-[var(--green)]">
          <i className="ph ph-check-circle" aria-hidden="true" /> {formatMoney(pagado)} pagado
        </span>
        <span className="num text-[var(--red)]">
          <i className="ph ph-hourglass" aria-hidden="true" /> {formatMoney(pendiente)} pendiente
        </span>
      </div>
    </Card>
  );
}

export function DeudaGroupedList({
  deudas,
  payments,
  accounts,
  paidDeudaIds,
  paidThisMonth,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
}: {
  deudas: Deuda[];
  payments: AppState['deudaPayments'];
  accounts: AppState['accounts'];
  paidDeudaIds: Set<string>;
  paidThisMonth: AppState['deudaPayments'];
  onPay: (d: Deuda) => void;
  onUnpay: (paymentId: string) => void;
  onEdit: (d: Deuda) => void;
  onDelete: (d: Deuda) => void;
}) {
  const ORDER: DeudaType[] = ['alquiler', 'agua', 'luz', 'gas', 'internet', 'suscripcion', 'otro'];
  const grouped = useMemo(() => {
    const g: Partial<Record<DeudaType, Deuda[]>> = {};
    deudas.forEach((d) => {
      (g[d.type] ||= []).push(d);
    });
    return g;
  }, [deudas]);
  const types = ORDER.filter((t) => grouped[t]);

  return (
    <div className="flex flex-col gap-5">
      {types.map((type) => (
        <div key={type}>
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <i className={`ph ${DEUDA_TYPE_ICONS[type]}`} aria-hidden="true" /> {DEUDA_TYPE_LABELS[type]}
          </div>
          <div className="flex flex-col gap-2">
            {grouped[type]!.map((d) => (
              <DeudaItem
                key={d.id}
                deuda={d}
                payments={payments}
                accounts={accounts}
                paid={paidDeudaIds.has(d.id)}
                paymentRecord={paidThisMonth.find((p) => p.deudaId === d.id)}
                onPay={() => onPay(d)}
                onUnpay={onUnpay}
                onEdit={() => onEdit(d)}
                onDelete={() => onDelete(d)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DeudaItem({
  deuda,
  payments,
  accounts,
  paid,
  paymentRecord,
  onPay,
  onUnpay,
  onEdit,
  onDelete,
}: {
  deuda: Deuda;
  payments: AppState['deudaPayments'];
  accounts: AppState['accounts'];
  paid: boolean;
  paymentRecord?: AppState['deudaPayments'][number];
  onPay: () => void;
  onUnpay: (paymentId: string) => void;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  const colorVar = deudaTypeColorVar(deuda.type);
  const urgency = deudaUrgencyInfo(deuda.dueDay, paid);
  const acc = deuda.accountId ? accounts.find((a) => a.id === deuda.accountId) : null;
  let displayAmount: number | null;
  let approx = false;
  if (paid) displayAmount = paymentRecord?.amount ?? deuda.amount;
  else if (deuda.variableAmount) {
    displayAmount = deudaReferenceAmount(deuda, payments);
    approx = true;
  } else displayAmount = deuda.amount;

  const metaParts = [`Día ${deuda.dueDay}`];
  if (acc) metaParts.push(acc.name);
  if (deuda.type === 'prestamo' && deuda.lenderName) metaParts.push(`${deuda.lenderName} (${LENDER_LABELS[deuda.lenderType || 'banco']})`);

  const cuotaPct = deuda.type === 'prestamo' && deuda.totalInstallments ? Math.min(100, Math.round(((deuda.paidInstallments || 0) / deuda.totalInstallments) * 100)) : null;

  return (
    <div
      className={`flex flex-col gap-2.5 rounded-[var(--radius-control)] border border-l-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 ${paid ? 'opacity-70' : ''}`}
      style={{ borderLeftColor: `var(${colorVar})` }}
    >
      <div className="flex items-center gap-3">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(${colorVar})` }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--text)]">
            {deuda.name}
            {deuda.type === 'prestamo' && deuda.interestRate ? (
              <span className="ml-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9.5px] font-bold">{deuda.interestRate}%</span>
            ) : null}
            {deuda.variableAmount && <span className="ml-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9.5px] font-bold">Variable</span>}
            {deuda.autoDebit && (
              <span className="ml-1.5 rounded-full border border-[var(--border)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[9.5px] font-bold">
                <i className="ph ph-repeat" aria-hidden="true" /> Auto
              </span>
            )}
          </p>
          <p className="truncate text-[11.5px] text-[var(--text-faint)]">{metaParts.join(' · ')}</p>
        </div>
        <span className={`shrink-0 text-[11.5px] font-bold ${urgency.urgent && !paid ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>
          {paid ? (
            <>
              <i className="ph ph-check-circle" aria-hidden="true" /> Pagado
            </>
          ) : (
            urgency.text
          )}
        </span>
        <span className="num shrink-0 text-[15px] font-extrabold text-[var(--text)]">{displayAmount ? `${approx ? '~' : ''}${formatMoney(displayAmount)}` : '—'}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {paid && paymentRecord ? (
            <IconButton icon="ph-arrow-counter-clockwise" label="Deshacer pago" onClick={() => onUnpay(paymentRecord.id)} />
          ) : (
            <GradientButton onClick={onPay} className="!px-3 !py-1.5 !text-xs">
              Pagar
            </GradientButton>
          )}
          <IconButton icon="ph-pencil-simple" label="Editar" onClick={onEdit} />
          {onDelete && <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={onDelete} />}
        </div>
      </div>
      {cuotaPct !== null && (
        <div>
          <div className="mb-1 flex justify-between text-[11px] font-semibold text-[var(--text-muted)]">
            <span>Cuotas pagadas</span>
            <span className="num">
              {deuda.paidInstallments || 0} / {deuda.totalInstallments}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
            <div className="h-full" style={{ width: `${cuotaPct}%`, background: `var(${colorVar})` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PersonLoansList({ loans, onSettle, onDelete }: { loans: PersonLoan[]; onSettle: (l: PersonLoan) => void; onDelete: (id: string) => void }) {
  const pending = [...loans].filter((p) => !p.paid).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
  const settled = [...loans].filter((p) => p.paid).sort((a, b) => (b.paidDate || '').localeCompare(a.paidDate || ''));

  const item = (p: PersonLoan) => {
    const isDebo = p.direction === 'debo';
    const urgency = personLoanUrgency(p.dueDate);
    const colorVar = isDebo ? '--red' : '--green';
    return (
      <div key={p.id} className={`flex items-center gap-3 rounded-[var(--radius-control)] border border-l-2 border-[var(--border)] bg-[var(--surface)] px-4 py-3 ${p.paid ? 'opacity-70' : ''}`} style={{ borderLeftColor: `var(${colorVar})` }}>
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: `var(${colorVar})` }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--text)]">
            <span className="mr-1.5 rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold" style={{ color: `var(${colorVar})`, borderColor: `var(${colorVar})` }}>
              {isDebo ? 'Yo debo' : 'Me deben'}
            </span>
            {p.personName}
          </p>
          <p className="truncate text-[11.5px] text-[var(--text-faint)]">
            {p.dueDate ? formatDate(p.dueDate) : 'Sin fecha'}
            {p.note ? ` · ${p.note}` : ''}
          </p>
        </div>
        <span className={`shrink-0 text-[11.5px] font-bold ${urgency.urgent && !p.paid ? 'text-[var(--red)]' : 'text-[var(--text-muted)]'}`}>
          {p.paid ? (
            <>
              <i className="ph ph-check-circle" aria-hidden="true" /> Saldado
            </>
          ) : (
            urgency.text
          )}
        </span>
        <span className="num shrink-0 text-[15px] font-extrabold text-[var(--text)]">{formatMoney(p.amount)}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          {!p.paid && (
            <GradientButton onClick={() => onSettle(p)} className="!px-3 !py-1.5 !text-xs">
              {isDebo ? 'Pagar' : 'Cobrar'}
            </GradientButton>
          )}
          <IconButton icon="ph-trash" variant="danger" label="Eliminar" onClick={() => onDelete(p.id)} />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {pending.map(item)}
      {settled.length > 0 && (
        <>
          <p className="mb-1 mt-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">
            <i className="ph ph-check-circle" aria-hidden="true" /> Saldados
          </p>
          {settled.map(item)}
        </>
      )}
    </div>
  );
}

export function DeudaFormModal({
  open,
  onClose,
  isEdit,
  forcedType,
  form,
  setForm,
  onSubmit,
  loading,
  error,
}: {
  open: boolean;
  onClose: () => void;
  isEdit: boolean;
  forcedType?: DeudaType;
  form: DeudaFormState;
  setForm: (f: DeudaFormState) => void;
  onSubmit: (e: FormEvent) => void;
  loading: boolean;
  error: string | null;
}) {
  const isPrestamo = form.type === 'prestamo';
  const availableTypes = (Object.keys(DEUDA_TYPE_LABELS) as DeudaType[]).filter((t) => t !== 'prestamo');

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? 'Editar compromiso' : forcedType === 'prestamo' ? 'Nuevo préstamo' : 'Nuevo servicio'}>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        {!forcedType && !isEdit && (
          <Select label="Tipo" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DeudaType })}>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {DEUDA_TYPE_LABELS[t]}
              </option>
            ))}
          </Select>
        )}

        {isPrestamo ? (
          <>
            <Select label="Prestamista" value={form.lenderType} onChange={(e) => setForm({ ...form, lenderType: e.target.value as LenderType })}>
              {(Object.keys(LENDER_LABELS) as LenderType[]).map((k) => (
                <option key={k} value={k}>
                  {LENDER_LABELS[k]}
                </option>
              ))}
            </Select>
            <Input label="Nombre del prestamista (opcional)" value={form.lenderName} onChange={(e) => setForm({ ...form, lenderName: e.target.value })} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Monto del préstamo" type="number" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
              <Input label="Tasa de interés % mensual" type="number" step="0.01" value={form.interestRate} onChange={(e) => setForm({ ...form, interestRate: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label="Cuota mensual" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              <Input label="N.º de cuotas" type="number" min={1} value={form.totalInstallments} onChange={(e) => setForm({ ...form, totalInstallments: e.target.value })} />
            </div>
          </>
        ) : (
          <>
            <Input label="Monto (opcional si es variable)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-[var(--text)]">
              <input type="checkbox" checked={form.variableAmount} onChange={(e) => setForm({ ...form, variableAmount: e.target.checked })} />
              El monto varía cada mes
            </label>
          </>
        )}

        <Input label="Día de vencimiento" type="number" min={1} max={31} required value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} />

        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}
        <GradientButton type="submit" loading={loading} className="w-full">
          {isEdit ? 'Guardar cambios' : 'Crear'}
        </GradientButton>
      </form>
    </Modal>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney } from '../../lib/finance';
import { describeCalEvent, getMonthEvents, type CalEventDesc } from '../../lib/calendar';
import type { AppState, Deuda, Reminder } from '../../lib/types';
import type { TabId } from '../../components/layout/Sidebar';

const STATUS_CLASSES: Record<CalEventDesc['status']['kind'], string> = {
  success: 'text-[var(--green)] bg-[var(--green)]/[0.13]',
  warning: 'text-[var(--amber)] bg-[var(--amber)]/[0.15]',
  info: 'text-[var(--accent2)] bg-[var(--accent2)]/[0.13]',
  danger: 'text-[var(--red)] bg-[var(--red)]/[0.13]',
};
const WEEKDAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Espeja #tab-calendario: toggle Calendario/Lista, navegación de mes, grilla real con
// chips/puntos por día (recordatorio, compromiso, corte de tarjeta, día de sueldo), y
// modal de día con las acciones de pagar/editar — igual que dayEventCardHtml() en app.js.
export function CalendarioPage({ data, onGoTab }: { data: AppState; onGoTab: (tab: TabId) => void }) {
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [viewDate, setViewDate] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [dayModal, setDayModal] = useState<number | null>(null);

  const [creating, setCreating] = useState<{ day?: number } | null>(null);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [form, setForm] = useState({ name: '', amount: '', dueDay: '1' });
  const [error, setError] = useState<string | null>(null);

  const [payingDeuda, setPayingDeuda] = useState<Deuda | null>(null);
  const [payDeudaForm, setPayDeudaForm] = useState({ accountId: '', amount: '' });
  const [payingReminder, setPayingReminder] = useState<Reminder | null>(null);
  const [payReminderAccountId, setPayReminderAccountId] = useState('');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState<number | null>(null);
  const [pickerYear, setPickerYear] = useState<number | null>(null);

  const addReminder = useApiMutation<unknown, Reminder>('POST', '/api/reminders');
  const updateReminder = useApiMutation<{ id: string } & Record<string, unknown>, Reminder>('PUT', (b) => `/api/reminders/${b.id}`);
  const payDeuda = useApiMutation<{ id: string; accountId?: string; amount?: number }, unknown>('POST', (b) => `/api/deudas/${b.id}/pay`);
  const payInstallment = useApiMutation<{ id: string; accountId?: string }, unknown>('POST', (b) => `/api/reminders/${b.id}/pay`);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });

  const byDay = useMemo(() => getMonthEvents(data, year, month), [data, year, month]);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1);
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;
  const incomeDays = new Set(data.settings.incomeDays || []);
  const todayIso = todayStr();
  const nowY = new Date().getFullYear();
  const yearOptions = Array.from({ length: 9 }, (_, i) => nowY - 3 + i);

  function openCreate(day?: number) {
    setForm({ name: '', amount: '', dueDay: String(day || 1) });
    setError(null);
    setCreating({ day });
  }
  function openEditReminder(r: Reminder) {
    setForm({ name: r.name, amount: r.amount != null ? String(r.amount) : '', dueDay: String(r.dueDay) });
    setError(null);
    setEditingReminder(r);
    setDayModal(null);
  }
  function closeFormModal() {
    setCreating(null);
    setEditingReminder(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const body = { name: form.name.trim(), amount: form.amount ? Number(form.amount) : undefined, dueDay: Number(form.dueDay) };
    try {
      if (editingReminder) await updateReminder.mutateAsync({ id: editingReminder.id, ...body });
      else await addReminder.mutateAsync(body);
      closeFormModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.');
    }
  }

  function openPay(desc: CalEventDesc) {
    if (desc.etype === 'deuda') {
      const d = data.deudas.find((x) => x.id === desc.eid);
      if (!d) return;
      setPayDeudaForm({ accountId: data.accounts.find((a) => a.type !== 'tarjeta')?.id || '', amount: d.amount != null ? String(d.amount) : '' });
      setError(null);
      setPayingDeuda(d);
      setDayModal(null);
    } else if (desc.etype === 'reminder') {
      const r = data.reminders.find((x) => x.id === desc.eid);
      if (!r) return;
      setPayReminderAccountId(data.accounts.find((a) => a.type !== 'tarjeta')?.id || '');
      setError(null);
      setPayingReminder(r);
      setDayModal(null);
    }
  }

  async function handlePayDeuda(e: FormEvent) {
    e.preventDefault();
    if (!payingDeuda) return;
    setError(null);
    try {
      await payDeuda.mutateAsync({ id: payingDeuda.id, accountId: payDeudaForm.accountId || undefined, amount: payDeudaForm.amount ? Number(payDeudaForm.amount) : undefined });
      setPayingDeuda(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    }
  }
  async function handlePayReminder(e: FormEvent) {
    e.preventDefault();
    if (!payingReminder) return;
    setError(null);
    try {
      await payInstallment.mutateAsync({ id: payingReminder.id, accountId: payReminderAccountId || undefined });
      setPayingReminder(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar el pago.');
    }
  }

  const dayEvents = dayModal ? (byDay[dayModal] || []).map((ev) => describeCalEvent(ev, data.deudaPayments)) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-[var(--text)]">Calendario de pagos</h1>
        <div className="flex items-center gap-2">
          <GradientButton variant="ghost" onClick={() => onGoTab('configuracion')}>
            <i className="ph ph-bell" aria-hidden="true" /> Notificaciones
          </GradientButton>
          <GradientButton onClick={() => openCreate()}>
            <i className="ph ph-plus" aria-hidden="true" /> Nuevo pago
          </GradientButton>
        </div>
      </div>

      {/* Toggle Calendario / Lista */}
      <div className="inline-flex w-fit overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
        {(['calendar', 'list'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-[12.5px] font-semibold ${view === v ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-raised)]'}`}
          >
            <i className={`ph ${v === 'calendar' ? 'ph-calendar-blank' : 'ph-list-bullets'}`} aria-hidden="true" />
            {v === 'calendar' ? 'Calendario' : 'Lista'}
          </button>
        ))}
      </div>

      {/* Navegación de mes */}
      <div className="relative flex items-center gap-2">
        <IconButton icon="ph-caret-left" label="Mes anterior" onClick={() => setViewDate(new Date(year, month - 1, 1))} />
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex min-w-[150px] items-center justify-center gap-1 rounded-[var(--radius-control)] px-2 py-1 text-sm font-bold text-[var(--text)] hover:bg-[var(--surface-raised)]"
        >
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
          <i className="ph ph-caret-down text-xs" aria-hidden="true" />
        </button>
        <IconButton icon="ph-caret-right" label="Mes siguiente" onClick={() => setViewDate(new Date(year, month + 1, 1))} />

        {pickerOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
            <select
              aria-label="Mes"
              value={pickerMonth ?? month}
              onChange={(e) => setPickerMonth(Number(e.target.value))}
              className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none"
            >
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>
            <select
              aria-label="Año"
              value={pickerYear ?? year}
              onChange={(e) => setPickerYear(Number(e.target.value))}
              className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-sm text-[var(--text)] outline-none"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <GradientButton
              onClick={() => {
                setViewDate(new Date(pickerYear ?? year, pickerMonth ?? month, 1));
                setPickerOpen(false);
              }}
              className="!px-3 !py-1.5 !text-xs"
            >
              Ir
            </GradientButton>
          </div>
        )}
      </div>

      {view === 'calendar' ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4">
          <div className="mb-2 grid grid-cols-7 text-center text-[11px] font-bold uppercase text-[var(--text-faint)]">
            {WEEKDAYS.map((w, i) => (
              <span key={i}>{w}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`e${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
              const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
              const events = byDay[d] || [];
              const isToday = iso === todayIso;
              const isIncomeDay = incomeDays.has(d);
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDayModal(d)}
                  className={`relative flex aspect-square flex-col items-center justify-start gap-1 rounded-[var(--radius-control)] border p-1 pt-1.5 text-xs ${
                    isToday ? 'border-[var(--brand)]' : 'border-transparent hover:border-[var(--border)]'
                  }`}
                >
                  {isIncomeDay && <i className="ph ph-hand-coins absolute right-1 top-1 text-[10px] text-[var(--green)]" aria-hidden="true" title="Día de sueldo" />}
                  <span className={`font-semibold ${isToday ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>{d}</span>
                  {events.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-0.5">
                      {events.slice(0, 4).map((ev, i) => {
                        const desc = describeCalEvent(ev, data.deudaPayments);
                        return <span key={i} className="h-1.5 w-1.5 rounded-full" style={{ background: `var(${desc.colorVar})` }} />;
                      })}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--border)] pt-3 text-[11px] text-[var(--text-muted)]">
            <span className="flex items-center gap-1">
              <i className="ph ph-calendar-blank" aria-hidden="true" /> Pago programado
            </span>
            <span className="flex items-center gap-1">
              <i className="ph ph-clipboard-text" aria-hidden="true" /> Compromiso
            </span>
            <span className="flex items-center gap-1">
              <i className="ph ph-scissors" aria-hidden="true" /> Corte de tarjeta
            </span>
            <span className="flex items-center gap-1 text-[var(--green)]">
              <i className="ph ph-hand-coins" aria-hidden="true" /> Día de sueldo
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4">
          <p className="mb-3 text-sm font-semibold text-[var(--text)]">Todos los pagos de {monthLabel}</p>
          {Object.keys(byDay).length === 0 ? (
            <p className="py-4 text-sm text-[var(--text-muted)]">No hay pagos programados este mes.</p>
          ) : (
            <div className="flex flex-col divide-y divide-[var(--border)]">
              {Object.keys(byDay)
                .map(Number)
                .sort((a, b) => a - b)
                .map((day) =>
                  byDay[day].map((ev, i) => {
                    const desc = describeCalEvent(ev, data.deudaPayments);
                    return <CalEventRow key={`${day}-${i}`} day={day} desc={desc} onPay={() => openPay(desc)} />;
                  })
                )}
            </div>
          )}
        </div>
      )}

      {/* Modal de día */}
      <Modal open={dayModal !== null} onClose={() => setDayModal(null)} title={dayModal ? `Día ${dayModal}` : ''}>
        {dayEvents.length === 0 ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-[var(--text-muted)]">Sin pagos programados este día.</p>
            <GradientButton
              onClick={() => {
                const d = dayModal;
                setDayModal(null);
                openCreate(d || undefined);
              }}
            >
              <i className="ph ph-plus" aria-hidden="true" /> Agregar pago para el día {dayModal}
            </GradientButton>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {dayEvents.map((desc, i) => (
              <div key={i} className={`rounded-[var(--radius-control)] border p-3.5 ${desc.urgent ? 'border-[var(--red)]/40' : 'border-[var(--border)]'}`}>
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, var(${desc.colorVar}) 18%, transparent)`, color: `var(${desc.colorVar})` }}>
                    <i className={`ph ${desc.icon}`} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[var(--text)]">
                      {desc.name}
                      {desc.tag && <span className="ml-1.5 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] font-bold">{desc.tag}</span>}
                    </p>
                    <p className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                      <span className="num">
                        {desc.approx ? '~' : ''}
                        {formatMoney(desc.amount)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS_CLASSES[desc.status.kind]}`}>{desc.status.text}</span>
                    </p>
                  </div>
                </div>
                {desc.progress && (
                  <div className="mt-2.5">
                    <div className="mb-1 flex justify-between text-[11px] font-semibold text-[var(--text-muted)]">
                      <span>Cuotas pagadas</span>
                      <span className="num">
                        {desc.progress.paid}/{desc.progress.total}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                      <div className="h-full" style={{ width: `${(desc.progress.paid / desc.progress.total) * 100}%`, background: `var(${desc.colorVar})` }} />
                    </div>
                  </div>
                )}
                <div className="mt-3 flex gap-2">
                  {desc.isPayable && (
                    <GradientButton onClick={() => openPay(desc)} className="!px-3 !py-1.5 !text-xs">
                      {desc.payLabel}
                    </GradientButton>
                  )}
                  {desc.etype === 'reminder' && (
                    <IconButton
                      icon="ph-pencil-simple"
                      label="Editar"
                      onClick={() => {
                        const r = data.reminders.find((x) => x.id === desc.eid);
                        if (r) openEditReminder(r);
                      }}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Nuevo/editar recordatorio */}
      <Modal open={!!creating || !!editingReminder} onClose={closeFormModal} title={editingReminder ? 'Editar recordatorio' : 'Nuevo pago'}>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input label="Nombre" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Monto (opcional)" type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <Input label="Día de vencimiento" type="number" min={1} max={31} required value={form.dueDay} onChange={(e) => setForm({ ...form, dueDay: e.target.value })} />
          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
          <GradientButton type="submit" loading={addReminder.isPending || updateReminder.isPending} className="w-full">
            {editingReminder ? 'Guardar cambios' : 'Crear'}
          </GradientButton>
        </form>
      </Modal>

      {/* Pagar deuda */}
      <Modal open={!!payingDeuda} onClose={() => setPayingDeuda(null)} title={payingDeuda ? `Pagar ${payingDeuda.name}` : ''}>
        <form onSubmit={handlePayDeuda} className="flex flex-col gap-4">
          <Select label="Cuenta de origen" value={payDeudaForm.accountId} onChange={(e) => setPayDeudaForm({ ...payDeudaForm, accountId: e.target.value })}>
            <option value="">No mover dinero (solo marcar pagado)</option>
            {data.accounts
              .filter((a) => a.type !== 'tarjeta')
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {formatMoney(a.balance)}
                </option>
              ))}
          </Select>
          <Input label="Monto" type="number" step="0.01" value={payDeudaForm.amount} onChange={(e) => setPayDeudaForm({ ...payDeudaForm, amount: e.target.value })} />
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

      {/* Pagar cuota de recordatorio */}
      <Modal open={!!payingReminder} onClose={() => setPayingReminder(null)} title={payingReminder ? `Pagar cuota · ${payingReminder.name}` : ''}>
        <form onSubmit={handlePayReminder} className="flex flex-col gap-4">
          <Select label="Cuenta de origen" value={payReminderAccountId} onChange={(e) => setPayReminderAccountId(e.target.value)}>
            <option value="">No mover dinero (solo marcar pagado)</option>
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
          <GradientButton type="submit" loading={payInstallment.isPending} className="w-full">
            Confirmar pago
          </GradientButton>
        </form>
      </Modal>
    </div>
  );
}

function CalEventRow({ day, desc, onPay }: { day: number; desc: CalEventDesc; onPay: () => void }) {
  return (
    <div className={`flex items-center gap-3 py-2.5 ${desc.urgent ? 'text-[var(--red)]' : ''}`}>
      <span className="w-6 shrink-0 text-center text-sm font-bold text-[var(--text)]">{day}</span>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: `color-mix(in srgb, var(${desc.colorVar}) 18%, transparent)`, color: `var(${desc.colorVar})` }}>
        <i className={`ph ${desc.icon}`} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--text)]">
        {desc.name}
        {desc.tag && <span className="ml-1.5 rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[9.5px] font-bold">{desc.tag}</span>}
      </span>
      <span className="num shrink-0 text-sm font-semibold text-[var(--text)]">
        {desc.approx ? '~' : ''}
        {formatMoney(desc.amount)}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${STATUS_CLASSES[desc.status.kind]}`}>{desc.status.text}</span>
      {desc.isPayable && (
        <GradientButton onClick={onPay} className="!px-3 !py-1.5 !text-xs">
          {desc.payLabel}
        </GradientButton>
      )}
    </div>
  );
}

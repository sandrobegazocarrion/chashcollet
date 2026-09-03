import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { formatMoney, formatDate } from '../../lib/finance';
import { categoryColorVar } from '../../lib/categoryColor';
import { CATEGORY_ICONS, ACC_ICONS, todayStr } from './TransaccionesPage';
import type { AppState, Transaction } from '../../lib/types';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'] as const;

// Registro rápido del monto tipo "caja registradora": se escribe dígito a dígito
// (teclado propio o físico), con separador de miles en vivo — el punto/decimales
// tal como se tipean, sin recortarlos mientras se escribe.
function formatAmountDisplay(raw: string): string {
  if (!raw) return '0';
  const [intPart, decPart] = raw.split('.');
  const intFormatted = intPart === '' ? '0' : Number(intPart).toLocaleString('en-US');
  if (decPart === undefined) return intFormatted;
  return `${intFormatted}.${decPart}`;
}

// Reemplaza el <Modal> genérico anterior para este flujo específico: es la acción
// más frecuente de toda la app (registrar un movimiento), así que se le da su
// propia hoja a pantalla completa (móvil) / tarjeta centrada (desktop) con un
// teclado numérico propio en vez de un <input type=number> — igual que un monto
// de dinero merece tratarse en cualquier app de pagos seria.
export function TransactionSheet({
  open,
  editing,
  onClose,
  data,
  initialType = 'gasto',
}: {
  open: boolean;
  editing: Transaction | null;
  onClose: () => void;
  data: AppState;
  initialType?: 'ingreso' | 'gasto';
}) {
  const [type, setType] = useState<'ingreso' | 'gasto'>('gasto');
  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState(todayStr());
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState('');
  const [description, setDescription] = useState('');
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const amountBoxRef = useRef<HTMLDivElement>(null);

  const addTx = useApiMutation<unknown, Transaction>('POST', '/api/transactions');
  const updateTx = useApiMutation<{ id: string } & Record<string, unknown>, Transaction>('PUT', (body) => `/api/transactions/${body.id}`);

  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }
    if (editing) {
      setType(editing.type);
      setAmountStr(String(editing.amount));
      setDate(editing.date);
      setCategory(editing.category);
      setAccountId(editing.accountId || '');
      setDescription(editing.description || '');
    } else {
      setType(initialType);
      setAmountStr('');
      setDate(todayStr());
      setCategory(data.categories[0] || 'Otros');
      setAccountId(data.accounts.find((a) => a.type !== 'tarjeta')?.id || data.accounts[0]?.id || '');
      setDescription('');
    }
    setShowDatePicker(false);
    setError(null);
    const raf = requestAnimationFrame(() => setMounted(true));
    const focusT = setTimeout(() => amountBoxRef.current?.focus(), 80);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(focusT);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe resetear al abrir/cambiar de movimiento, no en cada cambio de `data`/`initialType`
  }, [open, editing]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  function pressDigit(d: string) {
    setAmountStr((prev) => {
      if (d === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const dotIdx = prev.indexOf('.');
      if (dotIdx !== -1 && prev.length - dotIdx - 1 >= 2) return prev;
      if (prev === '0') return d;
      if (prev.length >= 12) return prev;
      return prev + d;
    });
  }
  function backspace() {
    setAmountStr((prev) => prev.slice(0, -1));
  }
  function onAmountKeyDown(e: ReactKeyboardEvent) {
    if (/^[0-9]$/.test(e.key)) {
      pressDigit(e.key);
      e.preventDefault();
    } else if (e.key === '.' || e.key === ',') {
      pressDigit('.');
      e.preventDefault();
    } else if (e.key === 'Backspace') {
      backspace();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  }

  const amountNum = parseFloat(amountStr) || 0;
  const canSave = amountNum > 0 && !!accountId && !!category;
  const saving = addTx.isPending || updateTx.isPending;
  const typeColorVar = type === 'ingreso' ? '--green' : '--red';

  async function submit() {
    if (!canSave || saving) return;
    setError(null);
    const body = { type, amount: amountNum, date, category, description: description.trim() || undefined, accountId };
    try {
      if (editing) await updateTx.mutateAsync({ id: editing.id, ...body });
      else await addTx.mutateAsync(body);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el movimiento.');
    }
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 sm:items-center ${
        mounted ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] bg-[var(--surface)] shadow-[0_-8px_40px_rgba(0,0,0,0.25)] transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)] sm:max-w-[400px] sm:rounded-[28px] sm:shadow-[0_24px_64px_-24px_rgba(0,0,0,0.45)] ${
          mounted ? 'translate-y-0 sm:opacity-100' : 'translate-y-full sm:translate-y-6 sm:opacity-0'
        }`}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? 'Editar movimiento' : 'Nuevo movimiento'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-[var(--border)]" />
        </div>

        <div className="flex items-center justify-between px-4 pb-1 pt-2 sm:pt-4">
          <IconButton icon="ph-x" label="Cerrar" onClick={onClose} />
          <p className="text-[13px] font-semibold text-[var(--text-muted)]">{editing ? 'Editar movimiento' : 'Nuevo movimiento'}</p>
          <span className="w-8 shrink-0" aria-hidden="true" />
        </div>

        <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-4 pt-1">
          <TypeToggle value={type} onChange={setType} />

          <div
            ref={amountBoxRef}
            tabIndex={0}
            role="textbox"
            aria-label="Monto"
            onKeyDown={onAmountKeyDown}
            className="flex flex-col items-center gap-1 rounded-[20px] py-2 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Monto</span>
            <div className="flex items-baseline gap-1.5">
              <span className="num text-2xl font-bold" style={{ color: `var(${typeColorVar})` }}>
                S/
              </span>
              <span className="num text-[44px] font-extrabold leading-none tracking-tight" style={{ color: `var(${typeColorVar})` }}>
                {formatAmountDisplay(amountStr)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {KEYS.map((k) =>
              k === 'back' ? (
                <button
                  key="back"
                  type="button"
                  onClick={backspace}
                  aria-label="Borrar dígito"
                  className="flex h-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-lg text-[var(--text-muted)] transition-transform active:scale-90"
                >
                  <i className="ph ph-backspace" aria-hidden="true" />
                </button>
              ) : (
                <button
                  key={k}
                  type="button"
                  onClick={() => pressDigit(k)}
                  className="num flex h-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-xl font-semibold text-[var(--text)] transition-transform active:scale-90"
                >
                  {k}
                </button>
              )
            )}
          </div>

          <input
            type="text"
            aria-label="Nota (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Añade una nota (opcional)"
            className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] focus:border-[var(--brand)]"
          />

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Categoría</span>
            <div className="flex flex-wrap gap-2">
              {data.categories.map((c) => {
                const active = c === category;
                const colorVar = categoryColorVar(c);
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition-colors"
                    style={
                      active
                        ? { background: `var(${colorVar})`, color: '#fff' }
                        : { background: `color-mix(in srgb, var(${colorVar}) 13%, transparent)`, color: `var(${colorVar})` }
                    }
                  >
                    <i className={`ph ${CATEGORY_ICONS[c] || 'ph-credit-card'}`} aria-hidden="true" />
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Cuenta</span>
            <div className="flex flex-wrap gap-2">
              {data.accounts.map((a) => {
                const active = a.id === accountId;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccountId(a.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[13px] font-semibold transition-colors ${
                      active
                        ? 'border-[var(--brand)] bg-[var(--brand-muted-bg)] text-[var(--brand-muted-text)]'
                        : 'border-[var(--border)] bg-[var(--surface-raised)] text-[var(--text-muted)]'
                    }`}
                  >
                    <i className={`ph ${ACC_ICONS[a.type] || 'ph-wallet'}`} aria-hidden="true" />
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--border)] px-3.5 py-2.5">
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-[var(--text-muted)]">
              <i className="ph ph-calendar-blank" aria-hidden="true" />
              {date === todayStr() ? 'Hoy' : formatDate(date)}
            </span>
            <button type="button" onClick={() => setShowDatePicker((v) => !v)} className="text-[12.5px] font-semibold text-[var(--brand)]">
              Cambiar
            </button>
          </div>
          {showDatePicker && (
            <input
              type="date"
              aria-label="Fecha del movimiento"
              autoFocus
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setShowDatePicker(false);
              }}
              className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-2.5 text-[14px] text-[var(--text)] outline-none"
            />
          )}

          {error && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-5 py-3.5">
          <button
            type="button"
            onClick={submit}
            disabled={!canSave || saving}
            className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-control)] py-3.5 text-[15px] font-bold text-white transition-all active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: `var(${typeColorVar})` }}
          >
            {saving ? (
              <i className="ph ph-circle-notch animate-spin" aria-hidden="true" />
            ) : (
              <i className={`ph ${type === 'ingreso' ? 'ph-arrow-down' : 'ph-arrow-up'}`} aria-hidden="true" />
            )}
            Guardar {amountNum > 0 ? formatMoney(amountNum) : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function TypeToggle({ value, onChange }: { value: 'ingreso' | 'gasto'; onChange: (v: 'ingreso' | 'gasto') => void }) {
  return (
    <div className="flex rounded-full bg-[var(--surface-raised)] p-1">
      {(['gasto', 'ingreso'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`flex-1 rounded-full py-2 text-[13.5px] font-bold transition-colors ${
            value === t ? 'text-white' : 'text-[var(--text-muted)]'
          }`}
          style={value === t ? { background: `var(${t === 'ingreso' ? '--green' : '--red'})` } : undefined}
        >
          {t === 'ingreso' ? 'Ingreso' : 'Gasto'}
        </button>
      ))}
    </div>
  );
}

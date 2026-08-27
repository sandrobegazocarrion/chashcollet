import { useMemo, useState } from 'react';
import { BarChart } from '../../components/ui/BarChart';
import { formatMoney } from '../../lib/finance';
import { projectCardPayoff } from '../../lib/cardHealth';

interface CardInterestCalculatorProps {
  balance: number;
  interestRate: number | null | undefined;
  onSetInterestRate: (rate: number | null) => void;
  savingRate: boolean;
}

function suggestedPayment(balance: number, minFloor: number): number {
  const guess = Math.round((balance * 0.1) / 10) * 10;
  return Math.max(10, Math.min(balance, Math.max(guess, Math.ceil((minFloor + 10) / 10) * 10)));
}

// Pieza nueva de Fase 3 (Tarjetas): a diferencia de los estados de cuenta de los
// bancos peruanos (que muestran el pago mínimo pero nunca dramatizan su costo real),
// esta calculadora usa la TCEA de la tarjeta para mostrar en soles cuánto cuesta
// pagar de a pocos, y marca sin rodeos cuándo un pago no alcanza ni para cubrir el
// interés del mes (deuda revolvente que nunca baja).
export function CardInterestCalculator({ balance, interestRate, onSetInterestRate, savingRate }: CardInterestCalculatorProps) {
  const [editingRate, setEditingRate] = useState(false);
  const [rateInput, setRateInput] = useState(interestRate != null ? String(interestRate) : '');

  const hasRate = interestRate != null && interestRate > 0;
  const zeroFloor = hasRate ? balance * ((interestRate as number) / 100 / 12) : 0;
  const [payment, setPayment] = useState<number>(() => suggestedPayment(balance, zeroFloor));

  const projection = useMemo(
    () => (hasRate ? projectCardPayoff(balance, interestRate as number, payment) : null),
    [hasRate, balance, interestRate, payment],
  );

  function saveRate() {
    const n = Number(rateInput);
    onSetInterestRate(rateInput.trim() === '' ? null : Number.isFinite(n) && n > 0 ? n : null);
    setEditingRate(false);
  }

  if (balance <= 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-[var(--radius-card)] p-5 text-white" style={{ background: 'var(--sidebar-bg)' }}>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-white/45">Calculadora</p>
      <p className="mt-0.5 text-[15px] font-bold leading-snug">¿Cuánto te cuesta pagar de a pocos?</p>

      <div className="mt-3.5 flex items-center justify-between gap-2 rounded-xl bg-white/[0.06] px-3.5 py-2.5">
        <span className="text-[12.5px] text-white/60">TCEA de tu tarjeta</span>
        {editingRate ? (
          <div className="flex items-center gap-1.5">
            <input
              autoFocus
              type="number"
              step="0.1"
              min={0}
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              placeholder="Ej: 68.5"
              className="num w-20 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-right text-[12.5px] text-white outline-none focus:border-white/50"
            />
            <span className="text-[11px] text-white/50">%</span>
            <button
              type="button"
              onClick={saveRate}
              disabled={savingRate}
              aria-label="Guardar TCEA"
              className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
            >
              <i className="ph ph-check text-xs" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setEditingRate(true)} className="num flex items-center gap-1.5 text-[12.5px] font-bold text-white">
            {hasRate ? `${interestRate}% anual` : 'Agregar'}
            <i className="ph ph-pencil-simple text-[11px] text-white/50" aria-hidden="true" />
          </button>
        )}
      </div>

      {!hasRate ? (
        <p className="mt-3 text-[12.5px] leading-relaxed text-white/50">
          Agrega la TCEA de tu tarjeta (está en tu estado de cuenta) para ver cuánto te cuesta en intereses pagar de a pocos, y si un pago te alcanza
          para no quedarte estancado en deuda revolvente.
        </p>
      ) : (
        projection && (
          <>
            <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-white/45">Si pagas al mes</p>
            <p className="num text-[26px] font-extrabold leading-none">{formatMoney(payment)}</p>
            <input
              type="range"
              min={0}
              max={Math.round(balance)}
              step={10}
              value={payment}
              onChange={(e) => setPayment(Number(e.target.value))}
              className="mt-3 w-full accent-white"
            />
            <div className="flex justify-between text-[11px] text-white/40">
              <span className="num">S/ 0</span>
              <span className="num">{formatMoney(balance)} · pago total</span>
            </div>

            {projection.isTrap ? (
              <div className="mt-4 rounded-xl border border-[var(--red)]/40 bg-[var(--red)]/15 p-3.5">
                <p className="flex items-center gap-1.5 text-[13px] font-bold text-white">
                  <i className="ph ph-warning-circle" aria-hidden="true" /> Con este pago nunca terminas de pagar
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-white/70">
                  {payment > 0
                    ? `S/ ${payment.toFixed(2)} no cubre los ${formatMoney(projection.monthlyInterestCost)} de intereses del mes: tu deuda crece ${formatMoney(
                        projection.monthlyInterestCost - payment,
                      )} cada mes aunque pagues puntual.`
                    : 'Sin pagar nada, tu deuda solo acumula intereses cada mes.'}
                </p>
                <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2">
                  <span className="text-[11.5px] text-white/50">Pago mínimo para no crecer</span>
                  <span className="num text-[13px] font-bold text-white">{formatMoney(projection.minFloor)}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex flex-col">
                <div className="flex items-center justify-between border-b border-white/10 py-2 text-[13px]">
                  <span className="text-white/55">Intereses de este mes</span>
                  <span className="num font-bold text-white">{formatMoney(projection.monthlyInterestCost)}</span>
                </div>
                <div className="flex items-center justify-between border-b border-white/10 py-2 text-[13px]">
                  <span className="text-white/55">Terminarías de pagar en</span>
                  <span className="num font-bold text-white">
                    ~{projection.months} mes{projection.months === 1 ? '' : 'es'}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 text-[13px]">
                  <span className="text-white/55">Costo total en intereses</span>
                  <span className="num font-bold" style={{ color: 'var(--ink-danger)' }}>
                    {formatMoney(projection.totalInterest)}
                  </span>
                </div>

                {projection.schedule.length > 1 && (
                  <div className="mt-2">
                    <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-white/40">Saldo proyectado</p>
                    <BarChart
                      height={70}
                      items={projection.schedule.map((s, i) => ({
                        label: `M${s.month}`,
                        value: s.balance > 0 ? s.balance : 1,
                        color: i === projection.schedule.length - 1 && s.balance <= 0.01 ? 'var(--ink-success)' : 'var(--ink-accent)',
                      }))}
                    />
                  </div>
                )}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

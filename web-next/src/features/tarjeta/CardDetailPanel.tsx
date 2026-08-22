import { useState } from 'react';
import { GradientButton } from '../../components/ui/GradientButton';
import { Input } from '../../components/ui/Input';
import { formatDate, formatMoney } from '../../lib/finance';
import { ACCOUNT_COLOR_PALETTE, accountColorKey, accountColorVar, type AccountColorKey } from '../../lib/accountColor';
import { amountToReachIdeal, cardUtilization, cardZone, daysUntilDay, IDEAL_UTIL_PCT, ZONE_VAR } from '../../lib/cardHealth';
import { CardHealthGauge } from './CardHealthGauge';
import { CardCycleTrack } from './CardCycleTrack';
import type { Account, AppState, CardCharge, CardPayment } from '../../lib/types';

type Tab = 'resumen' | 'cuotas' | 'movimientos';

interface CardDetailPanelProps {
  account: Account;
  data: AppState;
  expanded: boolean;
  onPay: () => void;
  onSimulateApply: (amount: string) => void;
  onSetColor: (color: AccountColorKey) => void;
  onMarkInstallment: (chargeId: string) => void;
  onDeleteCharge: (chargeId: string) => void;
  onDeletePayment: (paymentId: string) => void;
}

// Panel blanco debajo de la barra compacta (ver CardShell.tsx) con 3 tabs. La altura
// se anima con el truco de grid-template-rows 0fr↔1fr (permite animar hacia "auto"
// sin medir el DOM a mano) sincronizado con el zoom de la tarjeta — se queda montado
// siempre para que la transición sea fluida, no aparece/desaparece de golpe.
export function CardDetailPanel({
  account,
  data,
  expanded,
  onPay,
  onSimulateApply,
  onSetColor,
  onMarkInstallment,
  onDeleteCharge,
  onDeletePayment,
}: CardDetailPanelProps) {
  const [tab, setTab] = useState<Tab>('resumen');
  const [simulating, setSimulating] = useState(false);
  const [simAmount, setSimAmount] = useState('');

  const hasLimit = !!(account.creditLimit && account.creditLimit > 0);
  const util = hasLimit ? cardUtilization(account.balance, account.creditLimit!) : 0;
  const zone = cardZone(util);
  const zoneColorVar = `var(${ZONE_VAR[zone]})`;
  const closingDays = daysUntilDay(account.closingDay);
  const billingDays = daysUntilDay(account.billingDay);
  const amountNeeded = hasLimit ? amountToReachIdeal(account.balance, account.creditLimit!) : 0;
  const isHealthy = util < IDEAL_UTIL_PCT;

  const simAmountNum = Number(simAmount) || 0;
  const simulatedUtil = hasLimit && simAmountNum > 0 ? cardUtilization(Math.max(0, account.balance - simAmountNum), account.creditLimit!) : null;

  const charges = data.cardCharges.filter((c) => c.cardId === account.id);
  const payments = data.cardPayments.filter((p) => p.cardId === account.id);

  return (
    <div
      className={`grid w-full max-w-[380px] transition-[grid-template-rows] duration-[400ms] ease-[cubic-bezier(.22,.9,.32,1)] ${
        expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
      }`}
    >
      <div className="overflow-hidden">
        <div
          className={`overflow-hidden rounded-[24px] bg-[var(--surface)] p-5 shadow-[0_18px_40px_-16px_rgba(0,0,0,.22)] transition-opacity duration-300 ${
            expanded ? 'opacity-100 delay-100' : 'opacity-0'
          }`}
        >
          <div className="flex gap-1.5 rounded-xl bg-[var(--surface-raised)] p-1">
            {(['resumen', 'cuotas', 'movimientos'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`flex-1 rounded-[9px] py-2 text-[12.5px] font-semibold capitalize transition-colors ${
                  tab === t ? 'bg-[var(--surface)] text-[var(--text)] shadow-[0_2px_6px_rgba(0,0,0,.08)]' : 'text-[var(--text-muted)]'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="mt-3">
            {tab === 'resumen' && (
              <div>
                <p className="mb-0 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Ciclo de facturación</p>
                <CardCycleTrack closingDays={closingDays} billingDays={billingDays} zoneColorVar={zoneColorVar} />

                {hasLimit && (
                  <>
                    <CardHealthGauge pct={util} simulatedPct={simulatedUtil} />

                    <div
                      className="mt-2.5 flex items-start gap-2.5 rounded-xl p-3.5 text-[12.5px] leading-relaxed text-[var(--text)]"
                      style={{ background: `color-mix(in srgb, ${zoneColorVar} 10%, transparent)` }}
                    >
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: `color-mix(in srgb, ${zoneColorVar} 18%, transparent)` }}
                      >
                        <i className={`ph ${isHealthy ? 'ph-check-circle' : 'ph-warning-circle'}`} style={{ color: zoneColorVar }} aria-hidden="true" />
                      </span>
                      {isHealthy ? (
                        <span>
                          Vas bien: llevas <b className="num">{Math.round(util)}%</b> de tu línea usada. Mantente bajo 30% para
                          conservar un buen historial crediticio.
                        </span>
                      ) : (
                        <span>
                          Estás en <b className="num">{Math.round(util)}%</b> de tu línea. Paga{' '}
                          <b className="num">{formatMoney(amountNeeded)}</b> antes del corte
                          {closingDays !== null ? ` (en ${closingDays} día${closingDays === 1 ? '' : 's'})` : ''} para bajar a 30% y
                          cuidar tu score.
                        </span>
                      )}
                    </div>
                  </>
                )}

                <div className="mt-3.5 flex gap-2">
                  <GradientButton onClick={onPay} className="flex-1 !text-[12.5px]">
                    Pagar tarjeta
                  </GradientButton>
                  <GradientButton variant="ghost" onClick={() => setSimulating((v) => !v)} className="flex-1 !text-[12.5px]">
                    Simular pago
                  </GradientButton>
                </div>

                {simulating && (
                  <div className="mt-3 flex flex-col gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-3">
                    <Input
                      label="Monto a simular"
                      type="number"
                      step="0.01"
                      min={0}
                      value={simAmount}
                      onChange={(e) => setSimAmount(e.target.value)}
                      placeholder="Ej: 500"
                    />
                    {simulatedUtil !== null && (
                      <p className="text-xs text-[var(--text-muted)]">
                        Tu uso bajaría de <b className="num text-[var(--text)]">{Math.round(util)}%</b> a{' '}
                        <b className="num" style={{ color: `var(${ZONE_VAR[cardZone(simulatedUtil)]})` }}>
                          {Math.round(simulatedUtil)}%
                        </b>
                        .
                      </p>
                    )}
                    <div className="flex gap-2">
                      <GradientButton
                        type="button"
                        variant="ghost"
                        disabled={simAmountNum <= 0}
                        onClick={() => onSimulateApply(simAmount)}
                        className="flex-1 !text-xs"
                      >
                        Registrar este pago
                      </GradientButton>
                      <GradientButton
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setSimulating(false);
                          setSimAmount('');
                        }}
                        className="flex-1 !text-xs"
                      >
                        Cerrar
                      </GradientButton>
                    </div>
                  </div>
                )}

                <p className="mb-2 mt-4 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Color de la tarjeta</p>
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
            )}

            {tab === 'cuotas' && <CuotasTab charges={charges} onMark={onMarkInstallment} onDelete={onDeleteCharge} />}
            {tab === 'movimientos' && (
              <MovimientosTab charges={charges} payments={payments} data={data} onDeletePayment={onDeletePayment} onDeleteCharge={onDeleteCharge} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CuotasTab({
  charges,
  onMark,
  onDelete,
}: {
  charges: CardCharge[];
  onMark: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (charges.length === 0) {
    return <p className="py-3 text-center text-[12.5px] text-[var(--text-faint)]">Sin compras en cuotas registradas.</p>;
  }
  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Compras en cuotas</p>
      <div className="flex flex-col">
        {charges.map((c) => {
          const pct = Math.min(100, Math.round((c.paidInstallments / c.totalInstallments) * 100));
          return (
            <div key={c.id} className="group flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-b-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-[var(--text)]">{c.description || 'Compra'}</p>
                <p className="text-[11.5px] text-[var(--text-muted)]">
                  Cuota {c.paidInstallments} de {c.totalInstallments}
                </p>
                <div className="mt-1.5 h-1 w-[92px] overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                  <div className="h-full rounded-[var(--radius-pill)] bg-[var(--brand)]" style={{ width: `${pct}%` }} />
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="num text-[13px] font-bold text-[var(--text)]">{formatMoney(c.installmentAmount ?? c.totalAmount)}</span>
                <div className="flex opacity-0 transition-opacity group-hover:opacity-100">
                  {c.paidInstallments < c.totalInstallments && (
                    <button
                      type="button"
                      onClick={() => onMark(c.id)}
                      aria-label="Marcar cuota pagada"
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--green)]"
                    >
                      <i className="ph ph-check text-xs" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDelete(c.id)}
                    aria-label="Eliminar"
                    className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] hover:bg-[var(--red)]/12 hover:text-[var(--red)]"
                  >
                    <i className="ph ph-trash text-xs" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface Movement {
  id: string;
  desc: string;
  date: string;
  amount: number;
  kind: 'charge' | 'payment';
}

function MovimientosTab({
  charges,
  payments,
  data,
  onDeletePayment,
  onDeleteCharge,
}: {
  charges: CardCharge[];
  payments: CardPayment[];
  data: AppState;
  onDeletePayment: (id: string) => void;
  onDeleteCharge: (id: string) => void;
}) {
  const movements: Movement[] = [
    ...charges.map((c) => ({ id: c.id, desc: c.description || 'Compra', date: c.purchaseDate, amount: -c.totalAmount, kind: 'charge' as const })),
    ...payments.map((p) => {
      const source = data.accounts.find((a) => a.id === p.sourceId);
      return { id: p.id, desc: source ? `Pago desde ${source.name}` : 'Pago', date: p.date, amount: p.amount, kind: 'payment' as const };
    }),
  ].sort((a, b) => b.date.localeCompare(a.date));

  if (movements.length === 0) {
    return <p className="py-3 text-center text-[12.5px] text-[var(--text-faint)]">Sin movimientos todavía en esta tarjeta.</p>;
  }

  return (
    <div>
      <p className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Movimientos recientes</p>
      <div className="flex flex-col">
        {movements.map((m) => (
          <div key={`${m.kind}-${m.id}`} className="group flex items-center justify-between gap-3 border-b border-[var(--border)] py-2.5 last:border-b-0">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-semibold text-[var(--text)]">{m.desc}</p>
              <p className="text-[11.5px] text-[var(--text-muted)]">{formatDate(m.date)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <span className={`num text-[13px] font-bold ${m.amount >= 0 ? 'text-[var(--green)]' : 'text-[var(--text)]'}`}>
                {m.amount >= 0 ? '+ ' : '- '}
                {formatMoney(Math.abs(m.amount))}
              </span>
              <button
                type="button"
                onClick={() => (m.kind === 'payment' ? onDeletePayment(m.id) : onDeleteCharge(m.id))}
                aria-label="Eliminar"
                className="flex h-6 w-6 items-center justify-center rounded-full text-[var(--text-muted)] opacity-0 transition-opacity hover:bg-[var(--red)]/12 hover:text-[var(--red)] group-hover:opacity-100"
              >
                <i className="ph ph-trash text-xs" aria-hidden="true" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

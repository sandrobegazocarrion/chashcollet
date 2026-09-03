import { Card } from '../../components/ui/Card';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface StatsRowProps {
  safeToSpend: number;
  savingsRate: number | null;
  onRegisterIncome: () => void;
}

// Fiel al mockup de tarjetas: cada stat es su propia <Card> con un ícono circular
// arriba a la derecha. El estado vacío de tasa de ahorro conserva el botón
// "Registrar ingreso" — es funcionalidad real que se agregó a pedido, no algo del
// mockup a eliminar por fidelidad.
export function StatsRow({ safeToSpend, savingsRate, onRegisterIncome }: StatsRowProps) {
  return (
    <>
      <Card title="Líquido − pagos pendientes del mes − ahorro que aún falta apartar en tus chanchitos">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Balance disponible</p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/[0.12] text-[var(--brand)]">
            <i className="ph ph-wallet" aria-hidden="true" />
          </span>
        </div>
        <p className={`num mt-2 text-xl font-bold ${safeToSpend >= 0 ? 'text-[var(--text)]' : 'text-[var(--red)]'}`}>
          <AnimatedDigits value={formatMoney(safeToSpend)} animationKey="safeToSpend" />
        </p>
        <p className="mt-1.5 text-[11.5px] leading-relaxed text-[var(--text-faint)]">Disponible después de gastos registrados.</p>
      </Card>
      <Card className="flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tasa de ahorro</p>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/[0.12] text-[var(--brand)]">
            <i className="ph ph-piggy-bank" aria-hidden="true" />
          </span>
        </div>
        {savingsRate === null ? (
          <>
            <p className="num mt-2 text-xl font-bold text-[var(--text-faint)]">--%</p>
            <p className="mt-1.5 flex-1 text-[11.5px] leading-relaxed text-[var(--text-faint)]">Registra ingresos este mes para ver tu tasa de ahorro.</p>
            <button
              type="button"
              onClick={onRegisterIncome}
              className="num mt-2.5 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-[var(--brand)]"
            >
              Registrar ingreso <i className="ph ph-arrow-right" aria-hidden="true" />
            </button>
          </>
        ) : (
          <p className="num mt-2 text-xl font-bold text-[var(--text)]">
            <AnimatedDigits value={`${savingsRate}%`} animationKey="savingsRate" />
          </p>
        )}
      </Card>
    </>
  );
}

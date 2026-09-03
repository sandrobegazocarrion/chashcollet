import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface StatsRowProps {
  safeToSpend: number;
  savingsRate: number | null;
  onRegisterIncome: () => void;
}

// Fiel al boceto blanco: un solo hairline vertical separa las dos columnas en vez
// de dos tarjetas con borde propio, más un hairline abajo cerrando la sección — el
// mismo lenguaje que <MonthCompareCard>. El valor negativo de Balance disponible
// sigue en rojo (alerta real, no solo estética) aunque el boceto lo muestre en
// tinta con datos siempre positivos.
export function StatsRow({ safeToSpend, savingsRate, onRegisterIncome }: StatsRowProps) {
  return (
    <div className="flex items-stretch divide-x divide-[var(--border-flat)] border-b border-[var(--border-flat)] pb-5">
      <div className="flex-1 pr-4" title="Líquido − pagos pendientes del mes − ahorro que aún falta apartar en tus chanchitos">
        <p className="text-sm text-[var(--text-faint)]">Balance disponible</p>
        <p className={`num mt-1 text-xl font-bold ${safeToSpend >= 0 ? 'text-[var(--text)]' : 'text-[var(--red)]'}`}>
          <AnimatedDigits value={formatMoney(safeToSpend)} animationKey="safeToSpend" />
        </p>
      </div>
      <div className="flex flex-1 flex-col pl-4">
        <p className="text-sm text-[var(--text-faint)]">Tasa de ahorro</p>
        {savingsRate === null ? (
          <>
            <p className="num mt-1 text-xl font-bold text-[var(--border-flat)]">--%</p>
            <p className="mt-1 flex-1 text-[12px] leading-relaxed text-[var(--text-faint)]">Registra ingresos este mes para calcular tu tasa.</p>
            <button
              type="button"
              onClick={onRegisterIncome}
              className="num mt-2.5 inline-flex items-center gap-1 self-start text-[12.5px] font-bold text-[var(--brand)]"
            >
              Registrar ingreso <i className="ph ph-arrow-right" aria-hidden="true" />
            </button>
          </>
        ) : (
          <p className="num mt-1 text-xl font-bold text-[var(--text)]">
            <AnimatedDigits value={`${savingsRate}%`} animationKey="savingsRate" />
          </p>
        )}
      </div>
    </div>
  );
}

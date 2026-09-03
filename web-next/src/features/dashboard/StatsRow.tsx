import { Card } from '../../components/ui/Card';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface StatsRowProps {
  safeToSpend: number;
  savingsRate: number | null;
  onRegisterIncome: () => void;
}

// Espeja las dos .summary-card (safe / rate) de renderDashboard(). El estado vacío
// de tasa de ahorro ahora tiene una acción real (Registrar ingreso) en vez de solo
// explicar por qué está vacío.
export function StatsRow({ safeToSpend, savingsRate, onRegisterIncome }: StatsRowProps) {
  return (
    <>
      <Card title="Líquido − pagos pendientes del mes − ahorro que aún falta apartar en tus chanchitos">
        <p className="text-sm text-[var(--text-muted)]">Balance disponible</p>
        <p className={`num mt-1 text-xl font-semibold ${safeToSpend >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          <AnimatedDigits value={formatMoney(safeToSpend)} animationKey="safeToSpend" />
        </p>
      </Card>
      <Card className="flex flex-col">
        <p className="text-sm text-[var(--text-muted)]">Tasa de ahorro</p>
        {savingsRate === null ? (
          <>
            <p className="num mt-1 text-xl font-semibold text-[var(--text-faint)]">--%</p>
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
          <p className="num mt-1 text-xl font-semibold text-[var(--text)]">
            <AnimatedDigits value={`${savingsRate}%`} animationKey="savingsRate" />
          </p>
        )}
      </Card>
    </>
  );
}

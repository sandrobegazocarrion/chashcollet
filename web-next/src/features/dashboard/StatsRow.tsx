import { Card } from '../../components/ui/Card';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface StatsRowProps {
  safeToSpend: number;
  savingsRate: number | null;
}

// Espeja las dos .summary-card (safe / rate) de renderDashboard().
export function StatsRow({ safeToSpend, savingsRate }: StatsRowProps) {
  return (
    <>
      <Card title="Líquido − pagos pendientes del mes − ahorro que aún falta apartar en tus chanchitos">
        <p className="text-sm text-[var(--text-muted)]">Balance disponible</p>
        <p className={`num mt-1 text-xl font-semibold ${safeToSpend >= 0 ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
          <AnimatedDigits value={formatMoney(safeToSpend)} animationKey="safeToSpend" />
        </p>
      </Card>
      <Card>
        <p className="text-sm text-[var(--text-muted)]">Tasa de ahorro</p>
        <p className="num mt-1 text-xl font-semibold text-[var(--text)]">
          {savingsRate === null ? '—' : <AnimatedDigits value={`${savingsRate}%`} animationKey="savingsRate" />}
        </p>
      </Card>
    </>
  );
}

import { Card } from '../../components/ui/Card';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface MonthCompareCardProps {
  monthIn: number;
  monthOut: number;
  monthNet: number;
  onOpenSubView: (type: 'ingresos' | 'gastos' | 'balance') => void;
}

// Espeja .month-compare-card en renderDashboard(): barra proporcional
// ingresos/gastos del mes en curso, más el balance neto del período — el balance y
// cada lado (ingresos/gastos) son botones que abren su propia sub-vista con el
// detalle día a día (ver SubView.tsx / data-action="open-subview" en el original).
export function MonthCompareCard({ monthIn, monthOut, monthNet, onOpenSubView }: MonthCompareCardProps) {
  const total = monthIn + monthOut;
  const inPct = total > 0 ? Math.round((monthIn / total) * 100) : monthIn === 0 && monthOut === 0 ? 50 : monthIn > 0 ? 100 : 0;
  const outPct = 100 - inPct;
  const monthLabel = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const positive = monthNet >= 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </span>
        <button
          type="button"
          onClick={() => onOpenSubView('balance')}
          className={`num text-lg font-extrabold tracking-tight ${positive ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}
        >
          <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="monthNet" />
        </button>
      </div>

      <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
        <div className="bg-[var(--green)]" style={{ width: `${inPct}%` }} />
        <div className="bg-[var(--red)]" style={{ width: `${outPct}%` }} />
      </div>

      <div className="mt-2.5 flex justify-between text-sm">
        <button type="button" onClick={() => onOpenSubView('ingresos')} className="text-left text-[var(--green)]">
          ↑ <span className="num"><AnimatedDigits value={formatMoney(monthIn)} animationKey="monthIn" /></span>
          <span className="ml-1 text-[var(--text-muted)]">Ingresos</span>
        </button>
        <button type="button" onClick={() => onOpenSubView('gastos')} className="text-right text-[var(--red)]">
          ↓ <span className="num"><AnimatedDigits value={formatMoney(monthOut)} animationKey="monthOut" /></span>
          <span className="ml-1 text-[var(--text-muted)]">Gastos</span>
        </button>
      </div>
    </Card>
  );
}

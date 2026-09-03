import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface MonthCompareCardProps {
  monthIn: number;
  monthOut: number;
  monthNet: number;
  spendVsPrevPct: number | null;
  prevMonthLabel: string;
  onOpenSubView: (type: 'ingresos' | 'gastos' | 'balance') => void;
}

// Fiel al boceto blanco: sin <Card>, hairline abajo en vez de borde alrededor.
// Ingresos/Gastos/Flujo neto van en tinta (no verde/rojo) — el boceto reserva el
// color para acentos puntuales (la barra de proporción), no para cada monto.
export function MonthCompareCard({ monthIn, monthOut, monthNet, spendVsPrevPct, prevMonthLabel, onOpenSubView }: MonthCompareCardProps) {
  const total = monthIn + monthOut;
  const outPct = total > 0 ? Math.round((monthOut / total) * 100) : 0;
  const monthLabel = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const positive = monthNet >= 0;
  // Gastar menos que el mes pasado es la buena noticia, aunque el número sea
  // negativo — por eso el tono se decide por spendingUp, no por el signo del %.
  const spendingUp = spendVsPrevPct !== null && spendVsPrevPct > 0;

  return (
    <div className="border-b border-[var(--border-flat)] pb-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-faint)]">
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </span>
        <button type="button" onClick={() => onOpenSubView('balance')} className="num text-sm font-bold text-[var(--text)]">
          <span className="mr-1 font-medium text-[var(--text-faint)]">Flujo neto</span>
          <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="monthNet" />
        </button>
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <button type="button" onClick={() => onOpenSubView('ingresos')} className="text-left">
          <span className="block text-xs text-[var(--text-faint)]">Ingresos</span>
          <span className="num text-[15px] font-bold text-[var(--text)]">
            <AnimatedDigits value={formatMoney(monthIn)} animationKey="monthIn" />
          </span>
        </button>
        <button type="button" onClick={() => onOpenSubView('gastos')} className="text-right">
          <span className="block text-xs text-[var(--text-faint)]">Gastos</span>
          <span className="num text-[15px] font-bold text-[var(--text)]">
            <AnimatedDigits value={formatMoney(monthOut)} animationKey="monthOut" />
          </span>
        </button>
      </div>

      <div className="mt-2.5 h-[3px] overflow-hidden rounded-full bg-[var(--border-flat)]">
        <div className="h-full rounded-full bg-[var(--brand)]" style={{ width: `${outPct}%` }} />
      </div>

      {spendVsPrevPct !== null && (
        <p className="num mt-2.5 text-[11.5px] font-medium text-[var(--text-muted)]">
          <i className={`ph ${spendingUp ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" /> {Math.abs(spendVsPrevPct)}% en gastos vs.{' '}
          {prevMonthLabel}
        </p>
      )}
    </div>
  );
}

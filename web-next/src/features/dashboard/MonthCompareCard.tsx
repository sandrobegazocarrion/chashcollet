import { Card } from '../../components/ui/Card';
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

// Fiel al mockup de tarjetas: encabezado con ícono de calendario, Ingresos/Gastos
// con círculo de color a la derecha de cada monto, hairline, Flujo neto del mes.
export function MonthCompareCard({ monthIn, monthOut, monthNet, spendVsPrevPct, prevMonthLabel, onOpenSubView }: MonthCompareCardProps) {
  const monthLabel = new Date().toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  const positive = monthNet >= 0;
  // Gastar menos que el mes pasado es la buena noticia, aunque el número sea
  // negativo — por eso el tono se decide por spendingUp, no por el signo del %.
  const spendingUp = spendVsPrevPct !== null && spendVsPrevPct > 0;

  return (
    <Card>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
          {monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1)}
        </span>
        <i className="ph ph-calendar-blank text-[var(--text-faint)]" aria-hidden="true" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <button type="button" onClick={() => onOpenSubView('ingresos')} className="flex items-center gap-2 text-left">
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--green)]">Ingresos</span>
            <span className="num text-lg font-bold text-[var(--text)]">
              <AnimatedDigits value={formatMoney(monthIn)} animationKey="monthIn" />
            </span>
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--green)]/[0.14] text-[var(--green)]">
            <i className="ph ph-arrow-up" aria-hidden="true" />
          </span>
        </button>
        <button type="button" onClick={() => onOpenSubView('gastos')} className="flex items-center gap-2 text-right">
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-wide text-[var(--red)]">Gastos</span>
            <span className="num text-lg font-bold text-[var(--text)]">
              <AnimatedDigits value={formatMoney(monthOut)} animationKey="monthOut" />
            </span>
          </span>
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/[0.12] text-[var(--red)]">
            <i className="ph ph-arrow-down" aria-hidden="true" />
          </span>
        </button>
      </div>

      {spendVsPrevPct !== null && (
        <p className="num mt-3 text-[11.5px] font-medium text-[var(--text-muted)]">
          <i className={`ph ${spendingUp ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" /> {Math.abs(spendVsPrevPct)}% en gastos vs.{' '}
          {prevMonthLabel}
        </p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-[var(--border-flat)] pt-3.5">
        <span className="text-sm text-[var(--text-muted)]">Flujo neto del mes</span>
        <button
          type="button"
          onClick={() => onOpenSubView('balance')}
          className={`num text-[15px] font-bold ${positive ? 'text-[var(--text)]' : 'text-[var(--red)]'}`}
        >
          <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="monthNet" />
        </button>
      </div>
    </Card>
  );
}

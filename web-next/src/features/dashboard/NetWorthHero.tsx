import { Card } from '../../components/ui/Card';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface NetWorthHeroProps {
  totalLiquid: number;
  monthNet: number;
}

// Espeja #netWorthHero/.hero-card de la app real: misma tarjeta que el resto (sin
// fondo ni glow propio, ver Card.tsx), se destaca solo por el tamaño del número.
// El chip usa el mismo patrón que .delta-chip en styles.css: color sólido + fondo
// tintado del mismo color (green/red), no el degradado de marca.
export function NetWorthHero({ totalLiquid, monthNet }: NetWorthHeroProps) {
  const positive = monthNet >= 0;
  return (
    <Card variant="hero" className="text-center sm:text-left">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Lo que tengo</p>
      <p className="num mt-1 break-words text-4xl font-extrabold leading-none tracking-tight text-[var(--text)] sm:text-6xl md:text-7xl">
        <AnimatedDigits value={formatMoney(totalLiquid)} animationKey="heroValue" />
      </p>
      <span
        className={`num mt-4 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12.5px] font-bold ${
          positive ? 'text-[var(--green)] bg-[var(--green)]/[0.14]' : 'text-[var(--red)] bg-[var(--red)]/[0.12]'
        }`}
      >
        <i className={`ph ${positive ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
        <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="heroDelta" /> · flujo
        neto de este mes
      </span>
    </Card>
  );
}

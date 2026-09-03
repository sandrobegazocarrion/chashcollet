import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface NetWorthHeroProps {
  totalLiquid: number;
  monthNet: number;
}

// A propósito NO usa <Card>: es el único dato que manda antes que cualquier otro
// bloque de Inicio, así que rompe el molde de tarjeta-con-borde que comparte el
// resto de la página en vez de ser "una tarjeta más, pero grande". Exclusivo de
// mobile (DesktopHomePage no lo importa) — DesktopHomePage.tsx queda intacto.
export function NetWorthHero({ totalLiquid, monthNet }: NetWorthHeroProps) {
  const positive = monthNet >= 0;
  return (
    <div className="px-0.5">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden="true" />
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lo que tengo</p>
      </div>
      <p className="num mt-1.5 break-words text-[clamp(2.25rem,11vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-[var(--text)] sm:text-6xl md:text-7xl">
        <AnimatedDigits value={formatMoney(totalLiquid)} animationKey="heroValue" />
      </p>
      <span
        className={`num mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12.5px] font-bold ${
          positive ? 'text-[var(--green)] bg-[var(--green)]/[0.14]' : 'text-[var(--red)] bg-[var(--red)]/[0.12]'
        }`}
      >
        <i className={`ph ${positive ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
        <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="heroDelta" /> · flujo
        neto de este mes
      </span>
    </div>
  );
}

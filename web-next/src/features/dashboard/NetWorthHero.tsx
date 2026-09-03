import { useState } from 'react';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface NetWorthHeroProps {
  totalLiquid: number;
  monthNet: number;
}

const HIDE_KEY = 'nuva:hideBalance';
const MASK = 'S/ ••••••';

// A propósito NO usa <Card>: es el único dato que manda antes que cualquier otro
// bloque de Inicio, así que rompe el molde de tarjeta-con-borde que comparte el
// resto de la página en vez de ser "una tarjeta más, pero grande". Exclusivo de
// mobile (DesktopHomePage no lo importa) — DesktopHomePage.tsx queda intacto.
export function NetWorthHero({ totalLiquid, monthNet }: NetWorthHeroProps) {
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const positive = monthNet >= 0;

  function toggleHidden() {
    setHidden((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(HIDE_KEY, next ? '1' : '0');
      } catch {
        // localStorage puede fallar en modo privado — no es crítico, solo no persiste
      }
      return next;
    });
  }

  return (
    <div className="px-0.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand)]" aria-hidden="true" />
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">Lo que tengo</p>
        </div>
        <button
          type="button"
          onClick={toggleHidden}
          aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
          aria-pressed={hidden}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-muted)]"
        >
          <i className={`ph ${hidden ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true" />
        </button>
      </div>
      <p className="num mt-1.5 break-words text-[clamp(2.25rem,11vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-[var(--text)] sm:text-6xl md:text-7xl">
        {hidden ? MASK : <AnimatedDigits value={formatMoney(totalLiquid)} animationKey="heroValue" />}
      </p>
      <span
        className={`num mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] px-3 py-1.5 text-[12.5px] font-bold ${
          positive ? 'text-[var(--green)] bg-[var(--green)]/[0.14]' : 'text-[var(--red)] bg-[var(--red)]/[0.12]'
        }`}
      >
        <i className={`ph ${positive ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
        {hidden ? '••••' : <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="heroDelta" />} · flujo
        neto de este mes
      </span>
    </div>
  );
}

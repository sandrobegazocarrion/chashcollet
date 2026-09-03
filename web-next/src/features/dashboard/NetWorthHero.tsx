import { useState } from 'react';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface NetWorthHeroProps {
  totalLiquid: number;
  monthNet: number;
}

const HIDE_KEY = 'nuva:hideBalance';
const MASK = 'S/ ••••••';

// Bloque morado sólido, fundido con <Topbar brand> de arriba (mismo -mx/-mt que
// cancela el padding de <main> para que no quede costura entre ambos) — el mismo
// tratamiento que el mockup, no "una tarjeta más" con borde como el resto de
// Inicio. Exclusivo de mobile/tablet (DesktopHomePage.tsx no lo importa, y su
// propio hero oscuro de escritorio queda intacto).
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
    <div className="-mx-4 -mt-4 rounded-b-[28px] bg-[var(--brand)] px-4 pb-6 pt-5 text-white sm:-mx-6 sm:-mt-6 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-white/70">Lo que tengo</p>
        <button
          type="button"
          onClick={toggleHidden}
          aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
          aria-pressed={hidden}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/15 hover:text-white"
        >
          <i className={`ph ${hidden ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true" />
        </button>
      </div>
      <p className="num mt-1.5 break-words text-[clamp(2.25rem,11vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-white sm:text-6xl md:text-7xl">
        {hidden ? MASK : <AnimatedDigits value={formatMoney(totalLiquid)} animationKey="heroValue" />}
      </p>
      <span className="num mt-3.5 inline-flex items-center gap-1.5 rounded-[var(--radius-pill)] bg-white/15 px-3 py-1.5 text-[12.5px] font-bold text-white">
        <i className={`ph ${positive ? 'ph-trend-up' : 'ph-trend-down'}`} aria-hidden="true" />
        {hidden ? '••••' : <AnimatedDigits value={(positive ? '+' : '') + formatMoney(monthNet)} animationKey="heroDelta" />} este mes
      </span>
    </div>
  );
}

import { useState } from 'react';
import { AnimatedDigits } from '../../components/ui/AnimatedDigits';
import { formatMoney } from '../../lib/finance';

interface NetWorthHeroProps {
  totalLiquid: number;
  monthNet: number;
}

const HIDE_KEY = 'nuva:hideBalance';
const MASK = '••••••';

// Fiel al boceto blanco de pen.dev: sin bloque de color, sin <Card> — "S/" chico +
// entero grande + centavos apagados a gris, ojo a la altura del número (no del
// label), delta en texto morado simple, sin píldora. Exclusivo de mobile/tablet
// (DesktopHomePage.tsx no lo importa, su propio hero oscuro queda intacto).
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

  const isNegative = totalLiquid < 0;
  const [wholePart, centsPart] = Math.abs(totalLiquid)
    .toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .split('.');

  return (
    <div className="pt-1">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-faint)]">Lo que tengo</p>
      <div className="mt-1.5 flex items-end gap-2">
        <p className="num min-w-0 break-words text-[var(--text)]">
          <span className="text-[clamp(1.1rem,4vw,1.5rem)] font-bold align-top text-[var(--text-muted)]">{isNegative ? '-S/' : 'S/'}</span>
          {hidden ? (
            <span className="text-[clamp(2.25rem,11vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.03em] sm:text-6xl">{MASK}</span>
          ) : (
            <>
              <span className="text-[clamp(2.25rem,11vw,3.5rem)] font-extrabold leading-[0.92] tracking-[-0.03em] sm:text-6xl">
                <AnimatedDigits value={wholePart} animationKey="heroValue" />
              </span>
              <span className="text-[clamp(1.5rem,6vw,2.25rem)] font-extrabold leading-[0.92] tracking-[-0.03em] text-[var(--border-flat)] sm:text-4xl">
                .{centsPart}
              </span>
            </>
          )}
        </p>
        <button
          type="button"
          onClick={toggleHidden}
          aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
          aria-pressed={hidden}
          className="mb-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--text-faint)] transition-colors hover:bg-[var(--surface-raised)] hover:text-[var(--text-muted)]"
        >
          <i className={`ph ${hidden ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true" />
        </button>
      </div>
      <p className="num mt-2 text-[13px] font-bold">
        <span className={positive ? 'text-[var(--brand)]' : 'text-[var(--red)]'}>
          {hidden ? '••••' : (positive ? '+' : '') + formatMoney(monthNet)}
        </span>
        <span className="ml-1 font-medium text-[var(--text-muted)]">este mes</span>
      </p>
    </div>
  );
}

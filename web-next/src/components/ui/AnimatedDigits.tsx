// Portado de digitSpans() en public/js/app.js: envuelve cada carácter en su propio
// span para que reproduzca el pop-in (t-digit-pop-in en index.css) al insertarse.
// `animationKey`, si se pasa, evita repetir la animación en cada refetch de 15s salvo
// que ESE valor haya cambiado — mismo objeto módulo-global que _kpiLastValues.
const lastValues: Record<string, string> = {};

interface AnimatedDigitsProps {
  value: string;
  animationKey?: string;
  className?: string;
}

export function AnimatedDigits({ value, animationKey, className = '' }: AnimatedDigitsProps) {
  const str = String(value);
  const changed = animationKey === undefined || lastValues[animationKey] !== str;
  if (animationKey !== undefined) lastValues[animationKey] = str;

  const chars = str.split('');
  const n = chars.length;

  return (
    // key=str: fuerza remount de los spans cuando el valor cambia, para que el
    // navegador vuelva a disparar la animación aunque el valor cambie en refetches
    // seguidos (el JS viejo lograba esto reemplazando el innerHTML por completo).
    <span key={str} className={`t-digit-group${changed ? ' is-animating' : ''} ${className}`}>
      {chars.map((ch, i) => {
        const stagger = i === n - 2 ? '1' : i === n - 1 ? '2' : undefined;
        return (
          <span key={i} className="t-digit" data-stagger={stagger}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}

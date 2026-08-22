import type { ButtonHTMLAttributes } from 'react';

interface GradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'ghost';
}

// El nombre quedó de una v1 con degradado naranja/rojo; se retiró para usar el color
// de marca sólido real de NUVA (--brand, ver public/css/styles.css .btn-primary) —
// se mantiene el nombre del componente para no romper ~15 imports por un cambio
// puramente cosmético de identificador.
export function GradientButton({
  loading = false,
  variant = 'primary',
  disabled,
  className = '',
  children,
  ...rest
}: GradientButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] px-[18px] py-2.5 font-semibold text-[13.5px] transition-all disabled:opacity-50 disabled:cursor-not-allowed';
  const styles =
    variant === 'primary'
      ? 'text-white bg-[var(--brand)] shadow-[0_10px_22px_-10px_var(--brand-glow)] hover:brightness-[1.08] hover:-translate-y-px active:scale-[.97]'
      : 'text-[var(--text)] bg-[var(--surface)] border border-[var(--border)] hover:bg-[var(--surface-raised)]';

  return (
    <button className={`${base} ${styles} ${className}`} disabled={disabled || loading} {...rest}>
      {loading && <i className="ph ph-circle-notch animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

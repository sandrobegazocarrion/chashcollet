import type { ButtonHTMLAttributes } from 'react';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string; // clase de Phosphor, ej. "ph-pencil-simple"
  variant?: 'default' | 'danger';
  label: string; // accesible, no visible
}

export function IconButton({ icon, variant = 'default', label, className = '', ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm transition-colors ${
        variant === 'danger'
          ? 'text-[var(--text-muted)] hover:bg-[var(--red)]/15 hover:text-[var(--red)]'
          : 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]'
      } ${className}`}
      {...rest}
    >
      <i className={`ph ${icon}`} aria-hidden="true" />
    </button>
  );
}

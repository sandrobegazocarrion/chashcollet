import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  /** Ícono a la izquierda dentro del campo (ej. <i className="ph ph-envelope" />). Opcional. */
  icon?: ReactNode;
  /** Elemento a la derecha dentro del campo (ej. check de validación, botón mostrar/ocultar). Opcional. */
  trailing?: ReactNode;
}

export function Input({ label, error, id, className = '', icon, trailing, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-[var(--text-muted)]">
        {label}
      </label>
      <div className="relative">
        {icon && <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-faint)]">{icon}</span>}
        <input
          id={inputId}
          className={`w-full rounded-[var(--radius-control)] border bg-[var(--surface)] py-2.5 text-[var(--text)] outline-none transition-shadow placeholder:text-[var(--text-faint)] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-glow)] ${
            icon ? 'pl-10' : 'px-3.5'
          } ${trailing ? 'pr-11' : icon ? 'pr-3.5' : ''} ${error ? 'border-[var(--red)]' : 'border-[var(--border)]'} ${className}`}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : undefined}
          {...rest}
        />
        {trailing && <span className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</span>}
      </div>
      {error && (
        <span id={`${inputId}-error`} className="text-sm text-[var(--red)]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

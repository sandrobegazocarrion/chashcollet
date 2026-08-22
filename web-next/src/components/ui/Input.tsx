import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
}

export function Input({ label, error, id, className = '', ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm text-[var(--text-muted)]">
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-[var(--radius-control)] border bg-[var(--surface)] px-3.5 py-2.5 text-[var(--text)] outline-none transition-shadow placeholder:text-[var(--text-faint)] focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-glow)] ${
          error ? 'border-[var(--red)]' : 'border-[var(--border)]'
        } ${className}`}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-error` : undefined}
        {...rest}
      />
      {error && (
        <span id={`${inputId}-error`} className="text-sm text-[var(--red)]" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

import { useId, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
}

export function Select({ label, id, className = '', children, ...rest }: SelectProps) {
  const autoId = useId();
  const selectId = id ?? autoId;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={selectId} className="text-sm text-[var(--text-muted)]">
        {label}
      </label>
      <select
        id={selectId}
        className={`rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-3.5 py-2.5 text-[var(--text)] outline-none transition-shadow focus:border-[var(--brand)] focus:shadow-[0_0_0_3px_var(--brand-glow)] ${className}`}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}

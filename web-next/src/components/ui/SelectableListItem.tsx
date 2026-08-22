import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface SelectableListItemProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
}

export function SelectableListItem({
  selected = false,
  icon,
  title,
  subtitle,
  trailing,
  className = '',
  ...rest
}: SelectableListItemProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-[var(--radius-control)] border px-3.5 py-3 text-left transition-colors ${
        selected
          ? 'border-[var(--brand)] bg-[var(--surface-raised)]'
          : 'border-transparent hover:bg-[var(--surface-raised)]'
      } ${className}`}
      {...rest}
    >
      {icon && (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text)]">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-[var(--text)]">{title}</span>
        {subtitle && <span className="block truncate text-xs text-[var(--text-muted)]">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0">{trailing}</span>}
    </button>
  );
}

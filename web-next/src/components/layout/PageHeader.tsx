import type { ReactNode } from 'react';
import { GradientButton } from '../ui/GradientButton';

interface PageHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children?: ReactNode; // extra a la derecha, ej. selector de cuenta
}

export function PageHeader({ title, actionLabel, onAction, children }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-lg font-semibold text-[var(--text)]">{title}</h1>
      <div className="flex items-center gap-2">
        {children}
        {actionLabel && onAction && (
          <GradientButton onClick={onAction}>
            <i className="ph ph-plus" aria-hidden="true" />
            {actionLabel}
          </GradientButton>
        )}
      </div>
    </div>
  );
}

import { Card } from './Card';

interface EmptyStateProps {
  icon: string;
  title: string;
  subtitle?: string;
  cta?: { label: string; onClick: () => void };
  /** Sin el <Card> envolvente — para cuando ya vive dentro de una tarjeta propia
      (ej. un gráfico del dashboard). */
  bare?: boolean;
  /** Menos padding vertical, para espacios más chicos. */
  compact?: boolean;
  className?: string;
}

// Único componente de "todavía no hay datos" para toda la app: ícono en una
// placa circular, título, subtítulo opcional, y un CTA opcional. Reemplaza las
// implementaciones ad hoc de Préstamos/Servicios (antes en features/deudas/
// shared.tsx), Metas y Pagos.
//
// Uso típico:
//   <EmptyState icon="ph-piggy-bank" title="No tienes metas de ahorro" subtitle="Crea una para empezar." cta={{ label: '+ Nueva meta', onClick: openCreate }} />
// Dentro de una tarjeta que ya es un <Card> (ej. un gráfico):
//   <EmptyState bare compact icon="ph-chart-line" title="Aún no hay datos para graficar" />
export function EmptyState({ icon, title, subtitle, cta, bare = false, compact = false, className = '' }: EmptyStateProps) {
  const content = (
    <div className={`flex flex-col items-center gap-2.5 text-center ${compact ? 'py-6' : 'py-12'} ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-faint)]">
        <i className={`ph ${icon} text-lg`} aria-hidden="true" />
      </span>
      <p className="font-semibold text-[var(--text)]">{title}</p>
      {subtitle && <p className="max-w-[280px] text-sm leading-relaxed text-[var(--text-muted)]">{subtitle}</p>}
      {cta && (
        <button type="button" onClick={cta.onClick} className="mt-1 text-[12.5px] font-bold text-[var(--brand)]">
          {cta.label}
        </button>
      )}
    </div>
  );
  return bare ? content : <Card>{content}</Card>;
}

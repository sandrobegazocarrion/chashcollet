interface ChartEmptyStateProps {
  icon: string;
  message: string;
  cta?: { label: string; onClick: () => void };
  compact?: boolean;
}

// Patrón único de "no hay datos suficientes" para las tarjetas de estadísticas/
// gráficos del dashboard (Ingresos vs. gastos, Gastos por categoría, Tasa de
// ahorro, Actividad reciente): ícono + mensaje corto + CTA opcional, en vez de
// dejar el área en blanco sin explicación.
export function ChartEmptyState({ icon, message, cta, compact }: ChartEmptyStateProps) {
  return (
    <div className={`flex flex-col items-center gap-2.5 text-center ${compact ? 'py-6' : 'py-14'}`}>
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text-faint)]">
        <i className={`ph ${icon} text-base`} aria-hidden="true" />
      </span>
      <p className="max-w-[220px] text-[13px] leading-relaxed text-[var(--text-faint)]">{message}</p>
      {cta && (
        <button type="button" onClick={cta.onClick} className="mt-1 text-[12.5px] font-bold text-[var(--text)]">
          {cta.label} <i className="ph ph-arrow-right" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

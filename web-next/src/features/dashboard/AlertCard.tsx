import { formatMoney } from '../../lib/finance';
import type { UpcomingItem } from '../../lib/finance';
import type { TabId } from '../../components/layout/Sidebar';

interface AlertCardProps {
  urgent: UpcomingItem | undefined;
  onGoTab: (tab: TabId) => void;
}

// Espeja la mini-tarjeta clara "Vence pronto" de #dashMiniRow en renderDashboard():
// es un <button> que navega a la pestaña del vencimiento, con el link "Ir al
// calendario →" (mismo texto fijo que el original, aunque a veces navegue a otra
// pestaña como Servicios — así es la app real).
export function AlertCard({ urgent, onGoTab }: AlertCardProps) {
  const text = !urgent
    ? 'No tienes pagos pendientes declarados por ahora.'
    : urgent.days < 0
      ? `${urgent.name} está vencido hace ${-urgent.days} día${-urgent.days === 1 ? '' : 's'} · ${formatMoney(urgent.amount)}.`
      : urgent.days === 0
        ? `${urgent.name} vence hoy · ${formatMoney(urgent.amount)}.`
        : `${urgent.name} vence en ${urgent.days} día${urgent.days === 1 ? '' : 's'} · ${formatMoney(urgent.amount)}.`;

  return (
    <button
      type="button"
      onClick={() => onGoTab(urgent?.tab || 'calendario')}
      className="flex w-full flex-col items-start rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface-raised)] p-[22px] text-left transition-transform hover:-translate-y-0.5"
    >
      <span className="mb-3 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] bg-[var(--surface)] text-[var(--text)] shadow-[0_4px_10px_rgba(10,10,10,.06)]">
        <i className="ph ph-calendar-blank text-sm" aria-hidden="true" />
      </span>
      <p className="text-sm font-bold text-[var(--text)]">{urgent ? 'Vence pronto' : 'Al día'}</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--text-muted)]">{text}</p>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--text)]">
        Ir al calendario <i className="ph ph-arrow-right" aria-hidden="true" />
      </span>
    </button>
  );
}

import { Mascot } from '../brand/Mascot';
import { BrandMark } from '../brand/BrandMark';
import { SAVINGS_TIPS, todaysTipIndex } from '../../lib/tips';
import { TABS, type TabId } from './Sidebar';

interface DesktopSidebarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  showAdmin: boolean;
}

// Sidebar de la fase "Metas y Mascota" (>=1024px, aprobado en
// https://claude.ai/code/artifact/5cddac23-367b-4855-9969-41dde7b6fc03): 210px,
// fondo blanco, nav con label + ícono, ítem activo con tinte violeta. Reusa TABS
// de Sidebar.tsx (misma fuente de verdad) para no perder ninguna sección existente
// — el artboard aprobado mostraba solo 6 ítems ilustrativos, pero el shell no debe
// romper acceso a Cuentas/Tarjetas/Servicios/Pagos/Admin que ya existen hoy.
export function DesktopSidebar({ active, onChange, showAdmin }: DesktopSidebarProps) {
  const tabs = showAdmin ? TABS : TABS.filter((t) => t.id !== 'admin');
  const tip = SAVINGS_TIPS[todaysTipIndex()].replace(/^\p{Emoji}\s*/u, '');

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[210px] shrink-0 flex-col border-r border-[var(--d2-border)] bg-white px-4 py-[26px] lg:flex" style={{ fontFamily: 'var(--font-ui-d2)' }}>
      <div className="flex items-center gap-2.5 px-2">
        <BrandMark className="h-[18px] w-[18px] text-[var(--d2-accent)]" />
        <span className="text-[17px] font-bold text-[var(--d2-ink)]">nuva</span>
      </div>

      <nav className="mt-8 flex flex-col gap-0.5">
        {tabs.map((tab) => {
          const isActive = tab.id === active;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-[11px] rounded-[13px] px-3 py-[11px] text-left text-[13.5px] transition-colors ${
                isActive ? 'bg-[var(--d2-accent-tint)] font-semibold text-[var(--d2-accent-dark)]' : 'font-medium text-[#43434C] hover:bg-[var(--d2-bg)]'
              }`}
            >
              <i className={`ph ${tab.icon} text-[17px] ${isActive ? 'text-[var(--d2-accent-dark)]' : 'text-[var(--d2-muted)]'}`} aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="mb-[-4px] ml-1.5 flex items-center gap-1">
        <Mascot pose="sidebar" />
      </div>
      <div className="mt-2 rounded-2xl bg-[var(--d2-bg)] p-3.5">
        <p className="text-[12.5px] font-bold text-[var(--d2-ink)]">Pequeños hábitos, grandes logros</p>
        <p className="mt-1 text-[11px] leading-[1.4] text-[var(--d2-muted)]">{tip}</p>
      </div>
    </aside>
  );
}

import { useEffect } from 'react';
import { BrandMark } from '../brand/BrandMark';
import { TABS, type TabId } from './Sidebar';

interface DesktopDrawerProps {
  open: boolean;
  onClose: () => void;
  active: TabId;
  onChange: (tab: TabId) => void;
  showAdmin: boolean;
  onQuickAdd: () => void;
}

// Fase 2 ("panel de widgets", >=1024px): la navegación deja de vivir en un riel
// fijo (Fase 1, ya descartada) y pasa a este drawer deslizante que abre el botón
// hamburguesa del header — misma fuente de pestañas (TABS) que ya usan el riel
// móvil/tablet y la Fase 1, así que ninguna sección deja de ser alcanzable. El
// botón "+" de acceso rápido al final replica el mismo control que ya existe en
// el riel de móvil/tablet, adaptado a la paleta clara del drawer.
export function DesktopDrawer({ open, onClose, active, onChange, showAdmin, onQuickAdd }: DesktopDrawerProps) {
  const tabs = showAdmin ? TABS : TABS.filter((t) => t.id !== 'admin');

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <div
      className={`fixed inset-0 z-40 hidden lg:block ${open ? '' : 'pointer-events-none'}`}
      aria-hidden={!open}
      style={{ fontFamily: 'var(--font-ui-d2)' }}
    >
      <div
        className={`absolute inset-0 bg-black/35 backdrop-blur-[2px] transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        role="presentation"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Menú de navegación"
        className={`absolute inset-y-0 left-0 flex w-[260px] flex-col gap-1 border-r border-[var(--d2-border)] bg-white p-4 shadow-[var(--d2-card-shadow)] transition-transform duration-250 ease-[cubic-bezier(.16,1,.3,1)] ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-2.5 px-2 pb-4 pt-1">
          <BrandMark className="h-[18px] w-[18px] text-[var(--d2-accent)]" />
          <span className="text-[17px] font-bold text-[var(--d2-ink)]">nuva</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  onChange(tab.id);
                  onClose();
                }}
                className={`flex items-center gap-[11px] rounded-[13px] px-3 py-[11px] text-left text-[13.5px] font-medium transition-colors ${
                  isActive ? 'bg-[var(--d2-accent-tint)] text-[var(--d2-accent-dark)]' : 'text-[var(--d2-muted-3)] hover:bg-[var(--d2-bg)]'
                }`}
              >
                <i className={`ph ${tab.icon} text-[16px]`} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        <button
          type="button"
          title="Nuevo movimiento"
          aria-label="Nuevo movimiento"
          onClick={() => {
            onQuickAdd();
            onClose();
          }}
          className="mx-auto mb-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--d2-accent)] text-lg text-white shadow-[0_12px_24px_-8px_rgba(101,94,255,0.45)] transition-transform hover:-translate-y-0.5 active:scale-95"
        >
          <i className="ph ph-plus" aria-hidden="true" />
        </button>
      </aside>
    </div>
  );
}

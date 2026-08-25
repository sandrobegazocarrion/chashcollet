import { BrandMark } from '../brand/BrandMark';

export type TabId =
  | 'panel'
  | 'cuentas'
  | 'tarjeta'
  | 'prestamos'
  | 'transacciones'
  | 'servicios'
  | 'chanchitos'
  | 'calendario'
  | 'admin'
  | 'configuracion';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

// Mismo orden y mismos íconos que public/index.html#sbNav: Inicio, Cuentas, Tarjetas
// de crédito, Préstamos, Historial, Servicios, Metas, Pagos, Admin — "Servicios" y
// "Préstamos" son pestañas separadas ahí (antes las tenía combinadas en una sola).
const TABS: TabDef[] = [
  { id: 'panel', label: 'Inicio', icon: 'ph-house' },
  { id: 'cuentas', label: 'Cuentas', icon: 'ph-bank' },
  { id: 'tarjeta', label: 'Tarjetas de crédito', icon: 'ph-credit-card' },
  { id: 'prestamos', label: 'Préstamos', icon: 'ph-handshake' },
  { id: 'transacciones', label: 'Historial', icon: 'ph-clock-counter-clockwise' },
  { id: 'servicios', label: 'Servicios', icon: 'ph-receipt' },
  { id: 'chanchitos', label: 'Metas', icon: 'ph-piggy-bank' },
  { id: 'calendario', label: 'Pagos', icon: 'ph-calendar-blank' },
  { id: 'admin', label: 'Admin', icon: 'ph-shield-check' },
];

// "Configuración" no tiene ícono en el riel de la app vieja — se entra a esa
// pestaña desde el popover del avatar, no desde acá, por eso queda fuera de TABS.
export const TAB_LABELS: Record<TabId, string> = {
  ...(Object.fromEntries(TABS.map((t) => [t.id, t.label])) as Record<TabId, string>),
  configuracion: 'Configuración',
};

interface SidebarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  showAdmin: boolean;
  open: boolean;
  onClose: () => void;
  onQuickAdd: () => void;
  online: boolean;
}

export function Sidebar({ active, onChange, showAdmin, open, onClose, onQuickAdd, online }: SidebarProps) {
  const tabs = showAdmin ? TABS : TABS.filter((t) => t.id !== 'admin');

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/45 backdrop-blur-sm md:hidden"
          onClick={onClose}
          role="presentation"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[88px] flex-shrink-0 flex-col items-center overflow-y-auto bg-[var(--sidebar-bg)] transition-transform duration-200 md:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex w-full items-center justify-center py-6">
          <BrandMark className="h-7 w-7 text-white" />
        </div>

        <nav className="flex w-full flex-col items-center gap-1.5 py-1.5">
          {tabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                title={tab.label}
                aria-label={tab.label}
                onClick={() => {
                  onChange(tab.id);
                  onClose();
                }}
                className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg transition-colors ${
                  isActive ? 'text-white' : 'text-[var(--sidebar-text)] hover:bg-white/[0.06] hover:text-white'
                }`}
              >
                {isActive && (
                  <>
                    <span
                      className="absolute inset-0 rounded-2xl p-[1.6px]"
                      style={{
                        background: 'var(--brand)',
                        WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
                        WebkitMaskComposite: 'xor',
                        maskComposite: 'exclude',
                      }}
                      aria-hidden="true"
                    />
                    <span className="absolute inset-0 rounded-2xl bg-[var(--sidebar-fill)]" aria-hidden="true" />
                  </>
                )}
                <i className={`ph ${tab.icon} relative z-[2]`} aria-hidden="true" />
              </button>
            );
          })}
        </nav>

        <div className="mt-auto flex w-full flex-col items-center gap-3.5 py-5">
          <button
            type="button"
            title="Añadir registro"
            aria-label="Añadir registro"
            onClick={onQuickAdd}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--brand)] text-lg text-white shadow-[0_12px_24px_-8px_var(--brand-glow)] transition-transform hover:-translate-y-0.5 active:scale-95"
          >
            <i className="ph ph-plus" aria-hidden="true" />
          </button>
          <span
            className={`h-1.5 w-1.5 rounded-full ${online ? 'bg-[var(--green)]' : 'bg-[var(--sidebar-text)]'}`}
            title={online ? 'En línea' : 'Sin conexión'}
            aria-hidden="true"
          />
        </div>
      </aside>
    </>
  );
}

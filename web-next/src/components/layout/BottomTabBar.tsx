import type { TabId } from './Sidebar';

interface BottomTab {
  id: TabId | 'more';
  label: string;
  icon: string;
}

// Las 5 secciones más usadas quedan fijas abajo; el resto (Préstamos, Servicios,
// Presupuestos, Pagos, Admin, Configuración) vive detrás de "Más", que abre el
// mismo riel/drawer que ya existe (Sidebar.tsx) — no se duplica esa lista.
const PRIMARY_TABS: BottomTab[] = [
  { id: 'panel', label: 'Inicio', icon: 'ph-house' },
  { id: 'cuentas', label: 'Cuentas', icon: 'ph-bank' },
  { id: 'tarjeta', label: 'Tarjetas', icon: 'ph-credit-card' },
  { id: 'transacciones', label: 'Historial', icon: 'ph-clock-counter-clockwise' },
  { id: 'chanchitos', label: 'Metas', icon: 'ph-piggy-bank' },
];

interface BottomTabBarProps {
  active: TabId;
  onChange: (tab: TabId) => void;
  onMore: () => void;
  moreActive: boolean;
}

// Nav nativa de mobile (< md): reemplaza el hamburger-y-riel como forma principal
// de moverse por la app — un riel de escritorio "achicado" nunca se siente como una
// app de verdad, una barra de pestañas fija abajo sí. El riel/drawer no desaparece:
// "Más" lo sigue abriendo para las secciones que no entran acá.
export function BottomTabBar({ active, onChange, onMore, moreActive }: BottomTabBarProps) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-[var(--border-flat)] bg-[var(--bg)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Navegación principal"
    >
      {PRIMARY_TABS.map((tab) => {
        const isActive = tab.id === active && !moreActive;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id as TabId)}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[var(--text-faint)]"
          >
            <i className={`ph ${isActive ? 'ph-fill' : ''} ${tab.icon} text-[22px] ${isActive ? 'text-[var(--brand)]' : ''}`} aria-hidden="true" />
            <span className={`truncate text-[10px] font-semibold ${isActive ? 'text-[var(--brand)]' : ''}`}>{tab.label}</span>
          </button>
        );
      })}
      <button
        type="button"
        onClick={onMore}
        aria-label="Más secciones"
        aria-current={moreActive ? 'page' : undefined}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[var(--text-faint)]"
      >
        <i className={`ph ${moreActive ? 'ph-fill' : ''} ph-squares-four text-[22px] ${moreActive ? 'text-[var(--brand)]' : ''}`} aria-hidden="true" />
        <span className={`truncate text-[10px] font-semibold ${moreActive ? 'text-[var(--brand)]' : ''}`}>Más</span>
      </button>
    </nav>
  );
}

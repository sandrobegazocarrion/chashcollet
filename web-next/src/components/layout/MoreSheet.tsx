import { Modal } from '../ui/Modal';
import { TABS, type TabId } from './Sidebar';

interface MoreSheetProps {
  open: boolean;
  onClose: () => void;
  active: TabId;
  onChange: (tab: TabId) => void;
  showAdmin: boolean;
  primaryIds: TabId[];
}

// Reemplaza el drawer lateral que "Más" abría antes en mobile — acá las secciones
// que no caben en <BottomTabBar> viven como una grilla dentro del mismo bottom
// sheet que ya usa el resto de la app (<Modal>), en vez de un riel de escritorio
// deslizando desde el costado.
export function MoreSheet({ open, onClose, active, onChange, showAdmin, primaryIds }: MoreSheetProps) {
  const items = TABS.filter((t) => !primaryIds.includes(t.id) && (t.id !== 'admin' || showAdmin));

  return (
    <Modal open={open} onClose={onClose} title="Más opciones">
      <div className="grid grid-cols-3 gap-3">
        {items.map((item) => {
          const isActive = item.id === active;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id);
                onClose();
              }}
              aria-current={isActive ? 'page' : undefined}
              className={`flex flex-col items-center gap-2 rounded-[var(--radius-card)] border py-4 text-center transition-colors active:scale-95 ${
                isActive
                  ? 'border-[var(--brand)] bg-[color-mix(in_srgb,var(--brand)_10%,transparent)]'
                  : 'border-[var(--border-flat)] bg-[var(--surface)] hover:bg-[var(--surface-raised)]'
              }`}
            >
              <span
                className={`flex h-11 w-11 items-center justify-center rounded-full text-xl ${
                  isActive ? 'bg-[var(--brand)] text-white' : 'bg-[var(--surface-raised)] text-[var(--text-muted)]'
                }`}
              >
                <i className={`ph ${item.icon}`} aria-hidden="true" />
              </span>
              <span className={`text-[12px] font-semibold leading-tight ${isActive ? 'text-[var(--brand)]' : 'text-[var(--text)]'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}

interface QuickAddFabProps {
  onClick: () => void;
}

// Ancla la acción más usada (nuevo movimiento) en la zona del pulgar en mobile,
// flotando arriba de <BottomTabBar> — en md+ el "+" de <Sidebar> ya cumple ese rol,
// por eso este botón solo existe por debajo de ese breakpoint.
export function QuickAddFab({ onClick }: QuickAddFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Nuevo movimiento"
      title="Nuevo movimiento"
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--brand)] text-2xl text-white shadow-[0_16px_32px_-10px_var(--brand-glow)] transition-transform duration-150 active:scale-90 md:hidden"
      style={{ bottom: 'calc(74px + env(safe-area-inset-bottom))' }}
    >
      <i className="ph ph-plus" aria-hidden="true" />
    </button>
  );
}

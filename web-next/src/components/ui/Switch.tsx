// Espeja .mini-switch en styles.css — reusado en Chanchitos (avisarme si me atraso)
// y ahora en Configuración (notificaciones de Telegram).
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative h-[19px] w-[34px] shrink-0 rounded-full transition-colors"
      style={{ background: checked ? 'var(--brand)' : 'var(--surface-raised)' }}
    >
      <span className="absolute top-0.5 h-[15px] w-[15px] rounded-full bg-white shadow transition-[left]" style={{ left: checked ? '17px' : '2px' }} />
    </button>
  );
}

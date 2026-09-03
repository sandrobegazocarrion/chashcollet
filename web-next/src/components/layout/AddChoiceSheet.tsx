import { Modal } from '../ui/Modal';

interface AddChoiceSheetProps {
  open: boolean;
  onClose: () => void;
  onChoose: (type: 'ingreso' | 'gasto') => void;
}

// El FAB y el "+" del riel antes saltaban directo al formulario de Gasto — ahora
// preguntan la intención primero, como cualquier app de pagos seria, en vez de
// obligar a quien va a registrar un ingreso a cambiar el toggle adentro del form.
// Solo Ingreso/Gasto: son los únicos tipos de movimiento que existen hoy en NUVA
// (Supabase, backend, tipos) — no se agregan opciones que no hacen nada todavía.
export function AddChoiceSheet({ open, onClose, onChoose }: AddChoiceSheetProps) {
  return (
    <Modal open={open} onClose={onClose} title="¿Qué quieres registrar?">
      <div className="flex flex-col gap-2.5">
        <button
          type="button"
          onClick={() => onChoose('ingreso')}
          className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--green)]/[0.14] text-xl text-[var(--green)]">
            <i className="ph ph-plus" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-[var(--text)]">Ingreso</span>
            <span className="block text-[12.5px] text-[var(--text-muted)]">Registra dinero que entra</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => onChoose('gasto')}
          className="flex items-center gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-flat)] bg-[var(--surface)] p-4 text-left transition-transform active:scale-[0.98]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--red)]/[0.12] text-xl text-[var(--red)]">
            <i className="ph ph-minus" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-[15px] font-bold text-[var(--text)]">Gasto</span>
            <span className="block text-[12.5px] text-[var(--text-muted)]">Registra dinero que sale</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'md' | 'lg'; // 'lg' para detalle a dos columnas (ej. AccountDetailModal)
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
};

const DISMISS_THRESHOLD = 110; // px arrastrados hacia abajo para cerrar la hoja en mobile

// En mobile sube como bottom sheet (con su propio manejo de drag-to-dismiss desde el
// handle); en md+ se queda como diálogo centrado — el mismo componente cambia de
// comportamiento según el contexto en vez de solo reescalar el mismo layout.
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const t = setTimeout(() => setMounted(false), 260);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!mounted) return null;

  function onHandlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (window.innerWidth >= 768) return;
    draggingRef.current = true;
    startYRef.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    setDragY(Math.max(0, e.clientY - startYRef.current));
  }
  function onHandlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    if (dragY > DISMISS_THRESHOLD) onClose();
    setDragY(0);
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-end justify-center bg-black/60 transition-opacity duration-300 motion-reduce:transition-none md:items-center md:p-4 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full ${SIZE_CLASSES[size]} max-h-[calc(100vh-2rem)] overflow-y-auto rounded-t-[28px] border border-[var(--border)] bg-[var(--surface)] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_-24px_rgba(6,11,31,0.35)] transition-transform duration-300 ease-out motion-reduce:transition-none md:rounded-[var(--radius-card)] md:pb-6 md:shadow-[0_24px_48px_-20px_rgba(10,10,10,.25)] ${
          visible ? 'translate-y-0' : 'translate-y-full md:translate-y-3'
        }`}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: 'none' } : undefined}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="-mt-1.5 mb-3 flex h-5 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing md:hidden"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
          aria-hidden="true"
        >
          <span className="h-1.5 w-10 rounded-full bg-[var(--border-flat)]" />
        </div>
        {title && <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

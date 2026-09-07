import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { animate, type AnimationPlaybackControls } from 'framer-motion';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: 'md' | 'lg' | 'xl'; // 'lg' detalle a dos columnas (AccountDetailModal); 'xl' contenido con su propio layout de escritorio (ej. TarjetaPage dentro de un modal)
}

const SIZE_CLASSES: Record<NonNullable<ModalProps['size']>, string> = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

const DISMISS_OFFSET = 110; // px arrastrados hacia abajo para cerrar la hoja en mobile
const DISMISS_VELOCITY = 700; // px/s — un flick rápido cierra aunque no haya llegado al offset

// En mobile sube como bottom sheet (con su propio manejo de drag-to-dismiss desde el
// handle); en md+ se queda como diálogo centrado — el mismo componente cambia de
// comportamiento según el contexto en vez de solo reescalar el mismo layout.
export function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [dragY, setDragY] = useState(0);
  const draggingRef = useRef(false);
  const startYRef = useRef(0);
  // Últimas muestras {t, y} del arrastre — hace falta la velocidad real al soltar
  // (no solo la posición) para decidir si cierra de un tirón y para que, si vuelve
  // a su lugar, el spring arranque con esa misma velocidad en vez de a 0 (si no,
  // frenaría en seco justo donde el dedo lo soltó, sin inercia).
  const samplesRef = useRef<{ t: number; y: number }[]>([]);
  const snapBackRef = useRef<AnimationPlaybackControls | null>(null);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    snapBackRef.current?.stop();
    setDragY(0);
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
    // Si agarra la hoja de nuevo mientras todavía vuelve a su lugar del gesto
    // anterior, ese spring viejo tiene que parar ya — si no, sigue empujando
    // dragY por su cuenta y compite con el arrastre nuevo.
    snapBackRef.current?.stop();
    draggingRef.current = true;
    startYRef.current = e.clientY - dragY; // resta el offset donde ya estaba, no desde 0
    samplesRef.current = [{ t: performance.now(), y: dragY }];
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onHandlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    const y = Math.max(0, e.clientY - startYRef.current);
    setDragY(y);
    const now = performance.now();
    samplesRef.current.push({ t: now, y });
    // Solo importa el tramo reciente del gesto — una muestra vieja de hace medio
    // segundo (ej. el dedo se quedó quieto un rato) arruinaría la velocidad real.
    samplesRef.current = samplesRef.current.filter((s) => now - s.t < 100);
  }
  function onHandlePointerUp() {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const first = samplesRef.current[0];
    const last = samplesRef.current[samplesRef.current.length - 1];
    const dt = last && first ? (last.t - first.t) / 1000 : 0;
    const velocity = dt > 0 ? (last.y - first.y) / dt : 0; // px/s, positivo = bajando
    if (dragY > DISMISS_OFFSET || velocity > DISMISS_VELOCITY) {
      onClose();
      return;
    }
    // No llegó a cerrar: vuelve a su lugar con la misma velocidad que traía el
    // gesto, no una transición de duración fija que ignora cómo se soltó — un
    // arrastre que frenaba antes de soltar vuelve suave; uno que aceleraba
    // hacia arriba vuelve con ese mismo impulso.
    snapBackRef.current = animate(dragY, 0, { type: 'spring', velocity, bounce: 0, duration: 0.32, onUpdate: setDragY });
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

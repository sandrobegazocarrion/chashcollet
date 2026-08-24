// Mascota de marca "Metas y Mascota" (fase desktop) — 100% CSS, portada 1:1 del
// artboard aprobado (Main.dc.html): blob con radio asimétrico, ojos, brazos en
// ángulo. Dos poses: "sidebar" (mini, con base violeta) y "banner" (más grande,
// con destello). Sin imágenes/SVG externos a propósito — es una pieza de marca,
// no iconografía genérica.
export function Mascot({ pose = 'sidebar', className = '' }: { pose?: 'sidebar' | 'banner'; className?: string }) {
  const size = pose === 'sidebar' ? { w: 44, h: 48 } : { w: 66, h: 72 };
  const eye = pose === 'sidebar' ? { size: 4, top: 18, side: 13 } : { size: 5, top: 24, side: 17 };
  const arm = pose === 'sidebar' ? { w: 12, h: 7, bottom: 1 } : { w: 16, h: 9, bottom: 2 };

  return (
    <div
      className={`relative shrink-0 rounded-[50%_50%_46%_46%/58%_58%_42%_42%] border-2 bg-white ${className}`}
      style={{ width: size.w, height: size.h, borderColor: '#ECE9FF', boxShadow: '0 6px 14px -6px rgba(101,94,255,0.35)' }}
      aria-hidden="true"
    >
      <span className="absolute rounded-full bg-[#22212B]" style={{ width: eye.size, height: eye.size, top: eye.top, left: eye.side }} />
      <span className="absolute rounded-full bg-[#22212B]" style={{ width: eye.size, height: eye.size, top: eye.top, right: eye.side }} />
      <span
        className="absolute rounded-b-[10px] border-2 bg-white"
        style={{ width: arm.w, height: arm.h, bottom: arm.bottom, left: -6, borderColor: '#ECE9FF', transform: 'rotate(18deg)' }}
      />
      <span
        className="absolute rounded-b-[10px] border-2 bg-white"
        style={{ width: arm.w, height: arm.h, bottom: arm.bottom, right: -6, borderColor: '#ECE9FF', transform: 'rotate(-18deg)' }}
      />
      {pose === 'sidebar' ? (
        <span className="absolute bottom-[-2px] left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-[var(--d2-accent)]" />
      ) : (
        <span className="absolute -right-1 -top-3.5 h-4 w-4 rotate-45 rounded bg-[var(--d2-green)]" />
      )}
    </div>
  );
}

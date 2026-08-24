// Esfera "glossy" translúcida — 100% CSS (radial-gradients en capas + blur), sin
// imágenes ni renders externos. Referencia de pulido visual que pidió el usuario
// (área de diseño): decoración de fondo tipo vidrio/3D violeta-a-negro, usada
// como textura sutil detrás de las tarjetas premium del Panel — nunca como
// contenido, siempre `aria-hidden`.
export function GlossyOrb({ size = 200, className = '' }: { size?: number; className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: 'radial-gradient(circle at 32% 28%, #C7BEFF 0%, #8A7FF8 28%, #4A3FCC 58%, #1C1640 100%)',
        boxShadow: 'inset -14px -18px 34px rgba(0,0,0,0.45), inset 10px 10px 22px rgba(255,255,255,0.16)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '10%',
          left: '16%',
          width: '40%',
          height: '32%',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(255,255,255,0.6), transparent 72%)',
          filter: 'blur(1px)',
        }}
      />
    </div>
  );
}

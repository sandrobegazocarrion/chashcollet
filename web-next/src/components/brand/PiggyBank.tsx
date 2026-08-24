// Chanchito de ahorro — 100% CSS, portado 1:1 del artboard aprobado: cuerpo con
// degradado violeta y radio asimétrico orgánico, oreja, ranura de monedas, patitas,
// 2 destellos de 4 puntas. Pieza de marca de la hero card del Panel (desktop).
export function PiggyBank({ className = '' }: { className?: string }) {
  return (
    <div className={`relative h-[140px] w-[150px] shrink-0 ${className}`} aria-hidden="true">
      <span className="sparkle absolute left-1.5 top-0.5 h-2 w-2" />
      <span className="sparkle absolute right-0 top-5 h-1.5 w-1.5" />
      <span
        className="absolute flex items-center justify-center rounded-full border-2 bg-[#FBF9FF]"
        style={{ top: 12, left: 52, width: 34, height: 34, borderColor: '#E4E0FF' }}
      >
        <span className="h-0.5 w-3.5 rounded-sm bg-[#C9C2FF]" />
      </span>
      <span
        className="absolute rounded-[52%_52%_46%_46%/62%_62%_40%_40%]"
        style={{ bottom: 14, left: 10, width: 130, height: 96, background: 'linear-gradient(160deg,#9A90FF,#655EFF)' }}
      />
      <span className="absolute rounded-full bg-[#8078F5]" style={{ bottom: 44, left: 8, width: 26, height: 24 }} />
      <span className="absolute rotate-45 rounded-[3px] bg-[#8078F5]" style={{ bottom: 64, left: 16, width: 11, height: 11 }} />
      <span className="absolute rounded-sm bg-[#FBF9FF] opacity-85" style={{ bottom: 78, left: 46, width: 46, height: 5 }} />
      <span className="absolute rounded bg-[#5B53E8]" style={{ bottom: 14, left: 26, width: 10, height: 16 }} />
      <span className="absolute rounded bg-[#5B53E8]" style={{ bottom: 14, left: 104, width: 10, height: 16 }} />
    </div>
  );
}

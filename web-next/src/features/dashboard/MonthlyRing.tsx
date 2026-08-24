import { formatMoney } from '../../lib/finance';
import { GlossyOrb } from '../../components/brand/GlossyOrb';

// "Así vas este mes" — anillo de progreso hacia la meta de ahorro mensual, en
// tarjeta oscura premium con una esfera "glossy" detrás (pulido visual pedido
// por el usuario, referencia de diseño). 3 segmentos continuos: el arco
// recorrido hasta hoy (verde = parte que vino de ahorro real sobre tus
// ingresos, violeta = parte que se fue en gastos sobre esos mismos ingresos) y
// el resto en gris hasta completar el círculo = lo que falta para llegar a la
// meta. Sin meta definida no se inventa el %: estado vacío con CTA.
export function MonthlyRing({
  ingresos,
  gastos,
  ahorro,
  meta,
  onSetGoal,
}: {
  ingresos: number;
  gastos: number;
  ahorro: number;
  meta: number | null;
  onSetGoal: () => void;
}) {
  if (!meta || meta <= 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2.5 py-4 text-center">
        <p className="w-full text-center text-[12.5px] font-bold text-white">Así vas este mes</p>
        <i className="ph ph-target mt-2 text-2xl text-white/50" aria-hidden="true" />
        <p className="max-w-[170px] text-[11.5px] leading-relaxed text-white/50">Define tu meta de ahorro mensual para ver tu progreso acá.</p>
        <button type="button" onClick={onSetGoal} className="mt-1 rounded-full bg-[var(--d2-accent)] px-4 py-2 text-[11px] font-semibold text-white">
          Definir meta
        </button>
      </div>
    );
  }

  const R = 40;
  const C = 2 * Math.PI * R;
  const filled = Math.max(0, Math.min(1, ahorro / meta));
  const greenShare = ingresos > 0 ? Math.max(0, Math.min(1, ahorro / ingresos)) : 0.5;
  const greenLen = filled * greenShare * C;
  const violetLen = filled * (1 - greenShare) * C;
  const grayLen = Math.max(0, C - greenLen - violetLen);
  // Si el mes va en rojo (gastaste más de lo que ganaste), el % de la meta no
  // tiene un valor negativo sensato que mostrar — se ancla en 0%, igual que el
  // anillo (que ya queda vacío por el clamp de `filled`).
  const pct = Math.max(0, Math.round((ahorro / meta) * 100));

  return (
    <div className="relative flex h-full flex-col items-center gap-2.5 overflow-hidden">
      <GlossyOrb size={190} className="absolute -right-14 -top-14 opacity-90" />

      <p className="relative z-[1] w-full text-center text-[12.5px] font-bold text-white">Así vas este mes</p>

      <div className="relative z-[1] mt-1 h-[132px] w-[132px] shrink-0">
        <svg width="132" height="132" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="#A9C23F" strokeWidth="11" strokeDasharray={`${greenLen} ${C - greenLen}`} strokeDashoffset={0} transform="rotate(-90 50 50)" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="var(--d2-accent)"
            strokeWidth="11"
            strokeDasharray={`${violetLen} ${C - violetLen}`}
            strokeDashoffset={-greenLen}
            transform="rotate(-90 50 50)"
          />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="11"
            strokeDasharray={`${grayLen} ${C - grayLen}`}
            strokeDashoffset={-(greenLen + violetLen)}
            transform="rotate(-90 50 50)"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="num text-[19px] font-semibold leading-none text-white">{formatMoney(ahorro)}</p>
          <p className="num mt-1 text-[10px] text-white/50">de {formatMoney(meta)}</p>
        </div>
      </div>

      <div className="relative z-[1] mt-0.5 flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--d2-accent)]" />
        <span className="num text-[11px] font-semibold text-white">{pct}% de tu meta</span>
      </div>

      <div className="relative z-[1] mt-1.5 flex w-full flex-col gap-1.5">
        {[
          { label: 'Ingresos', value: ingresos, dot: '#A9C23F' },
          { label: 'Gastos', value: gastos, dot: 'var(--d2-accent)' },
          { label: 'Ahorros', value: ahorro, dot: '#FFFFFF' },
        ].map((row) => (
          <div key={row.label} className="flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: row.dot }} />
              <span className="text-[10.5px] text-white/55">{row.label}</span>
            </span>
            <span className="num text-[10.5px] font-semibold text-white">{formatMoney(row.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

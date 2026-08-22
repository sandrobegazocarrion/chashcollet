interface CardCycleTrackProps {
  closingDays: number | null; // días para el corte
  billingDays: number | null; // días para el pago
  zoneColorVar: string; // color de zona actual (var(--...))
}

const MAX_DAYS = 30;

function posFor(days: number | null, floor = 0): number {
  if (days === null) return 100;
  return Math.max(floor, Math.min(98, (Math.max(0, days) / MAX_DAYS) * 100));
}

function daysLabel(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'hoy';
  return `en ${days}d`;
}

// La barra colgaba el texto ("Corte · Nd" / "Pago · Nd") directamente de la posición
// porcentual del pin — con fechas de corte y pago cercanas entre sí (días 11 y 13,
// por ejemplo) los dos textos caían prácticamente en el mismo punto y se superponían
// sin importar cuánto margen mínimo se forzara entre los pines, porque el ancho real
// del texto en píxeles no tiene relación con el % de la barra.
//
// Arreglo estructural (no un parche de "más espacio"): la barra deja de cargar texto
// — solo muestra los 3 puntos en su posición real — y el texto vive aparte, en una
// fila con flexbox de 3 columnas fijas debajo. Como el texto ya no depende de la
// posición porcentual, es imposible que se superponga sin importar qué tan cerca
// caigan el corte y el pago.
export function CardCycleTrack({ closingDays, billingDays, zoneColorVar }: CardCycleTrackProps) {
  if (closingDays === null && billingDays === null) {
    return <p className="text-xs text-[var(--text-muted)]">Sin fechas de corte ni de pago configuradas.</p>;
  }

  const posCorte = posFor(closingDays, 4);
  const posPago = Math.max(posCorte + 4, posFor(billingDays, 4));
  const graceWidth = Math.max(0, posPago - posCorte);

  return (
    <div className="mt-3">
      {/* Barra: solo posiciones (puntos), nunca texto */}
      <div className="relative mx-1.5 h-4">
        <div className="absolute inset-x-0 top-1/2 h-[6px] -translate-y-1/2 rounded-[var(--radius-pill)] bg-[var(--surface-raised)]" />
        <div
          className="absolute top-1/2 h-[6px] -translate-y-1/2 rounded-l-[var(--radius-pill)]"
          style={{ width: `${posCorte}%`, background: zoneColorVar }}
        />
        <div className="absolute top-1/2 h-[6px] -translate-y-1/2 bg-[var(--border)]" style={{ left: `${posCorte}%`, width: `${graceWidth}%` }} />

        <div
          className="absolute left-0 top-1/2 h-[13px] w-[13px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--surface)] bg-[var(--text)] shadow-[0_0_0_1px_rgba(10,10,10,.15)]"
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 h-[17px] w-[17px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] bg-[var(--surface)] shadow-[0_2px_6px_rgba(0,0,0,.14)]"
          style={{ left: `${posCorte}%`, borderColor: zoneColorVar }}
          aria-hidden="true"
        />
        <div
          className="absolute top-1/2 h-[17px] w-[17px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-[var(--text)] bg-[var(--surface)] shadow-[0_2px_6px_rgba(0,0,0,.14)]"
          style={{ left: `${posPago}%` }}
          aria-hidden="true"
        />
      </div>

      {/* Texto: fila de 3 columnas fijas, independiente de la barra — nunca choca */}
      <div className="mt-3 flex items-start justify-between gap-2">
        <div className="flex flex-1 flex-col items-start gap-0.5">
          <span className="text-[11px] font-bold text-[var(--text)]">Hoy</span>
        </div>
        <div className="flex flex-1 flex-col items-center gap-0.5 text-center">
          <span className="text-[11px] font-bold" style={{ color: zoneColorVar }}>
            Corte
          </span>
          <span className="text-[10.5px] text-[var(--text-muted)]">{daysLabel(closingDays)}</span>
        </div>
        <div className="flex flex-1 flex-col items-end gap-0.5 text-right">
          <span className="text-[11px] font-bold text-[var(--text)]">Pago</span>
          <span className="text-[10.5px] text-[var(--text-muted)]">{daysLabel(billingDays)}</span>
        </div>
      </div>
    </div>
  );
}

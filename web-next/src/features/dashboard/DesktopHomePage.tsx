import { computeTotals, formatDate, formatMoney } from '../../lib/finance';
import { computeLineChartBuckets } from '../../lib/lineChartBuckets';
import { PiggyBank } from '../../components/brand/PiggyBank';
import { Mascot } from '../../components/brand/Mascot';
import type { AppState } from '../../lib/types';
import type { TabId } from '../../components/layout/Sidebar';

// Fase "Metas y Mascota" (desktop, >=1024px) — reconstrucción 1:1 del artboard
// aprobado: https://claude.ai/code/artifact/5cddac23-367b-4855-9969-41dde7b6fc03
// (Main.dc.html). Datos reales de `data` en todo — nada inventado; donde el
// artboard mostraba algo sin equivalente real (4 metas de ejemplo) se usa el
// estado vacío real de la cuenta en vez de placeholders.
export function DesktopHomePage({ data, onGoTab }: { data: AppState; onGoTab: (tab: TabId) => void }) {
  const totals = computeTotals(data);
  const now = new Date();
  const monthKey = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  let monthIn = 0;
  let monthOut = 0;
  data.transactions.forEach((tx) => {
    if (!tx.date || tx.date.slice(0, 7) !== monthKey) return;
    if (tx.type === 'ingreso') monthIn += tx.amount;
    else monthOut += tx.amount;
  });
  const monthNet = monthIn - monthOut;

  const { ingresos, gastos } = computeLineChartBuckets(data, 'month');
  const netSeries = ingresos.map((v, i) => v - gastos[i]);
  const trendPath = buildSmoothPath(netSeries);

  const goals = data.pockets;
  const recent = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 4);

  return (
    <div className="flex flex-col gap-4" style={{ fontFamily: 'var(--font-ui-d2)' }}>
      {/* ROW 1 */}
      <div className="flex gap-4">
        <div
          className="relative flex flex-[1.5] items-center justify-between overflow-hidden rounded-[26px] border p-7"
          style={{ background: 'linear-gradient(135deg,#F0EEFF 0%,#F7F6FF 100%)', borderColor: '#ECE8FF', boxShadow: 'var(--d2-card-shadow)' }}
        >
          <div className="relative z-[1] max-w-[290px]">
            <p className="text-[21px] font-extrabold leading-[1.25] text-[var(--d2-ink)]">Tu ahorro de hoy, tus sueños de mañana</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-[#6B6A78]">Organiza, controla y haz crecer tu dinero. ¡Tú puedes!</p>
            <button
              type="button"
              onClick={() => onGoTab('chanchitos')}
              className="mt-4 flex items-center gap-1.5 rounded-full bg-[var(--d2-ink)] px-5 py-[11px] text-[12.5px] font-semibold text-white"
            >
              Ver mis metas
              <i className="ph ph-arrow-right text-[13px]" aria-hidden="true" />
            </button>
          </div>
          <PiggyBank />
        </div>

        <div className="flex flex-1 flex-col rounded-[26px] border border-[var(--d2-border)] bg-white p-6" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[12.5px] font-medium text-[var(--d2-muted)]">Total en tu cuenta</p>
            <i className="ph ph-eye text-[15px] text-[#B4B2BA]" aria-hidden="true" />
          </div>
          <p className="num mt-1.5 text-[27px] font-semibold text-[var(--d2-ink)]">{formatMoney(totals.totalLiquid)}</p>
          <p className={`num mt-1 text-xs font-semibold ${monthNet >= 0 ? 'text-[var(--d2-green)]' : 'text-[var(--d2-red)]'}`}>
            <i className={`ph ${monthNet >= 0 ? 'ph-arrow-up' : 'ph-arrow-down'}`} aria-hidden="true" /> {monthNet >= 0 ? '+' : ''}
            {formatMoney(monthNet)} este mes
          </p>

          <svg width="100%" height="46" viewBox="0 0 220 46" className="mt-3" aria-hidden="true">
            <path d={trendPath} fill="none" stroke="var(--d2-accent)" strokeWidth="2.4" strokeLinecap="round" />
          </svg>

          {/* No estaba en el artboard aprobado, pero el checklist de QA pide que "tasa
              de ahorro" siga funcionando igual — se agrega como línea compacta acá en
              vez de inventarle una tarjeta propia que la maqueta no tiene. */}
          <p className="mt-2 text-[11px] text-[var(--d2-muted)]">
            Tasa de ahorro: <span className="num font-semibold text-[var(--d2-ink)]">{monthIn > 0 ? `${Math.round((monthNet / monthIn) * 100)}%` : '—'}</span>
          </p>

          <div className="mt-4 flex gap-2">
            {[
              { icon: 'ph-arrow-down', label: 'Ingresar' },
              { icon: 'ph-arrow-right', label: 'Transferir' },
              { icon: 'ph-vault', label: 'Guardar' },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => onGoTab(a.label === 'Guardar' ? 'chanchitos' : 'transacciones')}
                className="flex flex-1 flex-col items-center gap-1.5 rounded-[13px] bg-[#F7F7F9] px-1 py-2.5"
              >
                <i className={`ph ${a.icon} text-[15px] text-[var(--d2-ink)]`} aria-hidden="true" />
                <span className="text-[10.5px] font-medium text-[var(--d2-muted-2)]">{a.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ROW 2 */}
      <div className="flex flex-1 gap-4">
        <div className="flex flex-[1.3] flex-col rounded-[26px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] font-bold text-[var(--d2-ink)]">Tus metas</p>
            <button type="button" onClick={() => onGoTab('chanchitos')} className="text-[11.5px] font-semibold text-[var(--d2-accent)]">
              Ver todas →
            </button>
          </div>

          {goals.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2.5 py-6 text-center">
              <Mascot pose="sidebar" />
              <p className="text-[12.5px] font-semibold text-[var(--d2-ink)]">Aún no tienes metas activas</p>
              <p className="max-w-[220px] text-[11.5px] leading-relaxed text-[var(--d2-muted)]">Crea tu primera meta y empieza a ver tu progreso acá.</p>
              <button type="button" onClick={() => onGoTab('chanchitos')} className="mt-1 rounded-full bg-[var(--d2-ink)] px-4 py-2 text-[11.5px] font-semibold text-white">
                Crear mi primera meta
              </button>
            </div>
          ) : (
            <div className="mt-3.5 grid grid-cols-2 gap-3">
              {goals.slice(0, 4).map((g, i) => {
                const tone = GOAL_TONES[i % GOAL_TONES.length];
                const pct = g.target && g.target > 0 ? Math.max(0, Math.min(100, (g.balance / g.target) * 100)) : 0;
                return (
                  <div key={g.id} className="flex flex-col gap-2 rounded-2xl border border-[var(--d2-border)] p-3.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ background: tone.bg }}>
                      <i className={`ph ${goalIcon(g.name)} text-[15px]`} style={{ color: tone.fg }} aria-hidden="true" />
                    </span>
                    <p className="truncate text-[12.5px] font-semibold text-[var(--d2-ink)]">{g.name}</p>
                    <p className="num text-[11px] text-[var(--d2-muted)]">
                      {formatMoney(g.balance)} / {g.target ? formatMoney(g.target) : '—'}
                    </p>
                    <div className="h-1.5 rounded-full bg-[#F0EFF3]">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: tone.fg }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex flex-1 flex-col rounded-[26px] border border-[var(--d2-border)] bg-white p-[22px]" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <div className="flex items-center justify-between">
            <p className="text-[13.5px] font-bold text-[var(--d2-ink)]">Últimos movimientos</p>
            <button type="button" onClick={() => onGoTab('transacciones')} className="text-[11.5px] font-semibold text-[var(--d2-accent)]">
              Ver todos →
            </button>
          </div>
          <div className="mt-2 flex flex-col">
            {recent.length === 0 ? (
              <p className="py-8 text-center text-[12.5px] text-[var(--d2-muted)]">Todavía no hay movimientos.</p>
            ) : (
              recent.map((tx, i) => {
                const isIncome = tx.type === 'ingreso';
                const initial = (tx.description || tx.category || '?').charAt(0).toUpperCase();
                return (
                  <div key={tx.id} className={`flex items-center justify-between py-2.5 ${i < recent.length - 1 ? 'border-b border-[#F3F2F5]' : ''}`}>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold"
                        style={isIncome ? { background: 'var(--d2-accent-tint)', color: 'var(--d2-accent-dark)' } : { background: '#F0F0F3', color: '#6B6B76' }}
                      >
                        {initial}
                      </span>
                      <div>
                        <p className="text-[12.5px] font-medium text-[var(--d2-ink)]">{tx.description || tx.category}</p>
                        <p className="text-[10.5px] text-[#B4B2BA]">
                          {tx.category} · {formatDate(tx.date)}
                        </p>
                      </div>
                    </div>
                    <span className={`num text-[12.5px] font-semibold ${isIncome ? 'text-[var(--d2-green)]' : 'text-[var(--d2-red)]'}`}>
                      {isIncome ? '+' : '-'}
                      {formatMoney(tx.amount)}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ROW 3 */}
      <div className="flex gap-4">
        <div className="flex-1 rounded-[26px] border border-[var(--d2-border)] bg-white p-5" style={{ boxShadow: 'var(--d2-card-shadow)' }}>
          <p className="text-[13px] font-bold text-[var(--d2-ink)]">Accesos rápidos</p>
          <div className="mt-3 flex gap-2.5">
            {[
              { icon: 'ph-target', label: 'Mis metas', tab: 'chanchitos' as TabId },
              { icon: 'ph-squares-four', label: 'Categorías', tab: 'transacciones' as TabId },
              { icon: 'ph-chart-bar', label: 'Reportes', tab: 'calendario' as TabId },
              { icon: 'ph-gear-six', label: 'Ajustes', tab: 'configuracion' as TabId },
            ].map((a) => (
              <button key={a.label} type="button" onClick={() => onGoTab(a.tab)} className="flex flex-1 flex-col items-center gap-1.5 rounded-[13px] bg-[#F7F7F9] px-1 py-3">
                <i className={`ph ${a.icon} text-base text-[var(--d2-ink)]`} aria-hidden="true" />
                <span className="text-[10px] font-medium text-[var(--d2-muted-2)]">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {goals.length === 0 && (
          <div
            className="relative flex flex-1 items-center justify-between overflow-hidden rounded-[26px] border p-[22px]"
            style={{ background: '#EAF6EF', borderColor: '#DFF0E6', boxShadow: 'var(--d2-card-shadow)' }}
          >
            <div className="relative z-[1] max-w-[200px]">
              <p className="text-[15px] font-extrabold text-[var(--d2-ink)]">Ahorra hoy, disfruta mañana</p>
              <p className="mt-1 text-[11.5px] text-[#5C6B62]">Cada sol cuenta. ¡Tú puedes!</p>
              <button
                type="button"
                onClick={() => onGoTab('chanchitos')}
                className="mt-3 flex items-center gap-1 rounded-full bg-[var(--d2-ink)] px-4 py-2 text-[11.5px] font-semibold text-white"
              >
                Crear nueva meta
                <i className="ph ph-arrow-right text-xs" aria-hidden="true" />
              </button>
            </div>
            <Mascot pose="banner" />
          </div>
        )}
      </div>
    </div>
  );
}

const GOAL_TONES = [
  { bg: '#E4F4EC', fg: 'var(--d2-green)' },
  { bg: '#E6EEFB', fg: 'var(--d2-blue)' },
  { bg: '#FBEDE0', fg: 'var(--d2-orange)' },
  { bg: '#E4F4EC', fg: 'var(--d2-green)' },
];

function goalIcon(name: string): string {
  const n = name.toLowerCase();
  if (/(viaje|playa|vacacion)/.test(n)) return 'ph-airplane-tilt';
  if (/(laptop|compu|tech|celular|equipo)/.test(n)) return 'ph-laptop';
  if (/(emergencia|fondo)/.test(n)) return 'ph-shield-check';
  if (/(ropa|accesorio)/.test(n)) return 'ph-t-shirt';
  return 'ph-flag-banner';
}

// Curva suave tipo Catmull-Rom -> Bezier a través de los puntos de la serie, en el
// mismo viewBox (220x46) del artboard aprobado. Sin ejes/grid a propósito.
function buildSmoothPath(values: number[]): string {
  if (values.length === 0) return '';
  const W = 220;
  const H = 46;
  const PAD_Y = 6;
  if (values.length === 1) return `M0,${H / 2} L${W},${H / 2}`;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - PAD_Y - ((v - min) / range) * (H - PAD_Y * 2);
    return [x, y] as const;
  });
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const midX = (x0 + x1) / 2;
    d += ` C${midX.toFixed(1)},${y0.toFixed(1)} ${midX.toFixed(1)},${y1.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  return d;
}

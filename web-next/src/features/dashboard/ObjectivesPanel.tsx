import { formatMoney } from '../../lib/finance';
import type { Pocket } from '../../lib/types';

// Espeja .obj-panel (columna izquierda fija del dashboard, oculta bajo 1100px en el
// original — acá se apila arriba en mobile en vez de desaparecer, para no perder la
// única vía de acceso a las metas antes de que el usuario abra "Metas").
export function ObjectivesPanel({ pockets, onNewGoal, onOpenGoal }: { pockets: Pocket[]; onNewGoal: () => void; onOpenGoal: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-5 flex items-center">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text)]">
          <i className="ph ph-target text-base" aria-hidden="true" /> Objetivos
        </span>
      </div>

      {pockets.length === 0 ? (
        <p className="py-4 text-sm leading-relaxed text-[var(--text-muted)]">Crea tu primera meta de ahorro para verla aquí.</p>
      ) : (
        <div className="flex flex-col">
          {pockets.map((p) => {
            const pct = p.target && p.target > 0 ? Math.max(0, Math.min(100, (p.balance / p.target) * 100)) : 0;
            return (
              <button
                key={p.id}
                type="button"
                onClick={onOpenGoal}
                className="flex flex-col gap-1.5 border-b border-[var(--border)] py-4 text-left last:border-b-0"
              >
                <span className="text-[13.5px] font-bold text-[var(--text)]">{p.name}</span>
                <span className="num text-xl font-extrabold tracking-tight text-[var(--text)]">{pct.toFixed(2)}%</span>
                <span className="num text-[11.5px] font-semibold text-[var(--text-muted)]">
                  {formatMoney(p.balance)} / {p.target ? formatMoney(p.target) : '—'}
                </span>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)]">
                  <div className="h-full rounded-[var(--radius-pill)] bg-[var(--green)]" style={{ width: `${pct}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={onNewGoal}
        className="mt-auto flex w-full items-center justify-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] py-2 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface-raised)]"
      >
        <i className="ph ph-plus" aria-hidden="true" /> Nueva meta
      </button>
    </div>
  );
}

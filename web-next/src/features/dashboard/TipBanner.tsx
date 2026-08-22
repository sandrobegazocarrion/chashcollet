import { useState } from 'react';
import { Card } from '../../components/ui/Card';
import { SAVINGS_TIPS, todaysTipIndex } from '../../lib/tips';

const MAX_DOTS = 5;

// Espeja .tip-banner (renderTip()/nextTip() en app.js): 1 consejo por día, con un
// botón "Siguiente" que va a uno aleatorio distinto del actual.
export function TipBanner() {
  const [idx, setIdx] = useState(() => todaysTipIndex());

  function next() {
    if (SAVINGS_TIPS.length <= 1) return;
    let n: number;
    do {
      n = Math.floor(Math.random() * SAVINGS_TIPS.length);
    } while (n === idx);
    setIdx(n);
  }

  const text = SAVINGS_TIPS[idx].replace(/^\p{Emoji}\s*/u, '');

  return (
    <Card className="flex min-h-[120px] flex-col gap-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Consejo del día</p>
      <i className="ph ph-lightbulb text-2xl text-[var(--brand)]" aria-hidden="true" />
      <p className="flex-1 text-[15.5px] font-semibold leading-relaxed text-[var(--text)]">{text}</p>
      <div className="mt-auto flex items-center justify-between">
        <div className="flex items-center gap-1">
          {Array.from({ length: MAX_DOTS }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 rounded-full transition-all"
              style={{
                width: i === idx % MAX_DOTS ? 16 : 5,
                background: i === idx % MAX_DOTS ? 'var(--text)' : 'var(--border)',
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={next}
          className="rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] px-3.5 py-1.5 text-xs font-bold text-[var(--text)] hover:bg-[var(--border)]"
        >
          Siguiente →
        </button>
      </div>
    </Card>
  );
}

import { PERUVIAN_BANKS } from '../../lib/banks';

// Espeja .bank-badge en styles.css: pill con un punto neutro + el nombre del banco.
export function BankBadge({ code }: { code: string | null | undefined }) {
  if (!code || !PERUVIAN_BANKS[code]) return null;
  return (
    <span className="inline-flex w-fit items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-0.5 text-[10.5px] font-bold text-[var(--text-muted)]">
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--text-faint)]" />
      {PERUVIAN_BANKS[code]}
    </span>
  );
}

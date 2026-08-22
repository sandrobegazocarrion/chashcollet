import { Card } from '../../components/ui/Card';
import { formatDate, formatMoney } from '../../lib/finance';
import type { Account, Transaction } from '../../lib/types';

const CATEGORY_ICONS: Record<string, string> = {
  Comida: 'ph-hamburger',
  Transporte: 'ph-car',
  Hogar: 'ph-house-simple',
  Entretenimiento: 'ph-film-strip',
  Salud: 'ph-pill',
  Otros: 'ph-credit-card',
};

interface ActivityFeedProps {
  transactions: Transaction[];
  accounts: Account[];
}

// Espeja renderActivity(): últimos 7 movimientos, más recientes primero.
// Sin editar/eliminar todavía (Transacciones no está migrado en v1).
export function ActivityFeed({ transactions, accounts }: ActivityFeedProps) {
  const list = [...transactions]
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
    .slice(0, 7);

  return (
    <Card className="col-span-full">
      <h2 className="mb-3 text-sm font-medium text-[var(--text)]">Actividad reciente</h2>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-[var(--text-muted)]">Todavía no hay movimientos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--border)]">
          {list.map((tx) => {
            const acc = accounts.find((a) => a.id === tx.accountId);
            const icon = CATEGORY_ICONS[tx.category] || 'ph-credit-card';
            const isIncome = tx.type === 'ingreso';
            return (
              <li key={tx.id} className="flex items-center gap-3 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-raised)] text-[var(--text)]">
                  <i className={`ph ${icon}`} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text)]">
                    {tx.description || tx.category}
                  </p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {formatDate(tx.date)} · {acc ? acc.name : '—'}
                  </p>
                </div>
                <span className={`num shrink-0 text-sm font-medium ${isIncome ? 'text-[var(--green)]' : 'text-[var(--red)]'}`}>
                  {isIncome ? '+' : '-'}
                  {formatMoney(tx.amount)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Portado de accountColorKey()/accountColor() en public/js/app.js: color elegible
// por el usuario, con respaldo determinístico por hash del id si no eligió ninguno.
// Mismos 6 nombres que ACCOUNT_COLORS en server/finance.js — no inventar otros acá,
// el backend rechazaría un valor fuera de esta lista.
// 'red' se sacó de esta paleta a propósito: es el mismo rojo semántico de gastos/
// alertas (--red), y una cuenta o meta decorada de "rojo" no debería leerse como
// una alerta real. 'steel' lo reemplaza como color decorativo neutro.
export const ACCOUNT_COLOR_PALETTE = ['accent', 'accent2', 'ochre', 'lavender', 'sage', 'steel'] as const;
export type AccountColorKey = (typeof ACCOUNT_COLOR_PALETTE)[number];

export function accountColorKey(acc: { color?: string | null; id: string }): AccountColorKey {
  if (acc.color && (ACCOUNT_COLOR_PALETTE as readonly string[]).includes(acc.color)) {
    return acc.color as AccountColorKey;
  }
  let h = 0;
  for (let i = 0; i < acc.id.length; i++) h = (h * 31 + acc.id.charCodeAt(i)) >>> 0;
  return ACCOUNT_COLOR_PALETTE[h % ACCOUNT_COLOR_PALETTE.length];
}

// 'accent' es el nombre histórico de --brand en styles.css (--accent:var(--brand)).
export function accountColorVar(key: AccountColorKey): string {
  return key === 'accent' ? 'var(--brand)' : `var(--${key})`;
}

// Degradado de la tarjeta física: mismo par claro→oscuro que shadeHex(fg,-24) lograba
// con matemática de hex — acá con color-mix, sin resolver la variable a mano.
export function accountGradient(key: AccountColorKey): string {
  const c = accountColorVar(key);
  return `linear-gradient(135deg, ${c} 0%, color-mix(in srgb, ${c} 76%, black) 100%)`;
}

// Equivalente a hexToRgba(hex, .13) en app.js (fondo/anillo suave de --wc-soft en .wcard).
export function accountColorSoft(key: AccountColorKey, alphaPct = 13): string {
  return `color-mix(in srgb, ${accountColorVar(key)} ${alphaPct}%, transparent)`;
}

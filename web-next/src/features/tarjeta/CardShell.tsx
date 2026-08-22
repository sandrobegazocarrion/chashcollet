import { accountColorKey, accountGradient } from '../../lib/accountColor';
import { formatMoney } from '../../lib/finance';
import { PERUVIAN_BANKS } from '../../lib/banks';
import { cardUtilization, cardZone, ZONE_VAR } from '../../lib/cardHealth';
import type { Account } from '../../lib/types';

const WIDTH = 380;
const HERO_HEIGHT = 240;
const BAR_HEIGHT = 62;

interface CardShellProps {
  account: Account;
  expanded: boolean;
  onToggle: () => void;
}

// La tarjeta protagonista: grande (380×240) por defecto; al tocarla se "encoge" — la
// misma caja anima su altura hasta 62px — y se convierte en una barra compacta
// acoplada arriba del panel de detalle (ver CardDetailPanel.tsx). El contenido grande
// y el compacto viven superpuestos en el mismo contenedor y se cruzan en opacidad,
// para que la transición se sienta como un solo elemento que se achica, no dos
// componentes distintos reemplazándose de golpe.
export function CardShell({ account, expanded, onToggle }: CardShellProps) {
  const hasLimit = !!(account.creditLimit && account.creditLimit > 0);
  const util = hasLimit ? cardUtilization(account.balance, account.creditLimit!) : 0;
  const isOverLimit = hasLimit && account.balance > account.creditLimit!;
  const disponible = hasLimit ? Math.max(0, account.creditLimit! - account.balance) : null;
  const bankLabel = account.bank ? PERUVIAN_BANKS[account.bank] || account.bank : account.name;
  const zone = cardZone(util);
  const pillText = isOverLimit ? 'Sobregiro' : `${Math.round(util)}%`;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={expanded ? 'Contraer tarjeta' : 'Ver resumen, cuotas y movimientos'}
      className="relative mx-auto block shrink-0 overflow-hidden rounded-[24px] text-left text-white shadow-[0_16px_34px_rgba(0,0,0,.22)] transition-[height] duration-[400ms] ease-[cubic-bezier(.22,.9,.32,1)]"
      style={{ width: WIDTH, height: expanded ? BAR_HEIGHT : HERO_HEIGHT, background: accountGradient(accountColorKey(account)) }}
    >
      <span className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />

      {/* Grande */}
      <div
        className={`absolute inset-0 flex flex-col gap-5 p-7 transition-opacity duration-200 ${
          expanded ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
      >
        <div className="relative z-[1] flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-[15px] font-extrabold tracking-wide">{bankLabel}</span>
          {hasLimit && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/22 py-1 pl-1.5 pr-2.5 text-xs font-extrabold">
              <span
                className="h-[10px] w-[10px] shrink-0 rounded-full shadow-[0_0_0_3px_rgba(255,255,255,.22)]"
                style={{ background: `var(${ZONE_VAR[zone]})` }}
                aria-hidden="true"
              />
              {pillText}
            </span>
          )}
        </div>

        <div className="relative z-[1] h-7 w-11 rounded-[7px]" style={{ background: 'linear-gradient(135deg,#f3d27a,#c79a3d)' }} />

        <div className="relative z-[1] mt-auto">
          <p className="num m-0 text-[34px] font-extrabold leading-none tracking-tight">{formatMoney(hasLimit ? disponible! : account.balance)}</p>
          <p className="m-0 mt-1.5 text-[11px] font-bold uppercase tracking-wide opacity-80">{hasLimit ? 'Disponible' : 'Deuda actual'}</p>
          {hasLimit && <p className="num m-0 mt-1.5 text-sm opacity-85">Usado: {formatMoney(account.balance)}</p>}
        </div>
      </div>

      {/* Compacta */}
      <div
        className={`absolute inset-0 flex items-center justify-between gap-3 px-5 transition-opacity duration-200 ${
          expanded ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-bold">{bankLabel}</span>
          {hasLimit && (
            <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-black/22 py-0.5 pl-1.5 pr-2 text-[10.5px] font-extrabold">
              <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={{ background: `var(${ZONE_VAR[zone]})` }} aria-hidden="true" />
              {pillText}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="num text-[13px] font-extrabold">{formatMoney(hasLimit ? disponible! : account.balance)}</span>
          <i className="ph ph-caret-down" aria-hidden="true" />
        </div>
      </div>
    </button>
  );
}

// "+ Nueva tarjeta": misma huella (380×240) pero estática — nunca se encoge, solo
// abre el formulario.
export function AddCardTile({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mx-auto flex shrink-0 flex-col items-center justify-center gap-2 rounded-[24px] border-2 border-dashed border-[var(--border)] bg-[var(--surface)]/60 text-[13px] font-semibold text-[var(--text-faint)] hover:border-[var(--text-muted)] hover:text-[var(--text)]"
      style={{ width: WIDTH, height: HERO_HEIGHT }}
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface-raised)]">
        <i className="ph ph-plus text-lg" aria-hidden="true" />
      </span>
      <span>Nueva tarjeta</span>
    </button>
  );
}

export { WIDTH as CARD_WIDTH };

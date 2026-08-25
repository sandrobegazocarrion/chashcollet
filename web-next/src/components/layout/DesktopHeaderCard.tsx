import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { apiCall } from '../../lib/api';
import { computeUpcomingPayments, formatMoney } from '../../lib/finance';
import { exportExcel } from '../../lib/exportExcel';
import { BrandMark } from '../brand/BrandMark';
import type { AppState } from '../../lib/types';
import type { TabId } from './Sidebar';

interface DesktopHeaderCardProps {
  title: string;
  subtitle?: string;
  avatarLabel: string;
  data: AppState;
  onGoTab: (tab: TabId) => void;
  onSearchClick: () => void;
  onOpenDrawer: () => void;
}

const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Fase 2 ("panel de widgets", >=1024px): tarjeta de header de dos filas que
// reemplaza la barra angosta anterior — vive en el flujo del contenido (no
// sticky) y se implementa igual en todas las pestañas por consistencia, aunque
// esta fase solo rediseñó el contenido de Inicio. Mismo estado/lógica que el
// header móvil (notif, cuenta, tema, Telegram, Excel) para no perder ninguna
// función al migrar el lenguaje visual.
export function DesktopHeaderCard({ title, subtitle, avatarLabel, data, onGoTab, onSearchClick, onOpenDrawer }: DesktopHeaderCardProps) {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const accountPanelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notifOpen) return;
    const target = notifPanelRef.current?.querySelector('button') || notifPanelRef.current;
    (target as HTMLElement | null)?.focus();
  }, [notifOpen]);
  useEffect(() => {
    if (accountOpen) accountPanelRef.current?.querySelector('button')?.focus();
  }, [accountOpen]);

  const { data: linkStatus } = useQuery({
    queryKey: ['telegram-link-status'],
    queryFn: () => apiCall<{ linked: boolean }>('GET', '/api/telegram/link-status'),
  });
  const linked = !!linkStatus?.linked;

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const insideNotif = notifRef.current?.contains(target) || notifPanelRef.current?.contains(target);
      if (!insideNotif) setNotifOpen(false);
      if (accountRef.current && !accountRef.current.contains(target)) setAccountOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setNotifOpen(false);
        setAccountOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const upcoming = computeUpcomingPayments(data, 14).slice(0, 6);
  const hasUrgent = computeUpcomingPayments(data, 2).length > 0;

  const now = new Date();
  const dayOfMonth = now.getDate();
  const weekday = WEEKDAYS[now.getDay()];
  const monthLabel = `${dayOfMonth} de ${MONTHS[now.getMonth()]}`;

  return (
    <div className="hidden rounded-[28px] border border-[var(--d2-border)] bg-white px-[38px] py-8 lg:flex lg:flex-col lg:gap-6" style={{ fontFamily: 'var(--font-ui-d2)', boxShadow: 'var(--d2-card-shadow)' }}>
      {/* fila A */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex shrink-0 items-center gap-3.5">
          <button
            type="button"
            onClick={onOpenDrawer}
            aria-label="Abrir menú"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--d2-border)] text-[var(--d2-muted-3)] hover:bg-[var(--d2-bg)]"
          >
            <i className="ph ph-list text-base" aria-hidden="true" />
          </button>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--d2-ink)]">
            <BrandMark className="h-[17px] w-[17px] text-[var(--d2-accent)]" />
          </span>
          <div>
            <div className="text-[16px] font-extrabold text-[var(--d2-ink)]">NUVA</div>
            <div className="mt-px text-xs text-[var(--d2-muted)]">Panel financiero</div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3.5">
          <button
            type="button"
            onClick={() => onGoTab('transacciones')}
            aria-label="Nuevo movimiento"
            title="Nuevo movimiento"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--d2-border)] text-[var(--d2-muted-3)] hover:bg-[var(--d2-bg)]"
          >
            <i className="ph ph-plus text-sm" aria-hidden="true" />
          </button>
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => {
                setAccountOpen((v) => !v);
                setNotifOpen(false);
              }}
              aria-label="Cuenta"
              aria-haspopup="menu"
              aria-expanded={accountOpen}
              className="flex items-center gap-2.5"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--d2-accent-tint)] text-[15px] font-bold uppercase text-[var(--d2-accent-dark)]">
                {avatarLabel}
              </span>
              <span className="text-left">
                <span className="block text-[13.5px] font-bold text-[var(--d2-ink)]">{data.profile.ownerName || 'Tu cuenta'}</span>
                <span className="mt-px block text-[11.5px] text-[var(--d2-muted)]">Cuenta personal</span>
              </span>
            </button>
            {accountOpen && (
              <div
                ref={accountPanelRef}
                role="menu"
                aria-label="Cuenta"
                className="absolute right-0 top-[calc(100%+12px)] z-30 flex items-center gap-2.5 rounded-full border border-[var(--d2-border)] bg-white px-3 py-2.5"
                style={{ boxShadow: 'var(--d2-card-shadow)' }}
              >
                <CircleButton role="menuitem" icon="ph-power" label="Cerrar sesión" tone="danger" onClick={() => { setAccountOpen(false); signOut(); }} />
                <CircleButton
                  role="menuitem"
                  icon="ph-telegram-logo"
                  badge={linked ? 'ph-check' : 'ph-warning'}
                  label={linked ? 'Telegram vinculado — ir a Configuración' : 'Telegram no vinculado — ir a Configuración'}
                  tone={linked ? 'success' : 'danger'}
                  onClick={() => { onGoTab('configuracion'); setAccountOpen(false); }}
                />
                <CircleButton
                  role="menuitem"
                  icon={theme === 'dark' ? 'ph-sun' : 'ph-moon'}
                  label="Cambiar tema"
                  onClick={() => { toggle(); setAccountOpen(false); }}
                />
                <CircleButton role="menuitem" icon="ph-download-simple" label="Descargar en Excel" onClick={() => { exportExcel(data); setAccountOpen(false); }} />
                <CircleButton role="menuitem" icon="ph-gear-six" label="Configuración" onClick={() => { onGoTab('configuracion'); setAccountOpen(false); }} />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onSearchClick}
          className="flex min-w-[230px] items-center gap-2.5 rounded-full bg-[var(--d2-bg)] px-[18px] py-[11px] text-left"
        >
          <i className="ph ph-magnifying-glass text-[15px] text-[var(--d2-muted)]" aria-hidden="true" />
          <span className="text-[12.5px] text-[var(--d2-muted)]">Buscar movimientos, categorías…</span>
        </button>
      </div>

      {/* fila B */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full border border-[var(--d2-border)] text-[17px] font-extrabold text-[var(--d2-ink)]">
            {dayOfMonth}
          </span>
          <div>
            <div className="text-xs text-[var(--d2-muted)]">{weekday},</div>
            <div className="text-[13.5px] font-bold text-[var(--d2-ink)]">{monthLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => onGoTab('calendario')}
            className="ml-1.5 flex items-center gap-2 rounded-full bg-[var(--d2-accent)] px-5 py-[13px] text-[12.5px] font-bold text-white"
          >
            Ver vencimientos
            <i className="ph ph-arrow-right text-xs" aria-hidden="true" />
          </button>
          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => {
                setNotifOpen((v) => !v);
                setAccountOpen(false);
              }}
              aria-label={hasUrgent ? 'Vencimientos próximos (hay pagos urgentes)' : 'Vencimientos próximos'}
              aria-haspopup="dialog"
              aria-expanded={notifOpen}
              className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--d2-border)] text-[var(--d2-muted-3)] hover:bg-[var(--d2-bg)]"
            >
              <i className="ph ph-calendar-blank text-base" aria-hidden="true" />
              {hasUrgent && (
                <span className="absolute right-[7px] top-[6px] h-[7px] w-[7px] rounded-full border-[1.5px] border-white bg-[var(--d2-red)]" aria-hidden="true" />
              )}
            </button>
            {notifOpen && (
              <div
                ref={notifPanelRef}
                role="dialog"
                aria-label="Próximos vencimientos"
                tabIndex={-1}
                className="absolute left-0 top-[calc(100%+12px)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--d2-border)] bg-white p-2 outline-none"
                style={{ fontFamily: 'var(--font-ui-d2)', boxShadow: 'var(--d2-card-shadow)' }}
              >
                <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--d2-muted)]">Próximos vencimientos</p>
                {upcoming.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-[var(--d2-muted)]">No tienes vencimientos en los próximos 14 días.</p>
                ) : (
                  <ul className="flex flex-col">
                    {upcoming.map((item, i) => (
                      <li key={i}>
                        <button
                          type="button"
                          onClick={() => {
                            onGoTab(item.tab);
                            setNotifOpen(false);
                          }}
                          className="flex w-full items-center gap-2 rounded-[13px] px-2 py-2 text-left hover:bg-[var(--d2-bg)]"
                        >
                          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--d2-ink)]">{item.name}</span>
                          <span className="num shrink-0 text-xs font-bold text-[var(--d2-muted)]">{formatMoney(item.amount)}</span>
                          <span className={`shrink-0 text-[11px] font-bold ${item.days <= 2 ? 'text-[var(--d2-red)]' : 'text-[var(--d2-muted)]'}`}>
                            {item.days < 0 ? 'Vencido' : item.days === 0 ? 'Hoy' : `${item.days}d`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-[18px]">
          <div className="text-right">
            <div className="text-[22px] font-extrabold text-[var(--d2-ink)]">{title}</div>
            {subtitle && <div className="mt-0.5 text-[13px] text-[var(--d2-muted)]">{subtitle}</div>}
          </div>
          <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-[var(--d2-accent-tint)]" aria-hidden="true">
            <i className="ph ph-microphone text-[18px] text-[var(--d2-accent-dark)]" aria-hidden="true" />
          </span>
        </div>
      </div>
    </div>
  );
}

const CIRCLE_TONES = {
  default: 'text-[var(--d2-muted-3)] hover:bg-[var(--d2-bg)]',
  danger: 'text-[var(--d2-red)] hover:bg-[var(--d2-red)]/12',
  success: 'text-[var(--d2-green)] hover:bg-[var(--d2-green)]/12',
};

function CircleButton({
  icon,
  badge,
  label,
  onClick,
  tone = 'default',
  role,
}: {
  icon: string;
  badge?: string;
  label: string;
  onClick: () => void;
  tone?: keyof typeof CIRCLE_TONES;
  role?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--d2-border)] text-base transition-colors ${CIRCLE_TONES[tone]}`}
    >
      <i className={`ph ${icon}`} aria-hidden="true" />
      {badge && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-white text-[9px] text-white ${
            tone === 'success' ? 'bg-[var(--d2-green)]' : 'bg-[var(--d2-red)]'
          }`}
          aria-hidden="true"
        >
          <i className={`ph ${badge}`} />
        </span>
      )}
    </button>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';
import { apiCall } from '../../lib/api';
import { computeUpcomingPayments, formatMoney } from '../../lib/finance';
import { exportExcel } from '../../lib/exportExcel';
import type { AppState } from '../../lib/types';
import type { TabId } from './Sidebar';

interface TopbarProps {
  title: string;
  subtitle?: string;
  onOpenMenu: () => void;
  avatarLabel: string;
  data: AppState;
  onGoTab: (tab: TabId) => void;
  onSearchClick: () => void;
}

// Espeja .topbar de public/index.html: hamburger (solo móvil), título/saludo de la
// pestaña activa, buscador (focus-search), descarga en Excel (download-excel),
// campana de notificaciones (toggle-notif-panel), toggle de tema, y el avatar — que
// acá abre un popover de 3 botones en vez del modal de Configuración directo
// (open-settings ya no cuelga del avatar, ver AccountPopover más abajo).
export function Topbar({ title, subtitle, onOpenMenu, avatarLabel, data, onGoTab, onSearchClick }: TopbarProps) {
  const { theme, toggle } = useTheme();
  const { signOut } = useAuth();
  const [notifOpen, setNotifOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);
  const notifPanelRef = useRef<HTMLDivElement>(null);
  const accountPanelRef = useRef<HTMLDivElement>(null);

  // Al abrir un popover, el foco pasa a su primer control — así un usuario de
  // teclado/lector de pantalla se entera de que apareció y puede navegarlo.
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

  return (
    <>
    {/* Mobile/tablet (<1024px): sin cambios, sistema navy/violeta actual. */}
    <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-[var(--border-flat)] bg-[var(--bg)]/80 px-4 py-3 backdrop-blur-md sm:gap-3 sm:px-6 lg:hidden">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] md:hidden"
      >
        <i className="ph ph-list" aria-hidden="true" />
      </button>

      <div className="min-w-0 flex-1 truncate text-[15px] font-bold text-[var(--text)]">{title}</div>

      <div className="relative flex shrink-0 items-center gap-1.5 sm:gap-2">
        <IconPill icon="ph-magnifying-glass" label="Buscar movimientos" onClick={onSearchClick} />

        <div ref={notifRef}>
          <IconPill
            icon="ph-bell"
            label="Notificaciones"
            dot={hasUrgent}
            expanded={notifOpen}
            onClick={() => {
              setNotifOpen((v) => !v);
              setAccountOpen(false);
            }}
          />
        </div>
        {notifOpen && (
          <div
            ref={notifPanelRef}
            role="dialog"
            aria-label="Próximos vencimientos"
            tabIndex={-1}
            className="absolute right-0 top-[calc(100%+8px)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_24px_48px_-20px_rgba(10,10,10,.25)] outline-none"
          >
            <p className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-faint)]">Próximos vencimientos</p>
            {upcoming.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm text-[var(--text-faint)]">No tienes vencimientos en los próximos 14 días.</p>
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
                      className="flex w-full items-center gap-2 rounded-[var(--radius-control)] px-2 py-2 text-left hover:bg-[var(--surface-raised)]"
                    >
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text)]">{item.name}</span>
                      <span className="num shrink-0 text-xs font-bold text-[var(--text-muted)]">{formatMoney(item.amount)}</span>
                      <span className={`shrink-0 text-[11px] font-bold ${item.days <= 2 ? 'text-[var(--red)]' : 'text-[var(--text-faint)]'}`}>
                        {item.days < 0 ? 'Vencido' : item.days === 0 ? 'Hoy' : `${item.days}d`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <IconPill icon="ph-download-simple" label="Descargar en Excel" onClick={() => exportExcel(data)} className="hidden sm:flex" />

        <button
          type="button"
          onClick={toggle}
          title="Cambiar tema"
          aria-label="Cambiar tema"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-raised)]"
        >
          <i className={`ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'}`} aria-hidden="true" />
        </button>

        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => {
              setAccountOpen((v) => !v);
              setNotifOpen(false);
            }}
            title="Cuenta"
            aria-label="Cuenta"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-sm font-bold uppercase text-white"
          >
            {avatarLabel}
          </button>
          {accountOpen && (
            <div
              ref={accountPanelRef}
              role="menu"
              aria-label="Cuenta"
              className="absolute right-0 top-[calc(100%+10px)] z-30 flex items-center gap-2.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 shadow-[0_24px_48px_-20px_rgba(10,10,10,.25)]"
            >
              <CircleButton
                role="menuitem"
                icon="ph-power"
                label="Cerrar sesión"
                tone="danger"
                onClick={() => {
                  setAccountOpen(false);
                  signOut();
                }}
              />
              <CircleButton
                role="menuitem"
                icon="ph-telegram-logo"
                badge={linked ? 'ph-check' : 'ph-warning'}
                label={linked ? 'Telegram vinculado — ir a Configuración' : 'Telegram no vinculado — ir a Configuración'}
                tone={linked ? 'success' : 'danger'}
                onClick={() => {
                  onGoTab('configuracion');
                  setAccountOpen(false);
                }}
              />
              <CircleButton
                role="menuitem"
                icon="ph-gear-six"
                label="Configuración"
                onClick={() => {
                  onGoTab('configuracion');
                  setAccountOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </header>

    {/* Desktop (>=1024px): fase "Metas y Mascota" — mismo estado/lógica de arriba
        (notif, cuenta, tema, Telegram), solo con el lenguaje visual nuevo. */}
    <header className="sticky top-0 z-20 hidden items-center justify-between border-b border-[var(--d2-border)] bg-white px-8 py-[18px] lg:flex" style={{ fontFamily: 'var(--font-ui-d2)' }}>
      <div>
        <div className="text-[22px] font-extrabold text-[var(--d2-ink)]">{title}</div>
        {subtitle && <div className="mt-[3px] text-[13px] text-[var(--d2-muted)]">{subtitle}</div>}
      </div>
      <div className="flex items-center gap-3">
        <button type="button" onClick={onSearchClick} title="Buscar movimientos" aria-label="Buscar movimientos" className="text-[var(--d2-muted-2)] hover:text-[var(--d2-ink)]">
          <i className="ph ph-magnifying-glass text-[17px]" aria-hidden="true" />
        </button>
        <div className="relative" ref={notifRef}>
          <button
            type="button"
            onClick={() => {
              setNotifOpen((v) => !v);
              setAccountOpen(false);
            }}
            title="Notificaciones"
            aria-label={hasUrgent ? 'Notificaciones (vencimientos próximos)' : 'Notificaciones'}
            aria-haspopup="dialog"
            aria-expanded={notifOpen}
            className="relative text-[var(--d2-muted-2)] hover:text-[var(--d2-ink)]"
          >
            <i className="ph ph-bell text-[17px]" aria-hidden="true" />
            {hasUrgent && <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--d2-red)]" aria-hidden="true" />}
          </button>
          {notifOpen && (
            <div
              ref={notifPanelRef}
              role="dialog"
              aria-label="Próximos vencimientos"
              tabIndex={-1}
              className="absolute right-0 top-[calc(100%+12px)] z-30 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[var(--d2-border)] bg-white p-2 shadow-[var(--d2-card-shadow)] outline-none"
              style={{ fontFamily: 'var(--font-ui-d2)' }}
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
        <button type="button" onClick={toggle} title="Cambiar tema" aria-label="Cambiar tema" className="text-[var(--d2-muted-2)] hover:text-[var(--d2-ink)]">
          <i className={`ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'} text-[17px]`} aria-hidden="true" />
        </button>
        <div className="relative" ref={accountRef}>
          <button
            type="button"
            onClick={() => {
              setAccountOpen((v) => !v);
              setNotifOpen(false);
            }}
            title="Cuenta"
            aria-label="Cuenta"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[var(--d2-accent-tint)] text-[12px] font-bold uppercase text-[var(--d2-accent-dark)]"
          >
            {avatarLabel}
          </button>
          {accountOpen && (
            <div
              ref={accountPanelRef}
              role="menu"
              aria-label="Cuenta"
              className="absolute right-0 top-[calc(100%+12px)] z-30 flex items-center gap-2.5 rounded-full border border-[var(--d2-border)] bg-white px-3 py-2.5 shadow-[var(--d2-card-shadow)]"
            >
              <CircleButton
                role="menuitem"
                icon="ph-power"
                label="Cerrar sesión"
                tone="danger"
                onClick={() => {
                  setAccountOpen(false);
                  signOut();
                }}
              />
              <CircleButton
                role="menuitem"
                icon="ph-telegram-logo"
                badge={linked ? 'ph-check' : 'ph-warning'}
                label={linked ? 'Telegram vinculado — ir a Configuración' : 'Telegram no vinculado — ir a Configuración'}
                tone={linked ? 'success' : 'danger'}
                onClick={() => {
                  onGoTab('configuracion');
                  setAccountOpen(false);
                }}
              />
              <CircleButton
                role="menuitem"
                icon="ph-gear-six"
                label="Configuración"
                onClick={() => {
                  onGoTab('configuracion');
                  setAccountOpen(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </header>
    </>
  );
}

function IconPill({
  icon,
  label,
  onClick,
  dot,
  expanded,
  className = '',
}: {
  icon: string;
  label: string;
  onClick: () => void;
  dot?: boolean;
  expanded?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={dot ? `${label} (vencimientos próximos)` : label}
      aria-haspopup={expanded !== undefined ? 'dialog' : undefined}
      aria-expanded={expanded}
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--surface-raised)] ${className}`}
    >
      <i className={`ph ${icon}`} aria-hidden="true" />
      {dot && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[var(--red)]" aria-hidden="true" />}
    </button>
  );
}

const CIRCLE_TONES = {
  default: 'text-[var(--text-muted)] hover:bg-[var(--surface-raised)] hover:text-[var(--text)]',
  danger: 'text-[var(--red)] hover:bg-[var(--red)]/12',
  success: 'text-[var(--green)] hover:bg-[var(--green)]/12',
};

// El tono (rojo/verde) es un refuerzo visual, no el único indicador: el ícono de
// `badge` (check/warning) y el aria-label ya dicen el estado en texto, para no
// depender solo del color (p.ej. para daltonismo).
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
      className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-base transition-colors ${CIRCLE_TONES[tone]}`}
    >
      <i className={`ph ${icon}`} aria-hidden="true" />
      {badge && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border border-[var(--surface)] text-[9px] text-white ${
            tone === 'success' ? 'bg-[var(--green)]' : 'bg-[var(--red)]'
          }`}
          aria-hidden="true"
        >
          <i className={`ph ${badge}`} />
        </span>
      )}
    </button>
  );
}

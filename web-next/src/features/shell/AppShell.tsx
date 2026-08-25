import { useState } from 'react';
import { useAppState } from '../../hooks/useAppState';
import { useAuth } from '../../hooks/useAuth';
import { Skeleton } from '../../components/ui/Skeleton';
import { Sidebar, TAB_LABELS, type TabId } from '../../components/layout/Sidebar';
import { DesktopDrawer } from '../../components/layout/DesktopDrawer';
import { DesktopHeaderCard } from '../../components/layout/DesktopHeaderCard';
import { Topbar } from '../../components/layout/Topbar';
import { SettingsPage } from '../settings/SettingsPage';
import { greetingText } from '../../lib/greeting';
import { DashboardPage } from '../dashboard/DashboardPage';
import { DesktopHomePage } from '../dashboard/DesktopHomePage';
import { SUBVIEW_META, type SubViewType } from '../dashboard/SubView';
import { TransaccionesPage } from '../transacciones/TransaccionesPage';
import { CuentasPage } from '../cuentas/CuentasPage';
import { TarjetaPage } from '../tarjeta/TarjetaPage';
import { ChanchitosPage } from '../chanchitos/ChanchitosPage';
import { ServiciosPage } from '../deudas/ServiciosPage';
import { PrestamosPage } from '../deudas/PrestamosPage';
import { CalendarioPage } from '../calendario/CalendarioPage';
import { AdminPage } from '../admin/AdminPage';

// Sidebar (riel de íconos, fiel a public/index.html#sidebar) + topbar + contenido,
// igual que la app vieja. Un solo GET /api/state acá arriba; cada página recibe
// `data` ya resuelto en vez de volver a pedirlo.
export function AppShell() {
  const { session } = useAuth();
  const { data, isLoading, isError, error } = useAppState();
  const [tab, setTab] = useState<TabId>('panel');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const [subView, setSubView] = useState<SubViewType | null>(null);
  const [svMonth, setSvMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const avatarLabel = (session?.user.email || '?').charAt(0);

  // Espeja switchTab(): navegar a cualquier pestaña (desde el sidebar, el topbar o
  // dentro de una página) siempre cierra una sub-vista de Ingresos/Gastos/Balance
  // abierta, igual que el original desactiva #view-<tipo> al activar otro tab-panel.
  function goTab(t: TabId) {
    setSubView(null);
    setTab(t);
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-[var(--bg)] md:pl-[88px]">
        <div className="flex w-full flex-col gap-6 p-4 sm:p-6 lg:p-8">
          <Skeleton className="h-52" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4 text-center">
        <p className="text-[var(--red)]">{error instanceof Error ? error.message : 'No se pudo cargar la app.'}</p>
      </div>
    );
  }

  const title =
    tab === 'panel' && subView
      ? SUBVIEW_META[subView].title
      : tab === 'panel'
        ? greetingText(data.profile.ownerName)
        : tab === 'configuracion'
          ? 'Configuración'
          : TAB_LABELS[tab];

  // Saludo/subtítulo de la fase 2 "panel de widgets" (desktop) solo aplica en Inicio,
  // sin sub-vista abierta — en el resto de pestañas el header desktop hereda el
  // mismo `title` que ya usa mobile (nombre de la pestaña), sin inventar copy.
  const desktopGreeting = data.profile.ownerName ? `Hola, ${data.profile.ownerName} 👋` : 'Hola 👋';
  const desktopTitle = tab === 'panel' && !subView ? desktopGreeting : title;
  const desktopSubtitle = tab === 'panel' && !subView ? 'Hoy es un buen día para seguir construyendo la vida que quieres.' : undefined;

  function handleSearchClick() {
    goTab('transacciones');
    setSearchFocusTick((t) => t + 1);
  }

  return (
    <div className="min-h-screen bg-[var(--bg)] lg:bg-[var(--d2-bg)]">
      <Sidebar
        active={tab}
        onChange={goTab}
        showAdmin={data.profile.isAdmin}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onQuickAdd={() => goTab('transacciones')}
        online
      />
      <DesktopDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        active={tab}
        onChange={goTab}
        showAdmin={data.profile.isAdmin}
        onQuickAdd={() => goTab('transacciones')}
      />
      <div className="flex min-h-screen flex-col md:pl-[88px] lg:pl-0">
        <Topbar title={desktopTitle} onOpenMenu={() => setSidebarOpen(true)} avatarLabel={avatarLabel} data={data} onGoTab={goTab} onSearchClick={handleSearchClick} />
        <main className="w-full flex-1 p-4 sm:p-6 lg:flex lg:flex-col lg:gap-3 lg:p-[22px]">
          <DesktopHeaderCard
            title={desktopTitle}
            subtitle={desktopSubtitle}
            avatarLabel={avatarLabel}
            data={data}
            onGoTab={goTab}
            onSearchClick={handleSearchClick}
            onOpenDrawer={() => setDrawerOpen(true)}
          />

          {tab === 'panel' && !subView && (
            <div className="hidden lg:block">
              <DesktopHomePage data={data} onGoTab={goTab} />
            </div>
          )}
          {tab === 'panel' && (
            <div className={subView ? '' : 'lg:hidden'}>
              <DashboardPage
                data={data}
                onNewGoal={() => goTab('chanchitos')}
                onOpenGoals={() => goTab('chanchitos')}
                onGoTab={goTab}
                subView={subView}
                svMonth={svMonth}
                onOpenSubView={setSubView}
                onCloseSubView={() => setSubView(null)}
                onPrevSvMonth={() => setSvMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                onNextSvMonth={() => setSvMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              />
            </div>
          )}
          {tab === 'transacciones' && <TransaccionesPage data={data} focusSearchSignal={searchFocusTick} />}
          {tab === 'cuentas' && <CuentasPage data={data} />}
          {tab === 'tarjeta' && <TarjetaPage data={data} />}
          {tab === 'chanchitos' && <ChanchitosPage data={data} />}
          {tab === 'servicios' && <ServiciosPage data={data} />}
          {tab === 'prestamos' && <PrestamosPage data={data} />}
          {tab === 'calendario' && <CalendarioPage data={data} onGoTab={goTab} />}
          {tab === 'admin' && data.profile.isAdmin && <AdminPage />}
          {tab === 'configuracion' && <SettingsPage data={data} onBack={() => goTab('panel')} />}
        </main>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { useAppState } from '../../hooks/useAppState';
import { useAuth } from '../../hooks/useAuth';
import { Skeleton } from '../../components/ui/Skeleton';
import { Sidebar, TAB_LABELS, type TabId } from '../../components/layout/Sidebar';
import { BottomTabBar } from '../../components/layout/BottomTabBar';
import { QuickAddFab } from '../../components/layout/QuickAddFab';
import { MoreSheet } from '../../components/layout/MoreSheet';
import { AddChoiceSheet } from '../../components/layout/AddChoiceSheet';
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
import { PresupuestosPage } from '../presupuestos/PresupuestosPage';
import { CalendarioPage } from '../calendario/CalendarioPage';
import { AdminPage } from '../admin/AdminPage';

// Sidebar (riel de íconos, fiel a public/index.html#sidebar) + topbar + contenido,
// igual que la app vieja. Un solo GET /api/state acá arriba; cada página recibe
// `data` ya resuelto en vez de volver a pedirlo.
export function AppShell() {
  const { session } = useAuth();
  const { data, isLoading, isError, error } = useAppState();
  const [tab, setTab] = useState<TabId>('panel');
  const [moreOpen, setMoreOpen] = useState(false);
  const [addChoiceOpen, setAddChoiceOpen] = useState(false);
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const [newTxTick, setNewTxTick] = useState(0);
  const [newTxType, setNewTxType] = useState<'ingreso' | 'gasto'>('gasto');
  const [subView, setSubView] = useState<SubViewType | null>(null);
  const [svMonth, setSvMonth] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const avatarLabel = (session?.user.email || '?').charAt(0);
  const PRIMARY_MOBILE_TABS: TabId[] = ['panel', 'cuentas', 'tarjeta', 'transacciones', 'chanchitos'];
  const moreActive = !PRIMARY_MOBILE_TABS.includes(tab);

  // Espeja switchTab(): navegar a cualquier pestaña (desde el sidebar, el topbar o
  // dentro de una página) siempre cierra una sub-vista de Ingresos/Gastos/Balance
  // abierta, igual que el original desactiva #view-<tipo> al activar otro tab-panel.
  function goTab(t: TabId) {
    setSubView(null);
    setTab(t);
  }

  // Usado tras elegir Ingreso/Gasto en <AddChoiceSheet>: navega a Transacciones y le
  // pide abrir el formulario directamente con ese tipo ya seleccionado.
  function openNewTransaction(type: 'ingreso' | 'gasto') {
    setNewTxType(type);
    goTab('transacciones');
    setNewTxTick((t) => t + 1);
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

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <Sidebar active={tab} onChange={goTab} showAdmin={data.profile.isAdmin} onQuickAdd={() => setAddChoiceOpen(true)} online />
      <div className="flex min-h-screen flex-col md:pl-[88px]">
        <Topbar
          title={title}
          avatarLabel={avatarLabel}
          data={data}
          onGoTab={goTab}
          brand={tab === 'panel' && !subView}
          onSearchClick={() => {
            goTab('transacciones');
            setSearchFocusTick((t) => t + 1);
          }}
        />
        <main className="w-full flex-1 p-4 pb-24 sm:p-6 md:pb-6 lg:p-8">
          {tab === 'panel' && !subView && (
            <div className="hidden lg:block">
              <DesktopHomePage
                data={data}
                onOpenSubView={setSubView}
                onNewGoal={() => goTab('chanchitos')}
                onOpenGoals={() => goTab('chanchitos')}
                onOpenTarjeta={() => goTab('tarjeta')}
                onOpenPresupuestos={() => goTab('presupuestos')}
              />
            </div>
          )}
          {tab === 'panel' && (
            <div className={subView ? '' : 'lg:hidden'}>
              <DashboardPage
                data={data}
                onNewGoal={() => goTab('chanchitos')}
                onOpenGoals={() => goTab('chanchitos')}
                onGoTab={goTab}
                onRegisterIncome={() => openNewTransaction('ingreso')}
                subView={subView}
                svMonth={svMonth}
                onOpenSubView={setSubView}
                onCloseSubView={() => setSubView(null)}
                onPrevSvMonth={() => setSvMonth((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                onNextSvMonth={() => setSvMonth((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              />
            </div>
          )}
          {tab === 'transacciones' && (
            <TransaccionesPage data={data} focusSearchSignal={searchFocusTick} newTxSignal={newTxTick} newTxType={newTxType} />
          )}
          {tab === 'cuentas' && <CuentasPage data={data} />}
          {tab === 'tarjeta' && <TarjetaPage data={data} />}
          {tab === 'chanchitos' && <ChanchitosPage data={data} />}
          {tab === 'servicios' && <ServiciosPage data={data} />}
          {tab === 'prestamos' && <PrestamosPage data={data} />}
          {tab === 'presupuestos' && <PresupuestosPage data={data} />}
          {tab === 'calendario' && <CalendarioPage data={data} onGoTab={goTab} />}
          {tab === 'admin' && data.profile.isAdmin && <AdminPage />}
          {tab === 'configuracion' && <SettingsPage data={data} onBack={() => goTab('panel')} />}
        </main>
      </div>

      <BottomTabBar active={tab} onChange={goTab} onMore={() => setMoreOpen(true)} moreActive={moreActive} />
      <QuickAddFab onClick={() => setAddChoiceOpen(true)} />
      <MoreSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        active={tab}
        onChange={goTab}
        showAdmin={data.profile.isAdmin}
        primaryIds={PRIMARY_MOBILE_TABS}
      />
      <AddChoiceSheet
        open={addChoiceOpen}
        onClose={() => setAddChoiceOpen(false)}
        onChoose={(type) => {
          setAddChoiceOpen(false);
          openNewTransaction(type);
        }}
      />
    </div>
  );
}

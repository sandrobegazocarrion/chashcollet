import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { Switch } from '../../components/ui/Switch';
import { useApiMutation } from '../../hooks/useApiMutation';
import { apiCall } from '../../lib/api';
import type { AppState } from '../../lib/types';

interface SettingsPageProps {
  data: AppState;
  onBack: () => void;
}

// Espeja openSettingsModal() en public/js/app.js, pero como página propia en vez de
// modal (el avatar ya no la abre directo — ver AccountPopover): nombre, meta de
// ahorro mensual, notificaciones + días de anticipación, días de sueldo, vínculo con
// el bot de Telegram. "Cerrar sesión" vive ahora en el popover del avatar.
export function SettingsPage({ data, onBack }: SettingsPageProps) {
  const queryClient = useQueryClient();

  const [ownerName, setOwnerName] = useState(data.profile.ownerName || '');
  const [monthlyGoal, setMonthlyGoal] = useState(data.monthlyGoal != null ? String(data.monthlyGoal) : '');
  const [telegramNotifications, setTelegramNotifications] = useState(data.settings.telegramNotifications);
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(String(data.settings.notifyDaysBefore));
  const [incomeDays, setIncomeDays] = useState((data.settings.incomeDays || []).join(', '));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateSettings = useApiMutation<Record<string, unknown>, unknown>('PUT', '/api/settings');
  const updateProfile = useApiMutation<Record<string, unknown>, unknown>('PUT', '/api/profile');
  const updateGoal = useApiMutation<Record<string, unknown>, unknown>('PUT', '/api/goal');

  const { data: linkStatus } = useQuery({
    queryKey: ['telegram-link-status'],
    queryFn: () => apiCall<{ linked: boolean }>('GET', '/api/telegram/link-status'),
  });
  const [linkCode, setLinkCode] = useState<{ code: string; expiresAt: string } | null>(null);
  const [linking, setLinking] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  async function handleGenerateCode() {
    setLinking(true);
    setError(null);
    try {
      const res = await apiCall<{ code: string; expiresAt: string }>('POST', '/api/telegram/link-code');
      setLinkCode(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo generar el código.');
    } finally {
      setLinking(false);
    }
  }
  async function handleUnlink() {
    if (!confirm('¿Desvincular tu Telegram? Podrás volver a vincularlo cuando quieras.')) return;
    setUnlinking(true);
    try {
      await apiCall('DELETE', '/api/telegram/link');
      queryClient.invalidateQueries({ queryKey: ['telegram-link-status'] });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo desvincular.');
    } finally {
      setUnlinking(false);
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const days = incomeDays
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => n >= 1 && n <= 31);
    try {
      await Promise.all([
        updateSettings.mutateAsync({ telegramNotifications, notifyDaysBefore: parseInt(notifyDaysBefore, 10) || 2, incomeDays: days }),
        updateProfile.mutateAsync({ ownerName: ownerName.trim() }),
        updateGoal.mutateAsync({ amount: parseFloat(monthlyGoal) || 0 }),
      ]);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la configuración.');
    }
  }

  const saving = updateSettings.isPending || updateProfile.isPending || updateGoal.isPending;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <PageHeader title="Configuración">
        <GradientButton type="button" variant="ghost" onClick={onBack}>
          <i className="ph ph-arrow-left" aria-hidden="true" /> Volver
        </GradientButton>
      </PageHeader>

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tu nombre</p>
          <Input label="Cómo te saluda la app" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Ej: Sandro" />
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Meta de ahorro</p>
          <Input
            label="Meta de ahorro mensual (S/)"
            type="number"
            min={0}
            step="0.01"
            value={monthlyGoal}
            onChange={(e) => setMonthlyGoal(e.target.value)}
            placeholder="Ej: 500"
          />
        </Card>

        <Card className="flex flex-col gap-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Bot de Telegram</p>
          <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5">
            <div>
              <p className="text-sm font-bold text-[var(--text)]">Notificaciones de vencimiento</p>
              <p className="mt-0.5 text-xs text-[var(--text-muted)]">Te avisa antes de que venzan compromisos, deudas y tarjetas.</p>
            </div>
            <Switch checked={telegramNotifications} onChange={setTelegramNotifications} label="Notificaciones de vencimiento" />
          </div>
          <Input
            label="Avisar con cuántos días de anticipación"
            type="number"
            min={0}
            max={14}
            value={notifyDaysBefore}
            onChange={(e) => setNotifyDaysBefore(e.target.value)}
          />

          <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Calendario</p>
          <Input label="Días de sueldo (1-31, separados por coma)" value={incomeDays} onChange={(e) => setIncomeDays(e.target.value)} placeholder="Ej: 1, 15" />

          <div className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3 text-[12.5px] text-[var(--text-muted)]">
            <i
              className={`ph ${linkStatus?.linked ? 'ph-check-circle' : 'ph-warning-circle'} shrink-0`}
              style={{ color: linkStatus?.linked ? 'var(--green)' : 'var(--amber)' }}
              aria-hidden="true"
            />
            <span className="flex-1">{linkStatus?.linked ? 'Bot vinculado a tu Telegram.' : 'Bot no vinculado todavía.'}</span>
            {linkStatus?.linked ? (
              <GradientButton type="button" variant="ghost" onClick={handleUnlink} loading={unlinking} className="!px-3 !py-1.5 !text-xs">
                Desvincular
              </GradientButton>
            ) : (
              <GradientButton type="button" variant="ghost" onClick={handleGenerateCode} loading={linking} className="!px-3 !py-1.5 !text-xs">
                Vincular
              </GradientButton>
            )}
          </div>
          {linkCode && (
            <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-raised)] p-3.5 text-center">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-muted)]">Tu código</p>
              <p className="num my-1.5 text-2xl font-extrabold tracking-[4px] text-[var(--text)]">{linkCode.code}</p>
              <p className="text-xs text-[var(--text-muted)]">Abre el bot en Telegram y pégalo en el chat.</p>
            </div>
          )}
        </Card>

        {error && (
          <p className="text-sm text-[var(--red)]" role="alert">
            {error}
          </p>
        )}
        {saved && !error && (
          <p className="text-sm text-[var(--green)]" role="status">
            Configuración guardada.
          </p>
        )}

        <div className="flex items-center justify-end gap-2">
          <GradientButton type="submit" loading={saving}>
            Guardar
          </GradientButton>
        </div>
      </form>
    </div>
  );
}

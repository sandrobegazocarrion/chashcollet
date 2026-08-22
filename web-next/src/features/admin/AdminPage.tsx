import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCall } from '../../lib/api';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { formatDate } from '../../lib/finance';
import type { AdminUser } from '../../lib/types';

// Portado de SUB_STATUS_LABELS en app.js.
const SUB_STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: 'Pagado', cls: 'text-[var(--green)] bg-[var(--green)]/[0.13]' },
  past_due: { label: 'Pago vencido', cls: 'text-[var(--red)] bg-[var(--red)]/[0.13]' },
  canceled: { label: 'Cancelada', cls: 'text-[var(--red)] bg-[var(--red)]/[0.13]' },
  sin_suscripcion: { label: 'Sin suscripción', cls: 'text-[var(--text-muted)] bg-[var(--surface-raised)]' },
};

function Pill({ label, cls }: { label: string; cls: string }) {
  return <span className={`shrink-0 rounded-[var(--radius-pill)] px-2.5 py-1 text-[11px] font-bold ${cls}`}>{label}</span>;
}

export function AdminPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, error } = useQuery<{ users: AdminUser[] }>({
    queryKey: ['admin-users'],
    queryFn: () => apiCall<{ users: AdminUser[] }>('GET', '/api/admin/users'),
  });

  const [suspending, setSuspending] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState<AdminUser | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const suspend = useMutation({
    mutationFn: (id: string) => apiCall('POST', `/api/admin/users/${id}/suspend`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setSuspending(null);
    },
    onError: (e: Error) => setActionError(e.message),
  });
  const unsuspend = useMutation({
    mutationFn: (id: string) => apiCall('POST', `/api/admin/users/${id}/unsuspend`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiCall('DELETE', `/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeleting(null);
      setDeleteConfirmEmail('');
    },
    onError: (e: Error) => setActionError(e.message),
  });

  if (isLoading) return <p className="text-sm text-[var(--text-muted)]">Cargando usuarios…</p>;
  if (isError || !data) return <p className="text-sm text-[var(--red)]">{error instanceof Error ? error.message : 'No se pudo cargar la lista de usuarios.'}</p>;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-lg font-semibold text-[var(--text)]">Administración</h1>

      {data.users.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No hay usuarios registrados todavía.</p>
      ) : (
        <Card className="flex flex-col divide-y divide-[var(--border)] p-0">
          {data.users.map((u) => {
            const sub = SUB_STATUS[u.subscriptionStatus] || SUB_STATUS.sin_suscripcion;
            return (
              <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[var(--text)]">{u.email || '(sin correo)'}</p>
                  <p className="truncate text-xs text-[var(--text-muted)]">
                    {u.ownerName || 'Sin nombre'} · Registrado {formatDate(u.createdAt.slice(0, 10))}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill label={u.setupCompleted ? 'Perfil completo' : 'Perfil incompleto'} cls={u.setupCompleted ? 'text-[var(--green)] bg-[var(--green)]/[0.13]' : 'text-[var(--text-muted)] bg-[var(--surface-raised)]'} />
                  <Pill label={sub.label} cls={sub.cls} />
                  {u.isAdmin && <Pill label="Admin" cls="text-[var(--green)] bg-[var(--green)]/[0.13]" />}
                  {u.suspended && <Pill label="Suspendida" cls="text-[var(--red)] bg-[var(--red)]/[0.13]" />}
                  {u.suspended ? (
                    <GradientButton variant="ghost" onClick={() => unsuspend.mutate(u.id)} className="!px-3 !py-1.5 !text-xs">
                      Reactivar
                    </GradientButton>
                  ) : (
                    <GradientButton
                      variant="ghost"
                      onClick={() => {
                        setActionError(null);
                        setSuspending(u);
                      }}
                      className="!px-3 !py-1.5 !text-xs"
                    >
                      Suspender
                    </GradientButton>
                  )}
                  <IconButton
                    icon="ph-trash"
                    variant="danger"
                    label="Eliminar cuenta"
                    onClick={() => {
                      setActionError(null);
                      setDeleteConfirmEmail('');
                      setDeleting(u);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Modal open={!!suspending} onClose={() => setSuspending(null)} title="Suspender cuenta">
        <p className="mb-4 text-sm text-[var(--text-muted)]">
          ¿Suspender la cuenta de <strong className="text-[var(--text)]">{suspending?.email}</strong>? No podrá iniciar sesión hasta que la reactives.
        </p>
        {actionError && (
          <p className="mb-3 text-sm text-[var(--red)]" role="alert">
            {actionError}
          </p>
        )}
        <GradientButton onClick={() => suspending && suspend.mutate(suspending.id)} loading={suspend.isPending} className="w-full">
          Suspender
        </GradientButton>
      </Modal>

      {/* Eliminar cuenta: irreversible, se pide escribir el correo exacto para confirmar
          (igual que promptDialog() en app.js) — no basta un simple "sí/no". */}
      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Eliminar cuenta permanentemente">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-[var(--text-muted)]">
            Esto borra TODOS los datos de <strong className="text-[var(--text)]">{deleting?.email}</strong> (cuentas, movimientos, metas, todo) sin poder deshacerlo. Escribe el correo exacto para
            confirmar:
          </p>
          <Input label="Correo" placeholder={deleting?.email || ''} value={deleteConfirmEmail} onChange={(e) => setDeleteConfirmEmail(e.target.value)} />
          {actionError && (
            <p className="text-sm text-[var(--red)]" role="alert">
              {actionError}
            </p>
          )}
          <GradientButton
            onClick={() => deleting && remove.mutate(deleting.id)}
            loading={remove.isPending}
            disabled={deleteConfirmEmail !== deleting?.email}
            className="w-full"
          >
            Eliminar
          </GradientButton>
        </div>
      </Modal>
    </div>
  );
}

'use strict';
/*
 * Fase "Admin check" — solo lectura por ahora: listar todos los usuarios.
 * Usa supabaseAdmin (service_role) a propósito: es la única forma de ver la
 * lista completa de cuentas (auth.users no está expuesta vía RLS normal, y la
 * API admin de Supabase es justamente para esto). Cada llamada que use este
 * módulo debe pasar primero por requireAuth + requireAdmin (server/auth.js).
 */

function must(error, msg) { if (error) throw new Error(msg || error.message); }

// Suspensión: se apoya en el baneo nativo de Supabase Auth (banned_until) en vez
// de una columna propia — Supabase ya bloquea login/refresh de tokens para
// cuentas baneadas, y basta con revertirlo para reactivar. 100 años ≈ indefinido
// (no existe un "para siempre" real en la API, así que se usa esta convención).
const SUSPEND_DURATION = '876000h';

async function listUsers(supabaseAdmin) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data: userList, error: e0 } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  must(e0);

  const ids = userList.users.map(u => u.id);
  const [{ data: profiles, error: e1 }, { data: subs, error: e2 }] = await Promise.all([
    ids.length ? supabaseAdmin.from('user_profile').select('*').in('user_id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabaseAdmin.from('subscriptions').select('*').in('user_id', ids) : Promise.resolve({ data: [], error: null })
  ]);
  must(e1); must(e2);
  const profileById = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));
  const subById = Object.fromEntries((subs || []).map(s => [s.user_id, s]));

  return userList.users
    .map(u => {
      const p = profileById[u.id];
      const s = subById[u.id];
      const bannedUntil = u.banned_until ? new Date(u.banned_until) : null;
      return {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
        ownerName: p ? p.owner_name : null,
        setupCompleted: p ? !!p.setup_completed : false,
        isAdmin: p ? !!p.is_admin : false,
        suspended: !!(bannedUntil && bannedUntil > new Date()),
        subscriptionStatus: s ? s.status : 'sin_suscripcion',
        planActiveUntil: s ? s.plan_active_until : null
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

async function suspendUser(supabaseAdmin, userId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: SUSPEND_DURATION });
  must(error);
}

async function unsuspendUser(supabaseAdmin, userId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  must(error);
}

module.exports = { listUsers, suspendUser, unsuspendUser };

'use strict';
/*
 * Fase "Admin check" — solo lectura por ahora: listar todos los usuarios.
 * Usa supabaseAdmin (service_role) a propósito: es la única forma de ver la
 * lista completa de cuentas (auth.users no está expuesta vía RLS normal, y la
 * API admin de Supabase es justamente para esto). Cada llamada que use este
 * módulo debe pasar primero por requireAuth + requireAdmin (server/auth.js).
 */

function must(error, msg) { if (error) throw new Error(msg || error.message); }

async function listUsers(supabaseAdmin) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data: userList, error: e0 } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  must(e0);

  const ids = userList.users.map(u => u.id);
  const { data: profiles, error: e1 } = ids.length
    ? await supabaseAdmin.from('user_profile').select('*').in('user_id', ids)
    : { data: [], error: null };
  must(e1);
  const profileById = Object.fromEntries((profiles || []).map(p => [p.user_id, p]));

  return userList.users
    .map(u => {
      const p = profileById[u.id];
      return {
        id: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at || null,
        ownerName: p ? p.owner_name : null,
        setupCompleted: p ? !!p.setup_completed : false,
        isAdmin: p ? !!p.is_admin : false
      };
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { listUsers };

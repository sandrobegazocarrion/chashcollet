'use strict';
const { createClient } = require('@supabase/supabase-js');
const { userClient } = require('./supabaseClient');

// Cliente "admin": usa la service_role key, así que salta el RLS por completo.
// Solo se usa server-side para verificar tokens de usuario y (más adelante,
// Fase 3+) para leer/escribir datos ya filtrados a mano por user_id.
const supabaseAdmin = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
  : null;

// Verifica el JWT que manda el frontend en "Authorization: Bearer <token>"
// y expone req.userId. Nunca confía en un user_id que venga del body/query.
async function requireAuth(req, res, next) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase no está configurado en el servidor (faltan variables de entorno).' });
  }
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No autenticado.' });

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data || !data.user) {
    return res.status(401).json({ error: 'Sesión inválida o vencida, vuelve a iniciar sesión.' });
  }
  req.userId = data.user.id;
  req.userEmail = data.user.email;
  req.accessToken = token;
  next();
}

// Corre después de requireAuth. Lee is_admin de la PROPIA fila del usuario con su
// propio cliente (respeta RLS) — no hace falta service_role solo para chequear
// esto, ya que un usuario siempre puede leer su propia fila de user_profile.
async function requireAdmin(req, res, next) {
  try {
    const sb = userClient(req.accessToken);
    const { data, error } = await sb.from('user_profile').select('is_admin').eq('user_id', req.userId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || !data.is_admin) return res.status(403).json({ error: 'No autorizado.' });
    next();
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

module.exports = { supabaseAdmin, requireAuth, requireAdmin };

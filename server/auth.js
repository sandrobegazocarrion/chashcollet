'use strict';
const { createClient } = require('@supabase/supabase-js');

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

module.exports = { supabaseAdmin, requireAuth };

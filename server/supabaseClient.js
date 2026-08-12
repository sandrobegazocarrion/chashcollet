'use strict';
const { createClient } = require('@supabase/supabase-js');

// Cliente "por request", con la ANON key + el JWT del usuario en el header.
// A diferencia del cliente admin (auth.js, service_role), este SÍ respeta RLS —
// es la doble capa de seguridad: aunque el código tenga un bug y se le olvide
// filtrar por user_id, la base de datos igual lo bloquea.
function userClient(accessToken) {
  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

module.exports = { userClient };

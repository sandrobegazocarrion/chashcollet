import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

export interface PublicConfig {
  supabaseUrl: string | null;
  supabaseAnonKey: string | null;
  turnstileSiteKey: string | null;
}

let clientPromise: Promise<{ client: SupabaseClient; config: PublicConfig }> | null = null;

// Espeja GET /api/config de auth.js: el mismo proyecto Supabase, resuelto en runtime
// desde el backend (no hay claves hardcodeadas en el bundle).
export function getSupabase() {
  if (!clientPromise) {
    clientPromise = (async () => {
      const res = await fetch(`${API_BASE}/api/config`);
      const config: PublicConfig = await res.json();
      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        throw new Error('El servidor todavía no tiene configurado Supabase.');
      }
      const client = createClient(config.supabaseUrl, config.supabaseAnonKey);
      return { client, config };
    })();
  }
  return clientPromise;
}

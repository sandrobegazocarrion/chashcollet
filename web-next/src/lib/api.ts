import { getSupabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE ?? '';

// Equivalente TS de apiCall() en public/js/app.js: agrega el Bearer token de la
// sesión Supabase activa a cada request contra server/server.js.
export async function apiCall<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const { client } = await getSupabase();
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // sin cuerpo JSON (ej. 204)
  }

  if (!res.ok) {
    const message = (json as { error?: string } | null)?.error ?? 'Error de conexión con el servidor';
    throw new Error(message);
  }

  return json as T;
}

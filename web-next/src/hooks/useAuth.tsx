import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getSupabase } from '../lib/supabase';
import { apiCall } from '../lib/api';

// Espeja public/js/auth.js: sesión + login/registro por correo + Google + olvidé mi
// contraseña + reset (disparado por el evento PASSWORD_RECOVERY de Supabase).
export interface SignupProfileData {
  ownerName: string;
  birthDate: string;
  gender: string;
}

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  error: string | null;
  turnstileSiteKey: string | null;
  passwordRecovery: boolean;
  signInWithPassword: (email: string, password: string, captchaToken?: string) => Promise<void>;
  signUp: (email: string, password: string, profile: SignupProfileData, captchaToken?: string) => Promise<{ needsEmailConfirm: boolean }>;
  signInWithGoogle: (pendingProfile?: SignupProfileData) => Promise<void>;
  resetPasswordForEmail: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const PENDING_PROFILE_KEY = 'nuva_pending_profile';

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg === 'Invalid login credentials') return 'Correo o contraseña incorrectos.';
  if (msg === 'Email not confirmed') return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.';
  if (/only request this after/i.test(msg)) return 'Espera un momento antes de volver a intentar.';
  if (/Failed to fetch/i.test(msg)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
  return msg || 'Ocurrió un error inesperado.';
}

function stashPendingProfile(profile: SignupProfileData) {
  try {
    sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profile));
  } catch {
    // sessionStorage inaccesible — no bloqueante
  }
}

async function applyPendingProfileIfAny() {
  let raw: string | null = null;
  try {
    raw = sessionStorage.getItem(PENDING_PROFILE_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  try {
    await apiCall('PUT', '/api/profile', JSON.parse(raw));
    sessionStorage.removeItem(PENDING_PROFILE_KEY);
  } catch {
    // si falla (sin red), se reintenta en el próximo login — no se borra la key
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;
    (async () => {
      try {
        const { client, config } = await getSupabase();
        setTurnstileSiteKey(config.turnstileSiteKey);
        const { data } = await client.auth.getSession();
        setSession(data.session);
        if (data.session) await applyPendingProfileIfAny();
        setLoading(false);

        const { data: sub } = client.auth.onAuthStateChange(async (event, next) => {
          if (event === 'PASSWORD_RECOVERY') {
            setPasswordRecovery(true);
            return;
          }
          setSession(next);
          if (next) await applyPendingProfileIfAny();
        });
        unsub = () => sub.subscription.unsubscribe();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor.');
        setLoading(false);
      }
    })();
    return () => unsub?.();
  }, []);

  async function signInWithPassword(email: string, password: string, captchaToken?: string) {
    setError(null);
    try {
      const { client } = await getSupabase();
      const { error: signInError } = await client.auth.signInWithPassword({
        email,
        password,
        options: captchaToken ? { captchaToken } : undefined,
      });
      if (signInError) throw signInError;
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function signUp(email: string, password: string, profile: SignupProfileData, captchaToken?: string) {
    setError(null);
    try {
      const { client } = await getSupabase();
      const { data, error: signUpError } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: profile.ownerName },
          captchaToken,
        },
      });
      if (signUpError) throw signUpError;
      if (data.session) {
        // Ya hay sesión: guardamos el perfil ahora mismo en vez de dejarlo pendiente.
        try {
          await apiCall('PUT', '/api/profile', profile);
        } catch {
          stashPendingProfile(profile);
        }
        return { needsEmailConfirm: false };
      }
      // El proyecto pide confirmar el correo antes de poder entrar.
      stashPendingProfile(profile);
      return { needsEmailConfirm: true };
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function signInWithGoogle(pendingProfile?: SignupProfileData) {
    setError(null);
    try {
      if (pendingProfile) stashPendingProfile(pendingProfile);
      const { client } = await getSupabase();
      const { error: oauthError } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (oauthError) throw oauthError;
      // Supabase redirige el navegador a Google; no hay nada más que hacer acá.
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function resetPasswordForEmail(email: string) {
    setError(null);
    try {
      const { client } = await getSupabase();
      const { error: resetError } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      if (resetError) throw resetError;
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function updatePassword(password: string) {
    setError(null);
    try {
      const { client } = await getSupabase();
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      setPasswordRecovery(false);
      const { data } = await client.auth.getSession();
      setSession(data.session);
    } catch (e) {
      setError(friendlyError(e));
      throw e;
    }
  }

  async function signOut() {
    const { client } = await getSupabase();
    await client.auth.signOut();
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        error,
        turnstileSiteKey,
        passwordRecovery,
        signInWithPassword,
        signUp,
        signInWithGoogle,
        resetPasswordForEmail,
        updatePassword,
        signOut,
        clearError: () => setError(null),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

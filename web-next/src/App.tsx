import { useAuth } from './hooks/useAuth';
import { LoginPage } from './features/auth/LoginPage';
import { AppShell } from './features/shell/AppShell';

export default function App() {
  const { session, loading, passwordRecovery } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[var(--bg)]" />;
  }

  // Supabase abre una sesión temporal al volver del link de recuperación de
  // contraseña — hay que interceptarla y pedir la nueva contraseña, no entrar
  // directo a la app con ella (igual que auth.js#init).
  if (passwordRecovery) return <LoginPage initialMode="reset" />;

  return session ? <AppShell /> : <LoginPage />;
}

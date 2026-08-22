import { useQuery } from '@tanstack/react-query';
import { apiCall } from '../lib/api';
import type { AppState } from '../lib/types';
import { useAuth } from './useAuth';

// Reemplaza refreshAndRender() + setInterval(..., 15000) de public/js/app.js:
// mismo polling de 15s, pero TanStack Query se encarga de dedupe, pausa cuando la
// pestaña no está visible, y no reintenta a lo loco si el usuario está sin sesión.
export function useAppState() {
  const { session } = useAuth();

  return useQuery<AppState>({
    queryKey: ['state'],
    queryFn: () => apiCall<AppState>('GET', '/api/state'),
    enabled: !!session,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
}

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './hooks/useAuth';
import { applyTheme, getInitialTheme } from './lib/theme';

// Se fija antes del primer render (no en un useEffect) para que no haya flash de
// tema equivocado — mismo motivo por el que la app vieja lo hacía inline en <head>.
applyTheme(getInitialTheme());

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);

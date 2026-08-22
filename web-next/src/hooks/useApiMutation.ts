import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiCall } from '../lib/api';

// Toda mutación de NUVA responde con el registro afectado, pero la pantalla siempre
// necesita el estado completo actualizado (saldos que cambian en cascada, etc.) —
// igual que el app.js viejo, que llamaba fetchState() después de cada acción. Acá
// alcanza con invalidar ['state'] y dejar que TanStack Query la vuelva a pedir.
export function useApiMutation<TBody = unknown, TResult = unknown>(
  method: 'POST' | 'PUT' | 'DELETE',
  url: string | ((body: TBody) => string)
) {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TBody>({
    mutationFn: (body) => {
      const resolvedUrl = typeof url === 'function' ? url(body) : url;
      return apiCall<TResult>(method, resolvedUrl, method === 'DELETE' && body === undefined ? undefined : body);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['state'] });
    },
  });
}

import { useEffect, useState } from 'react';

// Usado para elegir entre patrones de interacción muy distintos (pila tipo wallet en
// mobile vs. scroll horizontal con snap en desktop, bottom sheet vs. modal centrado)
// donde alternar solo con clases de Tailwind no alcanza porque el marcado/JS también
// cambia, no solo el CSS.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

// Misma clave y misma lógica que initTheme()/applyTheme() en public/js/app.js:
// localStorage gana si existe; si no, se deriva de prefers-color-scheme — pero en
// cualquier caso se fija explícitamente en <html data-theme> (no se deja flotando
// a la media query sola), para que no haya parpadeo entre la carga y el primer render.
export const THEME_KEY = 'misFinanzasTheme';
export type Theme = 'light' | 'dark';

export function getInitialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // localStorage inaccesible (modo privado estricto, etc.) — cae al system pref
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

export function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // idem
  }
}

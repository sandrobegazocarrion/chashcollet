// Portado de categoryColorVarName()/categoryColor() en public/js/app.js: color fijo
// por categoría conocida, con respaldo determinístico por hash para las que el
// usuario cree él mismo.
const CATEGORY_COLOR_VARS: Record<string, string> = {
  Comida: '--red',
  Transporte: '--accent2',
  Hogar: '--amber',
  Entretenimiento: '--lavender',
  Salud: '--sage',
  Otros: '--ochre',
};
const FALLBACK_VARS = ['--red', '--accent2', '--amber', '--lavender', '--sage', '--ochre'];

export function categoryColorVar(category: string): string {
  if (CATEGORY_COLOR_VARS[category]) return CATEGORY_COLOR_VARS[category];
  let h = 0;
  for (let i = 0; i < category.length; i++) h = (h * 31 + category.charCodeAt(i)) >>> 0;
  return FALLBACK_VARS[h % FALLBACK_VARS.length];
}

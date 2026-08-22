// Portado de greetingText() en public/js/app.js.
export function greetingText(ownerName: string | null | undefined): string {
  const h = new Date().getHours();
  const base = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
  return ownerName ? `${base}, ${ownerName}` : base;
}

// Portado de las reglas de contraseña en public/js/auth.js: las 4 obligatorias
// (8+ caracteres, mayúscula, número, símbolo), no un "3 de 4" opcional.
const SYMBOL_RE = /[!@#$%^&*(),.?":{}|<>_\-+=]/;

export interface PasswordRuleResults {
  len: boolean;
  upper: boolean;
  num: boolean;
  sym: boolean;
}

export function passwordRuleResults(pw: string): PasswordRuleResults {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    num: /[0-9]/.test(pw),
    sym: SYMBOL_RE.test(pw),
  };
}

export function passwordMeetsAllRules(pw: string): boolean {
  const r = passwordRuleResults(pw);
  return r.len && r.upper && r.num && r.sym;
}

export function passwordStrength(pw: string): number {
  const r = passwordRuleResults(pw);
  return (r.len ? 1 : 0) + (r.upper ? 1 : 0) + (r.num ? 1 : 0) + (r.sym ? 1 : 0);
}

export const STRENGTH_LEVELS = [
  { pct: 25, colorVar: '--red', label: 'Débil' },
  { pct: 50, colorVar: '--red', label: 'Débil' },
  { pct: 75, colorVar: '--amber', label: 'Moderada' },
  { pct: 100, colorVar: '--green', label: 'Fuerte' },
] as const;

export const MIN_AGE_YEARS = 18;

export function ageFromBirthDate(raw: string): number | null {
  const d = new Date(`${raw}T00:00:00`);
  if (isNaN(d.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - d.getFullYear();
  const hadBirthdayThisYear = today.getMonth() > d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
  if (!hadBirthdayThisYear) age--;
  return age;
}

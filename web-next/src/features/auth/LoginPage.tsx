import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { BrandMark } from '../../components/brand/BrandMark';
import { FloatingMascot } from '../../components/ui/Mascot';
import { ageFromBirthDate, MIN_AGE_YEARS, passwordMeetsAllRules, passwordRuleResults, passwordStrength, STRENGTH_LEVELS } from '../../lib/passwordRules';
import type { SignupProfileData } from '../../hooks/useAuth';

type Mode = 'login' | 'signup' | 'forgot' | 'reset';

declare global {
  interface Window {
    turnstile?: {
      render: (el: string | HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

const todayMinus18 = () => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - MIN_AGE_YEARS);
  return d.toISOString().slice(0, 10);
};

// Split-screen (referencia: rediseño de Payoneer en Dribbble) con la identidad real
// de NUVA — mismos 4 modos y mismas reglas que public/js/auth.js (contraseña
// obligatoria 4/4, edad mínima 18, CAPTCHA de Turnstile si el server lo expone).
export function LoginPage({ initialMode = 'login' }: { initialMode?: Mode }) {
  const { signInWithPassword, signUp, signInWithGoogle, resetPasswordForEmail, updatePassword, turnstileSiteKey, error, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [ownerName, setOwnerName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const captchaRef = useRef<HTMLDivElement>(null);
  const captchaWidgetId = useRef<string | null>(null);
  const captchaToken = useRef<string | null>(null);

  function switchMode(next: Mode) {
    setMode(next);
    clearError();
    setLocalError(null);
    setNotice(null);
    setPassword('');
    setPasswordConfirm('');
  }

  // CAPTCHA: se renderiza perezoso al entrar a login/signup, se resetea cada vez
  // que se vuelve a mostrar el modo (el token de Turnstile es de un solo uso).
  useEffect(() => {
    if (!turnstileSiteKey || (mode !== 'login' && mode !== 'signup') || !captchaRef.current) return;
    let cancelled = false;
    function tryRender() {
      if (cancelled) return;
      if (!window.turnstile) {
        setTimeout(tryRender, 150);
        return;
      }
      if (captchaWidgetId.current !== null) {
        window.turnstile.reset(captchaWidgetId.current);
        captchaToken.current = null;
        return;
      }
      captchaWidgetId.current = window.turnstile.render(captchaRef.current!, {
        sitekey: turnstileSiteKey,
        callback: (token: string) => {
          captchaToken.current = token;
        },
        'expired-callback': () => {
          captchaToken.current = null;
        },
      });
    }
    tryRender();
    return () => {
      cancelled = true;
    };
  }, [turnstileSiteKey, mode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const pw = mode === 'signup' || mode === 'reset' ? password : '';
  const rules = passwordRuleResults(pw);
  const strengthScore = passwordStrength(pw);
  const strengthLevel = STRENGTH_LEVELS[Math.max(0, strengthScore - 1)] || STRENGTH_LEVELS[0];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLocalError(null);
    setNotice(null);
    if (cooldown > 0) return;
    setLoading(true);
    try {
      if (mode === 'signup') {
        const age = birthDate ? ageFromBirthDate(birthDate) : null;
        if (!ownerName.trim()) return setLocalError('Escribe tu nombre.');
        if (!birthDate) return setLocalError('Escribe tu fecha de nacimiento.');
        if (age === null) return setLocalError('Fecha de nacimiento inválida.');
        if (age < MIN_AGE_YEARS) return setLocalError(`Debes tener al menos ${MIN_AGE_YEARS} años para usar NUVA.`);
        if (!gender) return setLocalError('Selecciona una opción de género.');
        if (!passwordMeetsAllRules(password)) return setLocalError('Tu contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.');
        if (password !== passwordConfirm) return setLocalError('Las contraseñas no coinciden.');
        if (!terms) return setLocalError('Debes aceptar los Términos y Condiciones para crear tu cuenta.');
        if (!privacy) return setLocalError('Debes aceptar la Política de Privacidad para crear tu cuenta.');
        if (turnstileSiteKey && !captchaToken.current) return setLocalError('Completa la verificación de seguridad para continuar.');

        const profile: SignupProfileData = { ownerName: ownerName.trim(), birthDate, gender };
        const { needsEmailConfirm } = await signUp(email, password, profile, captchaToken.current || undefined);
        if (window.turnstile && captchaWidgetId.current !== null) window.turnstile.reset(captchaWidgetId.current);
        if (needsEmailConfirm) {
          setNotice('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
          switchMode('login');
        }
        // Si ya hay sesión, onAuthStateChange en useAuth ya se encarga de mostrar la app.
      } else if (mode === 'forgot') {
        await resetPasswordForEmail(email);
        setNotice('Listo. Si ese correo tiene una cuenta, te llegará un link para recuperar tu contraseña.');
      } else if (mode === 'reset') {
        if (password !== passwordConfirm) return setLocalError('Las contraseñas no coinciden.');
        if (!passwordMeetsAllRules(password)) return setLocalError('Tu contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.');
        await updatePassword(password);
      } else {
        if (turnstileSiteKey && !captchaToken.current) return setLocalError('Completa la verificación de seguridad para continuar.');
        await signInWithPassword(email, password, captchaToken.current || undefined);
        if (window.turnstile && captchaWidgetId.current !== null) window.turnstile.reset(captchaWidgetId.current);
        setFailedAttempts(0);
      }
    } catch {
      if (mode === 'login') {
        const next = failedAttempts + 1;
        if (next >= 5) {
          setCooldown(30);
          setFailedAttempts(0);
        } else {
          setFailedAttempts(next);
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setLocalError(null);
    clearError();
    if (mode === 'signup') {
      const age = birthDate ? ageFromBirthDate(birthDate) : null;
      if (!ownerName.trim()) return setLocalError('Escribe tu nombre.');
      if (!birthDate) return setLocalError('Escribe tu fecha de nacimiento.');
      if (age === null) return setLocalError('Fecha de nacimiento inválida.');
      if (age < MIN_AGE_YEARS) return setLocalError(`Debes tener al menos ${MIN_AGE_YEARS} años para usar NUVA.`);
      if (!gender) return setLocalError('Selecciona una opción de género.');
      if (!terms) return setLocalError('Debes aceptar los Términos y Condiciones para crear tu cuenta.');
      if (!privacy) return setLocalError('Debes aceptar la Política de Privacidad para crear tu cuenta.');
      try {
        await signInWithGoogle({ ownerName: ownerName.trim(), birthDate, gender });
      } catch {
        // el mensaje ya quedó en `error`
      }
      return;
    }
    try {
      await signInWithGoogle();
    } catch {
      // idem
    }
  }

  const shownError = localError || error;
  const showModeSwitch = mode === 'login' || mode === 'signup';

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[var(--sidebar-bg)] text-white">
      {/* Chas protagonista a pantalla completa (navy), la tarjeta del formulario
          flota encima superpuesta a sus piernas — así el texto nunca puede cruzarse
          con la mascota, porque la tarjeta tiene su propio fondo opaco. Mismo trazo
          del logo como marca de agua discreta que ya usaba AuthShowcase. */}
      <svg
        className="pointer-events-none absolute -bottom-24 -right-20 h-[480px] w-[480px] text-white opacity-[0.05] sm:h-[600px] sm:w-[600px]"
        viewBox="0 0 136.03 120.25"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M17.45,81.94c-1.55,4.69-6.61,7.24-11.3,5.7-4.69-1.55-7.24-6.61-5.7-11.3,4.08-12.36,8.15-24.71,12.23-37.07,3.62-5.5,10.03-8.51,16.57-7.76,6.55.74,12.12,5.11,14.41,11.28-.91-2.99-3.66-5.04-6.78-5.06-3.13-.02-5.9,1.99-6.86,4.97-4.19,13.08-8.38,26.17-12.57,39.25Z" />
        <path d="M54.82,35.24c-4.36-8.22-13.24-13-22.5-12.12-9.26.88-17.07,7.26-19.8,16.15,3.62-5.5,10.03-8.51,16.57-7.76,6.55.74,12.12,5.11,14.41,11.28,7.17,10.74,14.33,21.47,21.5,32.21,5.42,8.54,15,13.53,25.1,13.05,10.03-.47,19.29-6.13,23.75-15.28,6.58-13.17,13.17-26.33,19.75-39.5,5.68-11.36,1.08-25.17-10.28-30.85-11.36-5.68-25.17-1.08-30.85,10.28-5.42,10.85-10.85,21.7-16.27,32.55-1.93,3.55-.53,7.99,3.08,9.8s8.01.26,9.69-3.41l16.06-32.12c2.21-4.42,7.59-6.21,12.01-4,4.42,2.21,6.21,7.59,4,12.01-6.31,12.63-12.63,25.26-18.94,37.89-2.34,4.69-6.99,7.79-12.22,8.14-5.23.36-10.26-2.08-13.22-6.41-7.28-10.64-14.56-21.28-21.84-31.92Z" />
      </svg>

      <div className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10 sm:py-8">
        <div className="flex items-center gap-2">
          <BrandMark className="h-6 w-6 text-white" />
          <span className="text-base font-extrabold tracking-tight">NUVA</span>
        </div>
        {showModeSwitch && (
          <button
            type="button"
            onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
            className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            <i className={`ph ${mode === 'login' ? 'ph-user-plus' : 'ph-sign-in'}`} aria-hidden="true" />
            {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
          </button>
        )}
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-end px-6 pt-2 text-center">
        <p className="mb-2 text-[13px] font-semibold text-white/50">Todo tu dinero, un solo panel.</p>
        <FloatingMascot pose="listo-para-ayudarte" sizeClassName="w-48 h-48 sm:w-60 sm:h-60" />
      </div>

      <div className="relative z-10 mx-auto -mt-8 w-full max-w-md rounded-t-[2.5rem] bg-[var(--surface)] px-6 pb-8 pt-8 text-[var(--text)] shadow-[0_-24px_60px_-24px_rgba(0,0,0,0.5)] sm:mb-10 sm:rounded-[2.5rem] sm:px-10">
          <h1 className="mb-1 text-center text-[26px] font-extrabold tracking-tight text-[var(--text)]">
            {mode === 'login' && 'Inicia sesión'}
            {mode === 'signup' && 'Crea tu cuenta'}
            {mode === 'forgot' && 'Recuperar contraseña'}
            {mode === 'reset' && 'Nueva contraseña'}
          </h1>
          <p className="mb-7 text-center text-sm text-[var(--text-muted)]">
            {mode === 'login' && 'Entra para ver tus finanzas.'}
            {mode === 'signup' && 'Un minuto y estás dentro.'}
            {mode === 'forgot' && 'Te mandamos un link para volver a entrar.'}
            {mode === 'reset' && 'Elige una contraseña que no hayas usado antes.'}
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {mode === 'signup' && (
              <>
                <Input label="Nombre" required value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
                <Input label="Fecha de nacimiento" type="date" required max={todayMinus18()} value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
                <Select label="Género" required value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="" disabled>
                    Selecciona una opción
                  </option>
                  <option value="femenino">Femenino</option>
                  <option value="masculino">Masculino</option>
                  <option value="otro">Otro</option>
                  <option value="prefiero_no_decir">Prefiero no decir</option>
                </Select>
              </>
            )}

            {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
              <Input label="Correo o usuario" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            )}

            {(mode === 'login' || mode === 'signup' || mode === 'reset') && (
              <div className="flex flex-col gap-1.5">
                <div className="relative">
                  <Input
                    label="Contraseña"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="absolute bottom-2.5 right-3 text-[var(--text-faint)] hover:text-[var(--text-muted)]"
                  >
                    <i className={`ph ${showPassword ? 'ph-eye-slash' : 'ph-eye'}`} aria-hidden="true" />
                  </button>
                </div>
                {(mode === 'signup' || mode === 'reset') && password && (
                  <>
                    <div className="h-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--surface-raised)]">
                      <div className="h-full transition-all" style={{ width: `${strengthLevel.pct}%`, background: `var(${strengthLevel.colorVar})` }} />
                    </div>
                    {mode === 'signup' && (
                      <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                        {[
                          ['8+ caracteres', rules.len],
                          ['Una mayúscula', rules.upper],
                          ['Un número', rules.num],
                          ['Un símbolo', rules.sym],
                        ].map(([label, ok]) => (
                          <li key={label as string} className={`flex items-center gap-1.5 ${ok ? 'text-[var(--green)]' : 'text-[var(--text-faint)]'}`}>
                            <i className={`ph ${ok ? 'ph-check-circle' : 'ph-circle'}`} aria-hidden="true" />
                            {label}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}

            {(mode === 'signup' || mode === 'reset') && (
              <Input label="Confirmar contraseña" type={showPassword ? 'text' : 'password'} autoComplete="new-password" required value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} />
            )}

            {mode === 'signup' && (
              <div className="flex flex-col gap-2">
                <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                  <input type="checkbox" className="mt-0.5" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
                  Acepto los Términos y Condiciones.
                </label>
                <label className="flex items-start gap-2 text-xs text-[var(--text-muted)]">
                  <input type="checkbox" className="mt-0.5" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
                  Acepto la Política de Privacidad.
                </label>
              </div>
            )}

            {mode === 'login' && (
              <button type="button" onClick={() => switchMode('forgot')} className="-mt-2 self-end text-xs font-semibold text-[var(--brand)] hover:underline">
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {(mode === 'login' || mode === 'signup') && turnstileSiteKey && <div ref={captchaRef} />}

            {shownError && (
              <p className="text-sm text-[var(--red)]" role="alert">
                {shownError}
              </p>
            )}
            {notice && !shownError && (
              <p className="text-sm text-[var(--green)]" role="status">
                {notice}
              </p>
            )}

            <GradientButton type="submit" loading={loading} disabled={cooldown > 0} className="mt-1 w-full !py-3">
              {cooldown > 0 ? (
                `Espera ${cooldown}s`
              ) : (
                <>
                  <i className="ph ph-sign-in" aria-hidden="true" />
                  {mode === 'login' ? 'Entrar' : mode === 'signup' ? 'Crear cuenta' : mode === 'forgot' ? 'Enviar link de recuperación' : 'Actualizar contraseña'}
                </>
              )}
            </GradientButton>
          </form>

          {mode === 'forgot' && (
            <button type="button" onClick={() => switchMode('login')} className="mt-4 w-full text-center text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
              ← Volver a iniciar sesión
            </button>
          )}

          {(mode === 'login' || mode === 'signup') && (
            <>
              <div className="my-5 flex items-center gap-3 text-xs text-[var(--text-faint)]">
                <span className="h-px flex-1 bg-[var(--border)]" />o<span className="h-px flex-1 bg-[var(--border)]" />
              </div>
              <GradientButton variant="ghost" className="w-full" onClick={handleGoogle}>
                <i className="ph ph-google-logo" aria-hidden="true" />
                Continuar con Google
              </GradientButton>
            </>
          )}
      </div>

      <p className="relative z-10 hidden pb-6 text-center text-xs text-white/35 sm:block">
        © {new Date().getFullYear()} NUVA — hecho para tus finanzas en soles.
      </p>
    </div>
  );
}

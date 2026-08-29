import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { BrandMark } from '../../components/brand/BrandMark';
import { Mascot } from '../../components/ui/Mascot';
import { AuthShowcase } from './AuthShowcase';
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
    <div className="grid min-h-screen bg-[var(--bg)] lg:grid-cols-2">
      <AuthShowcase />

      <div className="relative flex flex-col overflow-hidden px-6 py-8 sm:px-12 sm:py-10 lg:px-16">
        {/* Chas de fondo, brazos abiertos, detrás del formulario — de la mano de
            marca del panel navy, ahora ella sola del lado de "Inicia sesión". Opacidad
            baja para que nunca compita con el contraste del texto de encima. */}
        <Mascot
          pose="listo-para-ayudarte"
          sizeClassName="w-[340px] h-[340px] sm:w-[400px] sm:h-[400px]"
          className="pointer-events-none absolute -bottom-20 left-1/2 z-0 -translate-x-1/2 opacity-[0.18]"
        />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-2 lg:hidden">
            <BrandMark className="h-6 w-6 text-[var(--brand)]" />
            <span className="text-base font-extrabold tracking-tight text-[var(--text)]">NUVA</span>
          </div>
          <span className="hidden lg:block" />
          {showModeSwitch && (
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'signup' : 'login')}
              className="flex items-center gap-1.5 rounded-[var(--radius-pill)] border border-[var(--border)] px-3.5 py-1.5 text-xs font-semibold text-[var(--text)] hover:bg-[var(--surface-raised)]"
            >
              <i className={`ph ${mode === 'login' ? 'ph-user-plus' : 'ph-sign-in'}`} aria-hidden="true" />
              {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          )}
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col justify-start py-8 lg:justify-center">
          <h1 className="mb-1 text-[26px] font-extrabold tracking-tight text-[var(--text)]">
            {mode === 'login' && 'Inicia sesión'}
            {mode === 'signup' && 'Crea tu cuenta'}
            {mode === 'forgot' && 'Recuperar contraseña'}
            {mode === 'reset' && 'Nueva contraseña'}
          </h1>
          <p className="mb-7 text-sm text-[var(--text-muted)]">
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
      </div>
    </div>
  );
}

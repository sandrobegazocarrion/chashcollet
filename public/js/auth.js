(function(){
  "use strict";

  let sb = null;
  let mode = 'login'; // 'login' | 'signup' | 'forgot' | 'reset'
  let failedAttempts = 0;
  let cooldownTimer = null;
  let captchaSiteKey = null;
  let captchaToken = null;
  let captchaWidgetId = null;

  const overlay = document.getElementById('authOverlay');
  const shell = document.getElementById('appShell');
  const form = document.getElementById('authForm');
  const emailField = document.getElementById('authEmailField');
  const emailInput = document.getElementById('authEmail');
  const passField = document.getElementById('authPasswordField');
  const passInput = document.getElementById('authPassword');
  const passConfirmField = document.getElementById('authPasswordConfirmField');
  const passConfirmInput = document.getElementById('authPasswordConfirm');
  const pwToggle = document.getElementById('authPwToggle');
  const pwStrength = document.getElementById('authPwStrength');
  const pwStrengthFill = document.getElementById('authPwStrengthFill');
  const pwStrengthLabel = document.getElementById('authPwStrengthLabel');
  const pwRules = document.getElementById('authPwRules');
  const pwRuleLen = document.getElementById('authPwRuleLen');
  const pwRuleUpper = document.getElementById('authPwRuleUpper');
  const pwRuleNum = document.getElementById('authPwRuleNum');
  const pwRuleSym = document.getElementById('authPwRuleSym');
  const errorBox = document.getElementById('authError');
  const submitBtn = document.getElementById('authSubmitBtn');
  const submitLabel = document.getElementById('authSubmitLabel');
  const submitSpinner = document.getElementById('authSubmitSpinner');
  const subtitle = document.getElementById('authSubtitle');
  const switchWrap = document.getElementById('authSwitchWrap');
  const switchLabel = document.getElementById('authSwitchLabel');
  const switchBtn = document.getElementById('authSwitchBtn');
  const backWrap = document.getElementById('authBackWrap');
  const backBtn = document.getElementById('authBackBtn');
  const termsField = document.getElementById('authTermsField');
  const termsCheck = document.getElementById('authTerms');
  const privacyField = document.getElementById('authPrivacyField');
  const privacyCheck = document.getElementById('authPrivacy');
  const forgotLinkWrap = document.getElementById('authForgotLinkWrap');
  const forgotBtn = document.getElementById('authForgotBtn');
  const googleBtn = document.getElementById('authGoogleBtn');
  const divider = document.getElementById('authDivider');
  const captchaField = document.getElementById('authCaptchaField');
  const nameField = document.getElementById('authNameField');
  const nameInput = document.getElementById('authName');
  const birthField = document.getElementById('authBirthField');
  const birthInput = document.getElementById('authBirthDate');
  const genderField = document.getElementById('authGenderField');
  const genderInput = document.getElementById('authGender');

  const PENDING_PROFILE_KEY = 'nuva_pending_profile';
  const MIN_AGE_YEARS = 18;

  function ageFromBirthDate(raw){
    const d = new Date(raw + 'T00:00:00');
    if(isNaN(d.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - d.getFullYear();
    const hadBirthdayThisYear = (today.getMonth() > d.getMonth()) ||
      (today.getMonth() === d.getMonth() && today.getDate() >= d.getDate());
    if(!hadBirthdayThisYear) age--;
    return age;
  }

  // Valida nombre/fecha/género del formulario de registro — se usa tanto para el
  // signup por correo como antes de mandar al usuario a Google, porque en ambos
  // casos queremos pedir estos datos al momento de registrarse, no después.
  function validateSignupProfileFields(){
    const name = nameInput.value.trim();
    if(!name) return { error: 'Escribe tu nombre.' };
    const birthDate = birthInput.value;
    if(!birthDate) return { error: 'Escribe tu fecha de nacimiento.' };
    const age = ageFromBirthDate(birthDate);
    if(age === null) return { error: 'Fecha de nacimiento inválida.' };
    if(age < MIN_AGE_YEARS) return { error: `Debes tener al menos ${MIN_AGE_YEARS} años para usar NUVA.` };
    const gender = genderInput.value;
    if(!gender) return { error: 'Selecciona una opción de género.' };
    return { data: { ownerName: name, birthDate, gender } };
  }

  // Google no entrega fecha de nacimiento/género de forma confiable, y la sesión
  // recién existe DESPUÉS de volver del redirect a Google — por eso estos datos se
  // guardan en sessionStorage antes de salir, y se aplican apenas vuelve con sesión.
  function stashPendingProfile(profileData){
    try{ sessionStorage.setItem(PENDING_PROFILE_KEY, JSON.stringify(profileData)); }catch(e){}
  }
  async function applyPendingProfileIfAny(){
    let raw = null;
    try{ raw = sessionStorage.getItem(PENDING_PROFILE_KEY); }catch(e){}
    if(!raw || !window.NUVA_API) return;
    try{
      await window.NUVA_API('PUT', '/api/profile', JSON.parse(raw));
      sessionStorage.removeItem(PENDING_PROFILE_KEY);
    }catch(e){
      // Si falla (ej. sin red), no se borra — se reintenta en el próximo login, y
      // como red de respaldo, el formulario "Completa tu perfil" de app.js lo
      // vuelve a pedir si de plano nunca se pudo guardar.
    }
  }

  function showAuth(){
    overlay.classList.add('open');
    if(shell) shell.style.display = 'none';
  }
  async function showApp(){
    overlay.classList.remove('open');
    if(shell) shell.style.display = '';
    await applyPendingProfileIfAny();
    window.__startNuvaApp && window.__startNuvaApp();
  }
  function setError(msg){
    if(!msg){ errorBox.style.display = 'none'; errorBox.textContent = ''; return; }
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }

  /* ---------------- Fortaleza de contraseña ---------------- */
  // Reglas obligatorias (no "3 de 4" opcional): mínimo 8 caracteres, mayúscula,
  // número y símbolo — las cuatro, siempre, por seguridad.
  const SYMBOL_RE = /[!@#$%^&*(),.?":{}|<>_\-+=]/;
  function passwordRuleResults(pw){
    return {
      len: pw.length >= 8,
      upper: /[A-Z]/.test(pw),
      num: /[0-9]/.test(pw),
      sym: SYMBOL_RE.test(pw)
    };
  }
  function passwordMeetsAllRules(pw){
    const r = passwordRuleResults(pw);
    return r.len && r.upper && r.num && r.sym;
  }
  function passwordStrength(pw){
    const r = passwordRuleResults(pw);
    return (r.len?1:0) + (r.upper?1:0) + (r.num?1:0) + (r.sym?1:0); // 0-4
  }
  function renderPasswordStrength(){
    const pw = passInput.value;
    if(!pw){ pwStrength.style.display = 'none'; pwRules.style.display = 'none'; return; }
    pwStrength.style.display = 'flex';
    const score = passwordStrength(pw);
    const levels = [
      { pct: 25,  color: 'var(--red, #e5484d)',   label: 'Débil' },
      { pct: 50,  color: 'var(--red, #e5484d)',   label: 'Débil' },
      { pct: 75,  color: '#e5a03d',                label: 'Moderada' },
      { pct: 100, color: 'var(--green, #2fa86b)',  label: 'Fuerte' }
    ];
    const lvl = levels[Math.max(0, score - 1)] || levels[0];
    pwStrengthFill.style.transform = `scaleX(${lvl.pct / 100})`;
    pwStrengthFill.style.background = lvl.color;
    pwStrengthLabel.textContent = lvl.label;
    pwStrengthLabel.style.color = lvl.color;

    // Checklist en vivo: solo tiene sentido en registro (en "reset" ya mostramos
    // la barra de fuerza, pero el checklist detallado ayuda más al crear la cuenta).
    if(mode === 'signup'){
      pwRules.style.display = 'grid';
      const r = passwordRuleResults(pw);
      [[pwRuleLen, r.len], [pwRuleUpper, r.upper], [pwRuleNum, r.num], [pwRuleSym, r.sym]].forEach(([el, ok]) => {
        el.classList.toggle('ok', ok);
        el.querySelector('i').className = ok ? 'ph ph-check-circle' : 'ph ph-circle';
      });
    } else {
      pwRules.style.display = 'none';
    }
  }
  passInput.addEventListener('input', () => {
    if(mode === 'signup' || mode === 'reset') renderPasswordStrength();
  });

  /* ---------------- Mostrar/ocultar contraseña ---------------- */
  pwToggle.addEventListener('click', () => {
    const showing = passInput.type === 'text';
    passInput.type = showing ? 'password' : 'text';
    if(passConfirmInput) passConfirmInput.type = passInput.type;
    pwToggle.innerHTML = showing ? '<i class="ph ph-eye"></i>' : '<i class="ph ph-eye-slash"></i>';
    pwToggle.setAttribute('aria-label', showing ? 'Mostrar contraseña' : 'Ocultar contraseña');
  });

  /* ---------------- CAPTCHA (Cloudflare Turnstile) ---------------- */
  // Se renderiza una sola vez, perezoso (recién al entrar a modo 'signup'), y se
  // resetea (nuevo token) cada vez que se vuelve a mostrar o tras cada intento —
  // el token de Turnstile es de un solo uso.
  function ensureCaptchaWidget(){
    if(!captchaSiteKey) return;
    if(captchaWidgetId !== null){
      if(window.turnstile) window.turnstile.reset(captchaWidgetId);
      captchaToken = null;
      return;
    }
    const tryRender = () => {
      if(!window.turnstile){ setTimeout(tryRender, 150); return; }
      captchaWidgetId = window.turnstile.render('#authCaptcha', {
        sitekey: captchaSiteKey,
        callback: (token) => { captchaToken = token; },
        'expired-callback': () => { captchaToken = null; },
        'error-callback': () => { captchaToken = null; }
      });
    };
    tryRender();
  }

  function setMode(next){
    mode = next;
    setError(null);
    clearCooldown();
    passInput.value = '';
    if(passConfirmInput) passConfirmInput.value = '';
    pwStrength.style.display = 'none';
    pwRules.style.display = 'none';

    // Visibilidad de campos por modo — todos parten ocultos y cada modo prende lo suyo.
    emailField.style.display = 'none';
    passField.style.display = 'none';
    passConfirmField.style.display = 'none';
    termsField.style.display = 'none';
    privacyField.style.display = 'none';
    forgotLinkWrap.style.display = 'none';
    switchWrap.style.display = 'none';
    backWrap.style.display = 'none';
    googleBtn.style.display = 'none';
    divider.style.display = 'none';
    captchaField.style.display = 'none';
    nameField.style.display = 'none';
    birthField.style.display = 'none';
    genderField.style.display = 'none';
    emailInput.required = false;
    passInput.required = false;
    termsCheck.checked = false;
    privacyCheck.checked = false;
    nameInput.value = '';
    birthInput.value = '';
    genderInput.value = '';

    if(mode === 'login'){
      subtitle.textContent = 'Inicia sesión para ver tus finanzas.';
      submitLabel.textContent = 'Entrar';
      switchLabel.textContent = '¿No tienes cuenta?';
      switchBtn.textContent = 'Regístrate';
      passInput.setAttribute('autocomplete', 'current-password');
      emailField.style.display = 'block'; emailInput.required = true;
      passField.style.display = 'block'; passInput.required = true;
      forgotLinkWrap.style.display = 'block';
      switchWrap.style.display = 'flex';
      googleBtn.style.display = 'flex';
      divider.style.display = 'flex';
      // CAPTCHA también en login, no solo en registro: un contador de intentos en
      // JS se reinicia con solo refrescar la página, así que no protege de verdad
      // contra fuerza bruta — el token de Turnstile sí, porque lo valida Supabase
      // en su propio servidor en cada intento, sin importar el estado del cliente.
      if(captchaSiteKey){ captchaField.style.display = 'block'; ensureCaptchaWidget(); }
    } else if(mode === 'signup'){
      subtitle.textContent = 'Crea tu cuenta para empezar a usar NUVA.';
      submitLabel.textContent = 'Crear cuenta';
      switchLabel.textContent = '¿Ya tienes cuenta?';
      switchBtn.textContent = 'Inicia sesión';
      passInput.setAttribute('autocomplete', 'new-password');
      nameField.style.display = 'block';
      emailField.style.display = 'block'; emailInput.required = true;
      passField.style.display = 'block'; passInput.required = true;
      passConfirmField.style.display = 'block';
      birthField.style.display = 'block';
      genderField.style.display = 'block';
      { const max = new Date(); max.setFullYear(max.getFullYear() - MIN_AGE_YEARS); birthInput.max = max.toISOString().slice(0, 10); }
      termsField.style.display = 'flex';
      privacyField.style.display = 'flex';
      switchWrap.style.display = 'flex';
      googleBtn.style.display = 'flex';
      divider.style.display = 'flex';
      if(captchaSiteKey){ captchaField.style.display = 'block'; ensureCaptchaWidget(); }
    } else if(mode === 'forgot'){
      subtitle.textContent = 'Te mandamos un link para volver a entrar.';
      submitLabel.textContent = 'Enviar link de recuperación';
      emailField.style.display = 'block'; emailInput.required = true;
      backWrap.style.display = 'flex';
    } else if(mode === 'reset'){
      subtitle.textContent = 'Elige tu nueva contraseña.';
      submitLabel.textContent = 'Actualizar contraseña';
      passInput.setAttribute('autocomplete', 'new-password');
      passField.style.display = 'block'; passInput.required = true;
      passConfirmField.style.display = 'block';
    }
  }

  /* ---------------- Cooldown tras intentos fallidos ---------------- */
  function clearCooldown(){
    if(cooldownTimer){ clearInterval(cooldownTimer); cooldownTimer = null; }
    submitBtn.disabled = false;
  }
  function startCooldown(seconds){
    let left = seconds;
    submitBtn.disabled = true;
    const baseLabel = submitLabel.textContent;
    const tick = () => {
      setError(`Demasiados intentos. Espera ${left}s e intenta de nuevo.`);
      left--;
      if(left < 0){
        clearInterval(cooldownTimer); cooldownTimer = null;
        submitBtn.disabled = false;
        setError(null);
      }
    };
    tick();
    cooldownTimer = setInterval(tick, 1000);
  }

  /* ---------------- Timeout de red ---------------- */
  function withTimeout(promise, ms = 10000){
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
    ]);
  }

  function friendlyError(err){
    const msg = (err && err.message) || '';
    if(msg === 'TIMEOUT') return 'El servidor no responde. Intenta de nuevo.';
    if(msg === 'Invalid login credentials') return 'Correo o contraseña incorrectos.';
    if(msg === 'Email not confirmed') return 'Debes confirmar tu correo antes de iniciar sesión. Revisa tu bandeja de entrada.';
    if(/only request this after/i.test(msg)) return 'Espera un momento antes de volver a intentar.';
    if(/Failed to fetch/i.test(msg)) return 'No se pudo conectar con el servidor. Revisa tu conexión.';
    return msg || 'Ocurrió un error inesperado.';
  }

  function setLoading(loading){
    submitBtn.disabled = loading;
    submitSpinner.style.display = loading ? 'inline-block' : 'none';
  }

  async function init(){
    let cfg;
    try{
      const apiBase = (window.NUVA_CONFIG && window.NUVA_CONFIG.apiBase) || '';
      cfg = await (await fetch(apiBase + '/api/config')).json();
    }catch(e){
      setError('No se pudo conectar con el servidor.');
      showAuth();
      return;
    }
    if(!cfg.supabaseUrl || !cfg.supabaseAnonKey){
      setError('El servidor todavía no tiene configurado Supabase.');
      showAuth();
      return;
    }
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    captchaSiteKey = cfg.turnstileSiteKey || null;

    sb.auth.onAuthStateChange((event, session) => {
      // Supabase abre una sesión temporal al volver del link de recuperación de
      // contraseña — hay que interceptarla y pedir la nueva contraseña, no entrar
      // directo a la app con ella.
      if(event === 'PASSWORD_RECOVERY'){
        setMode('reset');
        showAuth();
        return;
      }
      if(session) showApp(); else showAuth();
    });

    const { data } = await sb.auth.getSession();
    if(data && data.session) showApp(); else showAuth();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const email = emailInput.value.trim();
    const password = passInput.value;
    try{
      if(mode === 'signup'){
        const profileCheck = validateSignupProfileFields();
        if(profileCheck.error){ setError(profileCheck.error); return; }
        if(!passwordMeetsAllRules(password)){
          setError('Tu contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un símbolo.');
          return;
        }
        if(password !== passConfirmInput.value){
          setError('Las contraseñas no coinciden.');
          return;
        }
        if(!termsCheck.checked){
          setError('Debes aceptar los Términos y Condiciones para crear tu cuenta.');
          return;
        }
        if(!privacyCheck.checked){
          setError('Debes aceptar la Política de Privacidad para crear tu cuenta.');
          return;
        }
        if(captchaSiteKey && !captchaToken){
          setError('Completa la verificación de seguridad para continuar.');
          return;
        }
        const signUpOptions = {};
        if(captchaToken) signUpOptions.captchaToken = captchaToken;
        signUpOptions.data = { full_name: profileCheck.data.ownerName };
        const { data, error } = await withTimeout(sb.auth.signUp({ email, password, options: signUpOptions }));
        ensureCaptchaWidget(); // token de un solo uso: renovar apenas se usa, haya salido bien o mal
        if(error) throw error;
        if(data.session){
          // Ya hay sesión de una: se puede guardar el perfil ahora mismo, en vez de
          // dejarlo pendiente para cuando vuelva a entrar.
          if(window.NUVA_API){
            try{ await window.NUVA_API('PUT', '/api/profile', profileCheck.data); }catch(e){}
          } else {
            stashPendingProfile(profileCheck.data);
          }
          // onAuthStateChange ya se encarga de mostrar la app.
        } else {
          // El proyecto pide confirmar el correo antes de poder entrar — el perfil
          // se guarda recién cuando vuelva con sesión real (ver showApp/init).
          stashPendingProfile(profileCheck.data);
          setError('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
          setMode('login');
        }
      } else if(mode === 'forgot'){
        const { error } = await withTimeout(sb.auth.resetPasswordForEmail(email, {
          redirectTo: location.origin + location.pathname
        }));
        if(error) throw error;
        setError('Listo. Si ese correo tiene una cuenta, te llegará un link para recuperar tu contraseña.');
      } else if(mode === 'reset'){
        if(password !== passConfirmInput.value){
          setError('Las contraseñas no coinciden.');
          return;
        }
        const { error } = await withTimeout(sb.auth.updateUser({ password }));
        if(error) throw error;
        setError(null);
        // updateUser no dispara un evento de sesión nuevo por sí solo; la sesión de
        // recuperación ya está activa, así que mostramos la app directamente.
        showApp();
      } else {
        if(captchaSiteKey && !captchaToken){
          setError('Completa la verificación de seguridad para continuar.');
          return;
        }
        const signInOptions = {};
        if(captchaToken) signInOptions.captchaToken = captchaToken;
        const { error } = await withTimeout(sb.auth.signInWithPassword({ email, password, options: signInOptions }));
        ensureCaptchaWidget(); // token de un solo uso: renovar apenas se usa, haya salido bien o mal
        if(error) throw error;
        failedAttempts = 0;
      }
    }catch(err){
      if(mode === 'login'){
        failedAttempts++;
        if(failedAttempts >= 5){
          startCooldown(30);
          failedAttempts = 0;
          setLoading(false);
          return;
        }
      }
      setError(friendlyError(err));
    }finally{
      setLoading(false);
    }
  });

  switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));
  forgotBtn.addEventListener('click', () => setMode('forgot'));
  backBtn.addEventListener('click', () => setMode('login'));

  googleBtn.addEventListener('click', async () => {
    if(!sb) return;
    setError(null);
    // Google no entrega fecha de nacimiento/género, y queremos pedirlos al momento
    // de registrarse igual que por correo — se validan y se guardan pendientes
    // ANTES de salir a Google (la página se recarga al volver, se pierde todo lo
    // que no esté en sessionStorage).
    if(mode === 'signup'){
      const profileCheck = validateSignupProfileFields();
      if(profileCheck.error){ setError(profileCheck.error); return; }
      if(!termsCheck.checked){
        setError('Debes aceptar los Términos y Condiciones para crear tu cuenta.');
        return;
      }
      if(!privacyCheck.checked){
        setError('Debes aceptar la Política de Privacidad para crear tu cuenta.');
        return;
      }
      stashPendingProfile(profileCheck.data);
    }
    try{
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
      if(error) throw error;
      // Supabase redirige el navegador a Google; no hay nada más que hacer acá.
    }catch(err){
      setError(friendlyError(err));
    }
  });

  window.NUVA_AUTH = {
    async getAccessToken(){
      if(!sb) return null;
      const { data } = await sb.auth.getSession();
      return data && data.session ? data.session.access_token : null;
    },
    async signOut(){
      if(sb) await sb.auth.signOut();
    },
    async handleUnauthorized(){
      // Un 401 puntual puede ser una carrera de tiempo (ej. justo tras registrarte,
      // antes de que la sesión termine de propagarse) — no cerramos sesión a ciegas.
      // Solo si Supabase ya no tiene sesión en serio, mostramos el login de nuevo.
      if(!sb) return;
      const { data } = await sb.auth.getSession();
      if(!data || !data.session) showAuth();
    }
  };

  init();
})();

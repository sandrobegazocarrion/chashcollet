(function(){
  "use strict";

  let sb = null;
  let mode = 'login'; // 'login' | 'signup' | 'forgot' | 'reset'
  let failedAttempts = 0;
  let cooldownTimer = null;

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
  const forgotLinkWrap = document.getElementById('authForgotLinkWrap');
  const forgotBtn = document.getElementById('authForgotBtn');
  const googleBtn = document.getElementById('authGoogleBtn');
  const divider = document.getElementById('authDivider');

  function showAuth(){
    overlay.classList.add('open');
    if(shell) shell.style.display = 'none';
  }
  function showApp(){
    overlay.classList.remove('open');
    if(shell) shell.style.display = '';
    window.__startNuvaApp && window.__startNuvaApp();
  }
  function setError(msg){
    if(!msg){ errorBox.style.display = 'none'; errorBox.textContent = ''; return; }
    errorBox.textContent = msg;
    errorBox.style.display = 'block';
  }

  /* ---------------- Fortaleza de contraseña ---------------- */
  function passwordStrength(pw){
    let score = 0;
    if(pw.length >= 8) score++;
    if(/[A-Z]/.test(pw)) score++;
    if(/[0-9]/.test(pw)) score++;
    if(/[!@#$%^&*(),.?":{}|<>_\-+=]/.test(pw)) score++;
    return score; // 0-4
  }
  function renderPasswordStrength(){
    const pw = passInput.value;
    if(!pw){ pwStrength.style.display = 'none'; return; }
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

  function setMode(next){
    mode = next;
    setError(null);
    clearCooldown();
    passInput.value = '';
    if(passConfirmInput) passConfirmInput.value = '';
    pwStrength.style.display = 'none';

    // Visibilidad de campos por modo — todos parten ocultos y cada modo prende lo suyo.
    emailField.style.display = 'none';
    passField.style.display = 'none';
    passConfirmField.style.display = 'none';
    termsField.style.display = 'none';
    forgotLinkWrap.style.display = 'none';
    switchWrap.style.display = 'none';
    backWrap.style.display = 'none';
    googleBtn.style.display = 'none';
    divider.style.display = 'none';
    emailInput.required = false;
    passInput.required = false;
    termsCheck.checked = false;

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
    } else if(mode === 'signup'){
      subtitle.textContent = 'Crea tu cuenta para empezar a usar NUVA.';
      submitLabel.textContent = 'Crear cuenta';
      switchLabel.textContent = '¿Ya tienes cuenta?';
      switchBtn.textContent = 'Inicia sesión';
      passInput.setAttribute('autocomplete', 'new-password');
      emailField.style.display = 'block'; emailInput.required = true;
      passField.style.display = 'block'; passInput.required = true;
      termsField.style.display = 'flex';
      switchWrap.style.display = 'flex';
      googleBtn.style.display = 'flex';
      divider.style.display = 'flex';
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
        if(!termsCheck.checked){
          setError('Debes aceptar los Términos y la Política de Privacidad para crear tu cuenta.');
          return;
        }
        const { data, error } = await withTimeout(sb.auth.signUp({ email, password }));
        if(error) throw error;
        if(!data.session){
          // El proyecto pide confirmar el correo antes de poder entrar.
          setError('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
          setMode('login');
        }
        // Si data.session existe, onAuthStateChange ya se encarga de mostrar la app.
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
        const { error } = await withTimeout(sb.auth.signInWithPassword({ email, password }));
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

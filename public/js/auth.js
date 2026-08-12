(function(){
  "use strict";

  let sb = null;
  let mode = 'login'; // 'login' | 'signup'

  const overlay = document.getElementById('authOverlay');
  const shell = document.getElementById('appShell');
  const form = document.getElementById('authForm');
  const emailInput = document.getElementById('authEmail');
  const passInput = document.getElementById('authPassword');
  const errorBox = document.getElementById('authError');
  const submitBtn = document.getElementById('authSubmitBtn');
  const subtitle = document.getElementById('authSubtitle');
  const switchLabel = document.getElementById('authSwitchLabel');
  const switchBtn = document.getElementById('authSwitchBtn');
  const termsField = document.getElementById('authTermsField');
  const termsCheck = document.getElementById('authTerms');

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
  function setMode(next){
    mode = next;
    setError(null);
    if(mode === 'signup'){
      subtitle.textContent = 'Crea tu cuenta para empezar a usar NUVA.';
      submitBtn.textContent = 'Crear cuenta';
      switchLabel.textContent = '¿Ya tienes cuenta?';
      switchBtn.textContent = 'Inicia sesión';
      passInput.setAttribute('autocomplete', 'new-password');
      termsField.style.display = 'flex';
    } else {
      subtitle.textContent = 'Inicia sesión para ver tus finanzas.';
      submitBtn.textContent = 'Entrar';
      switchLabel.textContent = '¿No tienes cuenta?';
      switchBtn.textContent = 'Regístrate';
      passInput.setAttribute('autocomplete', 'current-password');
      termsField.style.display = 'none';
      termsCheck.checked = false;
    }
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

    sb.auth.onAuthStateChange((_event, session) => {
      if(session) showApp(); else showAuth();
    });

    const { data } = await sb.auth.getSession();
    if(data && data.session) showApp(); else showAuth();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setError(null);
    submitBtn.disabled = true;
    const email = emailInput.value.trim();
    const password = passInput.value;
    try{
      if(mode === 'signup'){
        if(!termsCheck.checked){
          setError('Debes aceptar los Términos y la Política de Privacidad para crear tu cuenta.');
          submitBtn.disabled = false;
          return;
        }
        const { data, error } = await sb.auth.signUp({ email, password });
        if(error) throw error;
        if(!data.session){
          // El proyecto pide confirmar el correo antes de poder entrar.
          setError('Cuenta creada. Revisa tu correo para confirmarla antes de iniciar sesión.');
          setMode('login');
        }
        // Si data.session existe, onAuthStateChange ya se encarga de mostrar la app.
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if(error) throw error;
      }
    }catch(err){
      setError(err.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : err.message);
    }finally{
      submitBtn.disabled = false;
    }
  });

  switchBtn.addEventListener('click', () => setMode(mode === 'login' ? 'signup' : 'login'));

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

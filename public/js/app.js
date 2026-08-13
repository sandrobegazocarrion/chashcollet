(function(){
  "use strict";

  /* ---------------- API client ---------------- */
  let data = { accounts:[], pockets:[], transactions:[], categories:[], cardPayments:[], deudas:[], deudaPayments:[] };

  function setConn(ok){
    const dot = document.getElementById('connDot');
    const label = document.getElementById('connLabel');
    dot.className = 'conn-dot ' + (ok ? 'ok' : 'bad');
    label.lastChild.textContent = ok ? 'En línea' : 'Sin conexión con el servidor';
  }

  async function apiCall(method, url, body){
    const headers = body !== undefined ? {'Content-Type':'application/json'} : {};
    // window.NUVA_AUTH lo expone public/js/auth.js (cargado antes que este script).
    const token = window.NUVA_AUTH && await window.NUVA_AUTH.getAccessToken();
    if(token) headers['Authorization'] = 'Bearer ' + token;
    // window.NUVA_CONFIG lo expone public/js/config.js — vacío en local (mismo origen),
    // la URL del backend en Railway/Render cuando el frontend está en Vercel.
    const apiBase = (url.startsWith('/api') && window.NUVA_CONFIG && window.NUVA_CONFIG.apiBase) || '';
    const res = await fetch(apiBase + url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if(res.status === 401 && window.NUVA_AUTH){
      window.NUVA_AUTH.handleUnauthorized();
    }
    let json = null;
    try{ json = await res.json(); }catch(e){}
    if(!res.ok){
      throw new Error((json && json.error) || 'Error de conexión con el servidor');
    }
    return json;
  }
  // public/js/wizard.js corre por fuera de este IIFE y necesita el mismo cliente
  // autenticado (token + apiBase) en vez de reimplementarlo aparte.
  window.NUVA_API = apiCall;

  async function fetchState(){
    data = await apiCall('GET', '/api/state');
    setConn(true);
  }

  // Obligatorio tras el primer login (correo o Google, Google no entrega estos datos
  // de forma confiable) — bloquea el dashboard hasta completarse.
  let _profileGateWired = false;
  function needsProfileCompletion(){
    return !data.profile || !data.profile.birthDate || !data.profile.gender;
  }
  function showProfileGate(){
    const overlay = document.getElementById('profileOverlay');
    if(!overlay) return;
    const dateInput = document.getElementById('profileBirthDate');
    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() - 18);
    dateInput.max = maxDate.toISOString().slice(0, 10);
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if(_profileGateWired) return;
    _profileGateWired = true;
    const form = document.getElementById('profileForm');
    const errorBox = document.getElementById('profileError');
    const submitBtn = document.getElementById('profileSubmitBtn');
    const spinner = document.getElementById('profileSubmitSpinner');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorBox.style.display = 'none';
      submitBtn.disabled = true;
      spinner.style.display = 'inline-block';
      try{
        const birthDate = dateInput.value;
        const gender = document.getElementById('profileGender').value;
        await apiCall('PUT', '/api/profile', { birthDate, gender });
        overlay.classList.remove('open');
        document.body.style.overflow = '';
        await fetchState();
        window.NUVA_TOUR && window.NUVA_TOUR.maybeStart(data);
      }catch(err){
        errorBox.textContent = err.message || 'No se pudo guardar tu perfil.';
        errorBox.style.display = 'block';
      }finally{
        submitBtn.disabled = false;
        spinner.style.display = 'none';
      }
    });
  }

  let _wizardChecked = false;
  async function refreshAndRender(){
    try{
      await fetchState();
    }catch(e){
      setConn(false);
      toast('No se pudo conectar con el servidor local');
      return;
    }
    renderAll();
    if(!_wizardChecked){
      _wizardChecked = true;
      if(needsProfileCompletion()) showProfileGate();
      else window.NUVA_TOUR && window.NUVA_TOUR.maybeStart(data);
    }
  }

  function todayStr(){
    return new Date().toISOString().slice(0,10);
  }

  function formatMoney(n){
    n = Number(n) || 0;
    const sign = n < 0 ? '-' : '';
    n = Math.abs(n);
    return sign + 'S/ ' + n.toLocaleString('es-PE', {minimumFractionDigits:2, maximumFractionDigits:2});
  }

  function formatDate(iso){
    if(!iso) return '';
    const [y,m,d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  // Los toasts de éxito/info se cierran solos (rango recomendado 3-5s); un error
  // sobre un guardado que falló no se autodestruye — se queda hasta que el usuario
  // lo cierra o hasta el siguiente aviso, porque perder el motivo del error es un
  // riesgo real en una app que es el registro financiero real de alguien.
  // `onUndo`, si se pasa, muestra un botón "Deshacer" y da 5s antes de auto-cerrar.
  let _toastUndoHandler = null;
  function toast(msg, type, onUndo){
    const t = document.getElementById('toast');
    const isError = type === 'error';
    document.getElementById('toastMsg').textContent = msg;
    document.getElementById('toastIcon').className = 'ph ' + (isError ? 'ph-warning-circle' : 'ph-check-circle');
    t.classList.toggle('error', isError);
    t.classList.toggle('has-undo', !!onUndo);
    _toastUndoHandler = onUndo || null;
    // role="alert" fuerza el anuncio inmediato en lectores de pantalla para errores;
    // "status" con aria-live="polite" espera a que el usuario termine lo que hacía.
    t.setAttribute('role', isError ? 'alert' : 'status');
    t.setAttribute('aria-live', isError ? 'assertive' : 'polite');
    t.classList.add('show');
    clearTimeout(toast._tid);
    if(!isError){
      toast._tid = setTimeout(()=> t.classList.remove('show'), onUndo ? 5000 : 4000);
    }
  }
  document.getElementById('toastClose').addEventListener('click', ()=>{
    clearTimeout(toast._tid);
    document.getElementById('toast').classList.remove('show');
  });
  document.getElementById('toastUndo').addEventListener('click', async ()=>{
    const handler = _toastUndoHandler;
    _toastUndoHandler = null;
    clearTimeout(toast._tid);
    document.getElementById('toast').classList.remove('show');
    if(handler) await handler();
  });

  /* ---------------- Errores en línea por campo ---------------- */
  function setFieldError(inputId, message){
    const el = document.getElementById(inputId);
    if(!el) return;
    clearFieldError(inputId);
    const msgId = inputId + 'Error';
    el.classList.add('field-invalid');
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', msgId);
    const msgEl = document.createElement('div');
    msgEl.className = 'field-error-msg';
    msgEl.id = msgId;
    msgEl.dataset.for = inputId;
    msgEl.setAttribute('role', 'alert');
    msgEl.innerHTML = `<i class="ph ph-warning-circle"></i><span>${escapeHtml(message)}</span>`;
    el.insertAdjacentElement('afterend', msgEl);
    el.focus();
  }
  function clearFieldError(inputId){
    const el = document.getElementById(inputId);
    if(el){ el.classList.remove('field-invalid'); el.removeAttribute('aria-invalid'); el.removeAttribute('aria-describedby'); }
    const msgEl = document.querySelector(`.field-error-msg[data-for="${inputId}"]`);
    if(msgEl) msgEl.remove();
  }
  function clearFormErrors(formEl){
    if(!formEl) return;
    formEl.querySelectorAll('.field-invalid').forEach(el=>{
      el.classList.remove('field-invalid');
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    });
    formEl.querySelectorAll('.field-error-msg').forEach(el=>el.remove());
  }
  // Al tocar de nuevo un campo marcado como inválido, su error desaparece solo.
  ['input','change'].forEach(evt=>{
    document.body.addEventListener(evt, (e)=>{
      if(e.target.classList && e.target.classList.contains('field-invalid')) clearFieldError(e.target.id);
    });
  });

  /* ---------------- Theme ---------------- */
  const THEME_KEY = 'misFinanzasTheme';
  function applyTheme(theme){
    document.documentElement.setAttribute('data-theme', theme);
    document.getElementById('themeToggle').innerHTML = `<i class="ph ${theme === 'dark' ? 'ph-sun' : 'ph-moon'}"></i>`;
  }
  function initTheme(){
    const saved = localStorage.getItem(THEME_KEY);
    const theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
  }
  document.getElementById('themeToggle').addEventListener('click', ()=>{
    const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
    renderDashboard();
  });
  initTheme();

  function isDarkTheme(){
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  /* ---------------- Sidebar ---------------- */
  const _sidebar    = document.getElementById('sidebar');
  const _sbBackdrop = document.getElementById('sbBackdrop');
  const _sbCloseBtn = document.getElementById('sbClose');

  // En escritorio el sidebar es un riel angosto de solo íconos siempre visible (el CSS lo
  // fuerza visible). En móvil se oculta del todo (superpuesto con fondo oscuro).
  function openSidebar(){ _sidebar.classList.add('open'); _sbBackdrop.classList.add('open'); }
  function closeSidebar(){ _sidebar.classList.remove('open'); _sbBackdrop.classList.remove('open'); }
  function toggleSidebar(){ _sidebar.classList.contains('open') ? closeSidebar() : openSidebar(); }

  document.getElementById('hamburger').addEventListener('click', toggleSidebar);
  _sbCloseBtn.addEventListener('click', closeSidebar);
  _sbBackdrop.addEventListener('click', closeSidebar);

  /* ---------------- Navigation ---------------- */
  const PAGE_TITLES = {
    dashboard:'Inicio', transacciones:'Historial', cuentas:'Cuentas',
    tarjeta:'Tarjetas de crédito', bolsillos:'Metas', servicios:'Servicios',
    prestamos:'Préstamos', calendario:'Pagos', admin:'Administración'
  };

  function greetingText(){
    const h = new Date().getHours();
    const base = h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
    const name = data.profile && data.profile.ownerName;
    return name ? `${base}, ${name}` : base;
  }

  function switchTab(tabKey){
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-item[data-tab="${tabKey}"]`);
    if(navBtn) navBtn.classList.add('active');
    const panel = document.getElementById('tab-' + tabKey);
    if(panel) panel.classList.add('active');
    const titleEl = document.getElementById('pageTitle');
    if(titleEl) titleEl.textContent = tabKey === 'dashboard' ? greetingText() : (PAGE_TITLES[tabKey] || tabKey);
    if(tabKey === 'admin') renderAdminUsers();
    if(window.innerWidth < 860) closeSidebar();
  }

  /* ---------------- Admin (solo visible/usable si data.profile.isAdmin) ---------------- */
  function renderAdminNav(){
    const navBtn = document.querySelector('.nav-admin-only');
    if(navBtn) navBtn.style.display = (data.profile && data.profile.isAdmin) ? 'flex' : 'none';
  }
  const SUB_STATUS_LABELS = {
    sin_suscripcion: { label: 'Sin suscripción', cls: '' },
    trialing: { label: 'Período de prueba', cls: '' },
    active: { label: 'Pagado', cls: 'success' },
    past_due: { label: 'Pago vencido', cls: 'danger' },
    canceled: { label: 'Cancelada', cls: 'danger' },
    inactive: { label: 'Sin suscripción', cls: '' }
  };

  let _adminUsersLoaded = false;
  async function renderAdminUsers(force){
    if(_adminUsersLoaded && !force) return;
    const listEl = document.getElementById('adminUsersList');
    const emptyEl = document.getElementById('adminUsersEmpty');
    if(!listEl) return;
    try{
      const { users } = await apiCall('GET', '/api/admin/users');
      _adminUsersLoaded = true;
      if(!users.length){
        listEl.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
      }
      emptyEl.style.display = 'none';
      listEl.innerHTML = users.map(u => {
        const sub = SUB_STATUS_LABELS[u.subscriptionStatus] || SUB_STATUS_LABELS.sin_suscripcion;
        return `
        <div class="admin-user-row" data-user-id="${escapeHtml(u.id)}">
          <div class="aur-main">
            <div class="aur-email">${escapeHtml(u.email || '(sin correo)')}</div>
            <div class="aur-sub">${escapeHtml(u.ownerName || 'Sin nombre')} · Registrado ${formatDate((u.createdAt||'').slice(0,10))}</div>
          </div>
          <div class="aur-badges">
            <span class="status-pill ${u.setupCompleted?'success':''}">${u.setupCompleted?'Perfil completo':'Perfil incompleto'}</span>
            <span class="status-pill ${sub.cls}">${sub.label}</span>
            ${u.isAdmin ? '<span class="status-pill success">Admin</span>' : ''}
            ${u.suspended ? '<span class="status-pill danger">Suspendida</span>' : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-action="${u.suspended?'admin-unsuspend':'admin-suspend'}" data-user-id="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email||'')}">${u.suspended?'Reactivar':'Suspender'}</button>
            <button type="button" class="btn btn-danger btn-sm" data-action="admin-delete" data-user-id="${escapeHtml(u.id)}" data-email="${escapeHtml(u.email||'')}">Eliminar</button>
          </div>
        </div>
      `;
      }).join('');
      listEl.querySelectorAll('[data-action="admin-suspend"]').forEach(btn => {
        btn.addEventListener('click', () => handleAdminSuspendClick(btn, true));
      });
      listEl.querySelectorAll('[data-action="admin-unsuspend"]').forEach(btn => {
        btn.addEventListener('click', () => handleAdminSuspendClick(btn, false));
      });
      listEl.querySelectorAll('[data-action="admin-delete"]').forEach(btn => {
        btn.addEventListener('click', () => handleAdminDeleteClick(btn));
      });
    }catch(err){
      listEl.innerHTML = '';
      emptyEl.textContent = err.message || 'No se pudo cargar la lista de usuarios.';
      emptyEl.style.display = 'block';
    }
  }
  async function handleAdminSuspendClick(btn, suspending){
    const userId = btn.dataset.userId;
    const email = btn.dataset.email;
    if(suspending && !confirm(`¿Suspender la cuenta de ${email}? No podrá iniciar sesión hasta que la reactives.`)) return;
    btn.disabled = true;
    try{
      await apiCall('POST', `/api/admin/users/${userId}/${suspending?'suspend':'unsuspend'}`);
      toast(suspending ? 'Cuenta suspendida' : 'Cuenta reactivada');
      await renderAdminUsers(true);
    }catch(err){
      toast(err.message, 'error');
      btn.disabled = false;
    }
  }
  async function handleAdminDeleteClick(btn){
    const userId = btn.dataset.userId;
    const email = btn.dataset.email;
    const typed = await promptDialog({
      title: 'Eliminar cuenta permanentemente',
      label: `Esto borra TODOS los datos de ${email} (cuentas, movimientos, metas, todo) sin poder deshacerlo. Escribe el correo exacto para confirmar:`,
      placeholder: email,
      confirmLabel: 'Eliminar'
    });
    if(typed !== email) {
      if(typed !== null) toast('El correo no coincide, no se eliminó nada.', 'error');
      return;
    }
    btn.disabled = true;
    try{
      await apiCall('DELETE', `/api/admin/users/${userId}`);
      toast('Cuenta eliminada');
      await renderAdminUsers(true);
    }catch(err){
      toast(err.message, 'error');
      btn.disabled = false;
    }
  }

  document.getElementById('sbNav').addEventListener('click', (e)=>{
    const btn = e.target.closest('.nav-item[data-tab]');
    if(!btn) return;
    switchTab(btn.dataset.tab);
  });

  /* ---------------- Modal helpers ---------------- */
  const modalOverlay = document.getElementById('modalOverlay');
  const modalDialog = document.getElementById('modalDialog');
  const modalBody = document.getElementById('modalBody');
  const modalCloseBtn = document.getElementById('modalClose');
  let _modalReturnFocusTo = null;
  modalCloseBtn.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e)=>{ if(e.target === modalOverlay) closeModal(); });

  function focusableIn(container){
    return Array.from(container.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null);
  }

  function openModal(html){
    modalBody.innerHTML = html;
    modalOverlay.classList.add('open');
    _modalReturnFocusTo = document.activeElement;
    const heading = modalBody.querySelector('h3, h2');
    if(heading){
      if(!heading.id) heading.id = 'modalDialogTitle';
      modalDialog.setAttribute('aria-labelledby', heading.id);
    } else {
      modalDialog.removeAttribute('aria-labelledby');
    }
    // El primer campo editable recibe el foco; si no hay ninguno, el diálogo mismo.
    const firstField = modalBody.querySelector('input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])');
    (firstField || modalDialog).focus({ preventScroll: true });
  }
  function closeModal(){
    modalOverlay.classList.remove('open');
    modalBody.innerHTML = '';
    if(_modalReturnFocusTo && document.body.contains(_modalReturnFocusTo)) _modalReturnFocusTo.focus();
    _modalReturnFocusTo = null;
  }
  document.addEventListener('keydown', (e)=>{
    if(!modalOverlay.classList.contains('open')) return;
    if(e.key === 'Escape'){ closeModal(); return; }
    if(e.key === 'Tab'){
      const focusable = focusableIn(modalDialog);
      if(focusable.length === 0){ e.preventDefault(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){
        e.preventDefault(); last.focus();
      } else if(!e.shiftKey && document.activeElement === last){
        e.preventDefault(); first.focus();
      }
    }
  });

  /* ---------------- Confirm dialog helper (replaces native confirm()) ---------------- */
  const confirmOverlay = document.getElementById('confirmOverlay');
  const confirmTitleEl = document.getElementById('confirmTitle');
  const confirmMessageEl = document.getElementById('confirmMessage');
  const confirmCancelBtn = document.getElementById('confirmCancel');
  const confirmOkBtn = document.getElementById('confirmOk');
  let _confirmOnOk = null;
  let _confirmOnCancel = null;
  let _confirmReturnFocusTo = null;

  // Devuelve una Promise<boolean> (true si se confirmó) además de soportar el
  // callback onConfirm existente, para poder usarse como reemplazo directo
  // de prompt()/confirm() nativos con `await`.
  function openConfirm({ title = 'Confirmar', message, confirmLabel = 'Eliminar', onConfirm }){
    return new Promise((resolve)=>{
      confirmTitleEl.textContent = title;
      confirmMessageEl.textContent = message;
      confirmOkBtn.textContent = confirmLabel;
      _confirmOnOk = async ()=>{
        if(onConfirm) await onConfirm();
        resolve(true);
      };
      _confirmOnCancel = ()=> resolve(false);
      _confirmReturnFocusTo = document.activeElement;
      confirmOverlay.classList.add('open');
      // El foco inicial va en Cancelar, no en Eliminar: así un Enter reflejo
      // después de abrir el diálogo no dispara la acción destructiva por error.
      confirmCancelBtn.focus();
    });
  }
  function closeConfirm(){
    confirmOverlay.classList.remove('open');
    _confirmOnOk = null;
    if(_confirmOnCancel){ const cancel = _confirmOnCancel; _confirmOnCancel = null; cancel(); }
    if(_confirmReturnFocusTo && document.body.contains(_confirmReturnFocusTo)) _confirmReturnFocusTo.focus();
    _confirmReturnFocusTo = null;
  }
  confirmCancelBtn.addEventListener('click', closeConfirm);
  confirmOkBtn.addEventListener('click', async ()=>{
    const action = _confirmOnOk;
    _confirmOnCancel = null; // se resuelve vía action(), no vía la rama de cancelar
    closeConfirm();
    if(action) await action();
  });
  confirmOverlay.addEventListener('click', (e)=>{ if(e.target === confirmOverlay) closeConfirm(); });
  document.addEventListener('keydown', (e)=>{
    if(!confirmOverlay.classList.contains('open')) return;
    if(e.key === 'Escape'){ closeConfirm(); return; }
    // Trampa de foco simple: el diálogo solo tiene dos botones tabulables.
    if(e.key === 'Tab'){
      e.preventDefault();
      (document.activeElement === confirmCancelBtn ? confirmOkBtn : confirmCancelBtn).focus();
    }
  });

  /* ---------------- Prompt dialog helper (replaces native prompt()) ---------------- */
  // Overlay propio, separado del modal principal, para poder usarse también
  // desde selects que viven dentro de un modal ya abierto (ej. categoría en
  // "Editar transacción") sin pisar el contenido de ese modal.
  const promptOverlay = document.getElementById('promptOverlay');
  const promptTitleEl = document.getElementById('promptTitle');
  const promptLabelEl = document.getElementById('promptLabel');
  const promptInputEl = document.getElementById('promptInput');
  const promptForm = document.getElementById('promptForm');
  const promptCancelBtn = document.getElementById('promptCancel');
  let _promptReturnFocusTo = null;
  let _promptResolve = null;

  function promptDialog({ title = 'Ingresa un valor', label = '', placeholder = '', confirmLabel = 'Guardar' }){
    return new Promise((resolve)=>{
      promptTitleEl.textContent = title;
      promptLabelEl.textContent = label;
      promptInputEl.value = '';
      promptInputEl.placeholder = placeholder;
      _promptResolve = resolve;
      _promptReturnFocusTo = document.activeElement;
      promptOverlay.classList.add('open');
      promptInputEl.focus();
    });
  }
  function closePrompt(value){
    promptOverlay.classList.remove('open');
    if(_promptReturnFocusTo && document.body.contains(_promptReturnFocusTo)) _promptReturnFocusTo.focus();
    _promptReturnFocusTo = null;
    const resolve = _promptResolve;
    _promptResolve = null;
    if(resolve) resolve(value);
  }
  promptCancelBtn.addEventListener('click', ()=> closePrompt(null));
  promptOverlay.addEventListener('click', (e)=>{ if(e.target === promptOverlay) closePrompt(null); });
  promptForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    closePrompt(promptInputEl.value.trim() || null);
  });
  document.addEventListener('keydown', (e)=>{
    if(!promptOverlay.classList.contains('open')) return;
    if(e.key === 'Escape'){ closePrompt(null); return; }
    if(e.key === 'Tab'){
      const focusable = focusableIn(promptOverlay.querySelector('.confirm-box'));
      if(focusable.length === 0) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if(e.shiftKey && document.activeElement === first){
        e.preventDefault(); last.focus();
      } else if(!e.shiftKey && document.activeElement === last){
        e.preventDefault(); first.focus();
      }
    }
  });

  /* ---------------- Category select builder ---------------- */
  function categoryOptionsHtml(selected){
    let html = data.categories.map(c => `<option value="${escapeHtml(c)}" ${c===selected?'selected':''}>${escapeHtml(c)}</option>`).join('');
    html += `<option value="__new__">+ Nueva categoría...</option>`;
    return html;
  }

  function bindCategorySelect(selectEl){
    selectEl.addEventListener('change', async ()=>{
      if(selectEl.value === '__new__'){
        const name = await promptDialog({
          title: 'Nueva categoría',
          label: 'Nombre de la categoría',
          placeholder: 'Ej: Mascotas',
          confirmLabel: 'Crear categoría'
        });
        if(name){
          try{
            const res = await apiCall('POST', '/api/categories', { name });
            if(!data.categories.includes(res.category)) data.categories.push(res.category);
            selectEl.innerHTML = categoryOptionsHtml(res.category);
          }catch(e){
            toast(e.message, 'error');
            selectEl.value = data.categories[0] || '';
          }
        } else {
          selectEl.value = data.categories[0] || '';
        }
      }
    });
  }

  const ACC_TYPE_LABEL = { ahorro: 'Ahorro', corriente: 'Corriente', efectivo: 'Efectivo', tarjeta: 'Tarjeta' };

  function accountOptionsHtml(selected){
    if(data.accounts.length === 0) return `<option value="">Crea una cuenta primero</option>`;
    return data.accounts.map(a => {
      const locked = lockedAccountPocket(a.id);
      return `<option value="${a.id}" ${a.id===selected?'selected':''}>${escapeHtml(a.name)} (${ACC_TYPE_LABEL[a.type]||a.type})${locked?' 🔒 apartada':''}</option>`;
    }).join('');
  }

  const NETWORK_LABELS = { visa:'Visa', mastercard:'Mastercard', amex:'American Express', diners:'Diners Club', otra:'Otra' };

  const PERUVIAN_BANKS = {
    bcp:{ label:'BCP', cls:'bank-bcp' },
    bbva:{ label:'BBVA', cls:'bank-bbva' },
    interbank:{ label:'Interbank', cls:'bank-interbank' },
    scotiabank:{ label:'Scotiabank', cls:'bank-scotiabank' },
    banbif:{ label:'BanBif', cls:'bank-banbif' },
    pichincha:{ label:'Pichincha', cls:'bank-pichincha' },
    mibanco:{ label:'Mibanco', cls:'bank-mibanco' },
    nacion:{ label:'Nación', cls:'bank-nacion' },
    otra:{ label:'Otro banco', cls:'bank-otra' }
  };
  function bankBadgeHtml(bankCode){
    if(!bankCode || !PERUVIAN_BANKS[bankCode]) return '';
    const b = PERUVIAN_BANKS[bankCode];
    return `<span class="bank-badge ${b.cls}"><span class="dot"></span>${b.label}</span>`;
  }
  function bankOptionsHtml(selected){
    return `<option value="">Sin banco específico</option>` +
      Object.keys(PERUVIAN_BANKS).map(k=>`<option value="${k}" ${k===selected?'selected':''}>${PERUVIAN_BANKS[k].label}</option>`).join('');
  }

  function networkBadgeHtml(network){
    if(!network) return '';
    if(network === 'mastercard'){
      return `<span class="net-badge net-mastercard" title="Mastercard"><span class="mc-circles"><span></span><span></span></span></span>`;
    }
    return `<span class="net-badge net-${network}"><span class="dot"></span>${(NETWORK_LABELS[network]||'Tarjeta').toUpperCase()}</span>`;
  }
  function networkOptionsHtml(selected){
    return Object.keys(NETWORK_LABELS).map(k => `<option value="${k}" ${k===selected?'selected':''}>${NETWORK_LABELS[k]}</option>`).join('');
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  /* ---------------- RENDER: Dashboard ---------------- */
  let lineChartInst = null, doughnutChartInst = null;

  function computeTotals(){
    let totalIngresos = 0, totalGastos = 0;
    data.transactions.forEach(tx=>{
      if(tx.type === 'ingreso') totalIngresos += tx.amount;
      else totalGastos += tx.amount;
    });
    const totalDeuda = data.accounts.filter(a=>a.type==='tarjeta').reduce((s,a)=>s+a.balance,0);
    const totalLiquid = data.accounts.filter(a=>a.type!=='tarjeta').reduce((s,a)=>s+a.balance,0);
    const totalBolsillos = data.pockets.reduce((s,p)=>s+p.balance,0);
    const totalAhorrado = totalLiquid + totalBolsillos;
    const balance = totalIngresos - totalGastos;
    return { totalIngresos, totalGastos, balance, totalDeuda, totalAhorrado, totalLiquid };
  }

  // Próxima fecha en que cae un día de mes (1-31) recurrente, desde hoy inclusive.
  function nextOccurrence(dueDay, today){
    const y = today.getFullYear(), m = today.getMonth();
    const daysInThisMonth = new Date(y, m+1, 0).getDate();
    let candidate = new Date(y, m, Math.min(dueDay, daysInThisMonth));
    if(candidate < today){
      const daysInNextMonth = new Date(y, m+2, 0).getDate();
      candidate = new Date(y, m+1, Math.min(dueDay, daysInNextMonth));
    }
    return candidate;
  }

  // daysAhead=Infinity trae TODO lo declarado (Inicio); un número acota la ventana (alertas).
  // Cada item incluye kind+tab para poder enlazar directo a su pestaña desde Inicio.
  function computeUpcomingPayments(daysAhead){
    const today = new Date(); today.setHours(0,0,0,0);
    const monthKey = todayStr().slice(0,7);
    const paidDeudaIds = new Set((data.deudaPayments||[]).filter(p=>p.month===monthKey).map(p=>p.deudaId));

    const items = [];
    (data.reminders||[]).forEach(r=>{
      const date = nextOccurrence(r.dueDay, today);
      const days = Math.round((date-today)/86400000);
      if(days <= daysAhead) items.push({ name:r.name, amount:r.amount||0, days, kind:'reminder', tab:'calendario' });
    });
    (data.deudas||[]).forEach(d=>{
      const date = nextOccurrence(d.dueDay, today);
      const occMonthKey = date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0');
      if(occMonthKey === monthKey && paidDeudaIds.has(d.id)) return;
      const days = Math.round((date-today)/86400000);
      const isPrestamo = d.type === 'prestamo';
      if(days <= daysAhead) items.push({ name:d.name, amount:d.amount||0, days, kind:isPrestamo?'bankloan':'servicio', tab:isPrestamo?'prestamos':'servicios' });
    });
    data.accounts.filter(a=>a.type==='tarjeta' && a.billingDay).forEach(c=>{
      const date = nextOccurrence(c.billingDay, today);
      const days = Math.round((date-today)/86400000);
      if(days <= daysAhead && c.balance > 0) items.push({ name:'Tarjeta '+c.name, amount:c.balance, days, kind:'tarjeta', tab:'tarjeta' });
    });
    (data.personLoans||[]).filter(p=>!p.paid && p.dueDate).forEach(p=>{
      const date = new Date(p.dueDate+'T00:00:00');
      const days = Math.round((date-today)/86400000);
      if(days <= daysAhead){
        const verbo = p.direction==='debo' ? 'Pagar a' : 'Cobrar a';
        items.push({ name:`${verbo} ${p.personName}`, amount:p.amount, days, kind:'personloan', tab:'prestamos' });
      }
    });

    items.sort((a,b)=>a.days-b.days);
    return { items, total: items.reduce((s,i)=>s+i.amount,0) };
  }

  function renderDashboard(){
    const titleEl = document.getElementById('pageTitle');
    if(titleEl && document.getElementById('tab-dashboard').classList.contains('active')) titleEl.textContent = greetingText();
    const t = computeTotals();

    const now = new Date();
    const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    let monthIn = 0, monthOut = 0;
    data.transactions.forEach(tx=>{
      if(!tx.date || tx.date.slice(0,7) !== monthKey) return;
      if(tx.type==='ingreso') monthIn += tx.amount; else monthOut += tx.amount;
    });
    const monthNet = monthIn - monthOut;
    const savingsRate = monthIn > 0 ? Math.round((monthNet/monthIn)*100) : null;

    // Patrimonio neto (hero) — SOLO lo que tenemos si o si (líquido en cuentas).
    // La deuda de tarjeta y de préstamos ya no se resta acá: cada una vive en su
    // propia pestaña, y mezclarlas aquí era justo lo repetitivo que se quería evitar.
    document.getElementById('netWorthHero').innerHTML = `
      <div class="hero-main">
        <p class="hero-label">Lo que tengo</p>
        <p class="hero-value num">${formatMoney(t.totalLiquid)}</p>
        <span class="delta-chip ${monthNet>=0?'up':'down'}"><i class="ph ${monthNet>=0?'ph-trend-up':'ph-trend-down'}"></i><span class="num">${monthNet>=0?'+':''}${formatMoney(monthNet)}</span> · flujo neto de este mes</span>
      </div>
    `;

    // Mini-tarjetas: la más urgente entre lo pendiente (servicios, tarjetas, préstamos)
    // como alerta puntual — el listado completo vive en Pagos (calendario), no acá — y una
    // promo fija del bot de Telegram.
    const upcomingAll = computeUpcomingPayments(Infinity);
    const urgent = upcomingAll.items.find(i=>i.days<=2) || upcomingAll.items[0];
    const alertText = !urgent
      ? 'No tienes pagos pendientes declarados por ahora.'
      : urgent.days < 0
        ? `${escapeHtml(urgent.name)} está vencido hace ${-urgent.days} día${-urgent.days===1?'':'s'} · ${formatMoney(urgent.amount)}.`
        : urgent.days === 0
          ? `${escapeHtml(urgent.name)} vence hoy · ${formatMoney(urgent.amount)}.`
          : `${escapeHtml(urgent.name)} vence en ${urgent.days} día${urgent.days===1?'':'s'} · ${formatMoney(urgent.amount)}.`;
    document.getElementById('dashMiniRow').innerHTML = `
      <button type="button" class="mini-card" data-action="switch-tab" data-tab="${urgent?urgent.tab:'calendario'}">
        <span class="mini-icon"><i class="ph ph-calendar-blank"></i></span>
        <p class="mini-title">${urgent ? 'Vence pronto' : 'Al día'}</p>
        <p class="mini-text">${alertText}</p>
        <span class="mini-link">Ir al calendario <i class="ph ph-arrow-right"></i></span>
      </button>
      <button type="button" class="mini-card dark" data-action="open-settings">
        <span class="mini-icon"><i class="ph ph-telegram-logo"></i></span>
        <p class="mini-title">Bot de Telegram</p>
        <p class="mini-text">Registra gastos y consulta tu resumen sin abrir la app.</p>
        <span class="mini-link">Ver cómo conectarlo <i class="ph ph-arrow-right"></i></span>
      </button>
    `;

    // Fila secundaria: comparación de ingresos/gastos, gasto seguro hoy, tasa de ahorro
    const total = monthIn + monthOut;
    const inPct = total > 0 ? Math.round((monthIn/total)*100) : (monthIn===0 && monthOut===0 ? 50 : (monthIn>0 ? 100 : 0));
    const outPct = 100 - inPct;
    const monthLabel = now.toLocaleDateString('es-PE',{month:'long',year:'numeric'});

    // Gasto seguro hoy: líquido menos lo que ya está comprometido este mes (pagos
    // pendientes + tarjeta) menos lo que aún falta apartar para las metas de Chanchito.
    // A diferencia del patrimonio neto, esto sí descuenta el ahorro pendiente del mes,
    // así que responde "¿cuánto puedo gastar sin comprometer lo que ya me propuse ahorrar?".
    const pocketsRemaining = data.pockets.reduce((s,p)=>{
      if(!p.monthlyTarget) return s;
      const mp = pocketMonthProgress(p);
      return s + Math.max(0, mp.target - mp.saved);
    }, 0);
    const safeToSpend = t.totalLiquid - t.totalDeuda - pocketsRemaining;

    document.getElementById('statsRow').innerHTML = `
      <div class="card month-compare-card">
        <div class="mc-head">
          <span class="mc-title">${monthLabel.charAt(0).toUpperCase()+monthLabel.slice(1)}</span>
          <button type="button" class="mc-balance" style="color:${monthNet>=0?'var(--green)':'var(--red)'};background:none;border:none;font-family:inherit;cursor:pointer;" data-action="open-subview" data-view="balance">${monthNet>=0?'+':''}${formatMoney(monthNet)}</button>
        </div>
        <div class="mc-bar-wrap">
          <div class="mc-bar-in" style="width:${inPct}%"></div>
          <div class="mc-bar-out" style="width:${outPct}%"></div>
        </div>
        <div class="mc-labels">
          <button type="button" class="mc-label in" data-action="open-subview" data-view="ingresos">↑ <span class="num">${formatMoney(monthIn)}</span><span class="mc-sub">Ingresos del mes</span></button>
          <button type="button" class="mc-label out" style="text-align:right;" data-action="open-subview" data-view="gastos">↓ <span class="num">${formatMoney(monthOut)}</span><span class="mc-sub">Gastos del mes</span></button>
        </div>
      </div>
      <div class="card summary-card safe" title="Líquido − pagos pendientes del mes − ahorro que aún falta apartar en tus chanchitos">
        <div class="label">Balance disponible</div>
        <div class="value num" style="color:${safeToSpend>=0?'var(--green)':'var(--red)'}">${formatMoney(safeToSpend)}</div>
      </div>
      <div class="card summary-card rate"><div class="label">Tasa de ahorro</div><div class="value num">${savingsRate===null?'—':savingsRate+'%'}</div></div>
    `;

    renderTip();
    renderActivity();
    renderCharts();
    renderObjectivesPanel();
  }

  const SAVINGS_TIPS = [
    '💡 Ahorra primero y gasta después — destina el 20% de tu ingreso a ahorros antes de cualquier gasto.',
    '💡 Espera 24 horas antes de cualquier compra impulsiva. Si al día siguiente aún lo quieres, evalúalo.',
    '💡 Registra cada gasto, incluso los más pequeños. Los cafés y snacks diarios suman cientos al mes.',
    '💡 Usa la regla 50/30/20: 50% necesidades, 30% deseos, 20% ahorros. Simple y efectiva.',
    '💡 Automatiza tus ahorros transfiriendo dinero apenas recibes tu sueldo, no al final del mes.',
    '💡 Paga siempre el total de tu tarjeta de crédito para evitar intereses que crecen rápidamente.',
    '💡 Ponle nombre y monto a cada meta de ahorro — es más fácil mantenerse motivado con un objetivo claro.',
    '💡 Un pequeño ahorro constante todos los meses supera a un gran ahorro ocasional.',
    '💡 Antes de gastar, pregúntate: ¿esto me acerca o me aleja de mi meta financiera?',
    '💡 Cada vez que evitas un gasto impulsivo, transfiere ese dinero a tu ahorro para verlo crecer.',
    '💡 Revisa tus gastos por categoría cada semana — no esperes al cierre del mes para descubrir sorpresas.',
    '💡 El interés compuesto es tu mejor aliado: mientras antes empieces a ahorrar, más crecerá tu dinero.',
    '💡 Compara precios antes de comprar — unos minutos de búsqueda pueden ahorrarte bastante.',
    '💡 Negocia tus servicios: internet, seguros y membresías suelen dar descuentos si simplemente pides.',
    '💡 Cocinar en casa puede costar 3 veces menos que comer fuera — y es más saludable.',
    '💡 Evita pagar solo el mínimo de tarjeta de crédito — así solo pagas intereses y la deuda no termina.',
    '💡 Cancela una suscripción antes de contratar otra — las que olvidamos son dinero perdido cada mes.',
    '💡 Planifica tu lista del supermercado antes de ir — reduces el gasto innecesario hasta en un 30%.',
    '💡 Un fondo de emergencia de 3 a 6 meses de gastos es tu red de seguridad financiera más importante.',
    '💡 Diferencia entre "querer" y "necesitar" antes de cada compra importante — la respuesta cambia todo.',
    '💡 Lleva un diario financiero semanal: 10 minutos revisando tus gastos transforma tus hábitos en 30 días.',
    '💡 Usar efectivo para gastos discrecionales hace más visible cuánto gastas — pruébalo un mes.',
    '💡 Paga tus deudas de mayor a menor tasa de interés — así ahorras más en intereses totales.',
    '💡 Si recibes un ingreso extra como bono, destina al menos el 50% a ahorros o pago de deudas.',
    '💡 Compra artículos de temporada cuando la temporada termina — los descuentos pueden ser del 50-70%.',
    '💡 Aprende a decir no a gastos sociales que no puedes pagar — tus finanzas deben ser tu prioridad.',
    '💡 Revisa tu plan de celular mensualmente — muchas veces pagas por servicios que ya no usas.',
    '💡 Usa aplicaciones de cashback y cupones para compras que harías de todas formas.',
    '💡 Un presupuesto no es una restricción, es un plan que te da libertad para gastar sin culpa.',
    '💡 Invertir en tu salud es el ahorro más inteligente — prevenir enfermedades es mucho más barato.',
    '💡 Antes de endeudarte, calcula cuántos días de trabajo necesitas para pagar esa deuda.',
    '💡 Los gastos pequeños se acumulan: S/ 10 al día en café son más de S/ 3,600 al año.',
    '💡 Diversifica tus fuentes de ingreso — depender de uno solo es el mayor riesgo financiero personal.',
    '💡 El mejor momento para empezar a ahorrar fue ayer; el segundo mejor momento es exactamente hoy.',
    '💡 La educación financiera es la inversión con el mayor retorno posible — lee, aprende, aplica.',
    '💡 Compra activos, no pasivos: cosas que generen valor a futuro, no que lo pierdan con el tiempo.',
    '💡 Usa tu tarjeta de crédito solo para compras que ya tienes el dinero en efectivo para pagar.',
    '💡 Revisa tus seguros anualmente — podrías estar pagando de más o por coberturas que no necesitas.',
    '💡 El precio por unidad importa más que el precio total — compara costos por kilo, litro o uso.',
    '💡 Ten claro tu número: ¿cuánto necesitas ahorrar para ser financieramente libre? Escríbelo.',
    '💡 Los gastos hormiga (pequeños y frecuentes) pueden llevarse hasta el 20% de tu ingreso sin que lo notes.',
    '💡 Invertir en habilidades que aumenten tus ingresos es el activo más seguro que existe.',
    '💡 Separa tus cuentas: una para gastos fijos, otra para ahorro y otra para gastos variables.',
    '💡 Planifica tus viajes con anticipación — los precios de vuelos y hoteles suben cerca de la fecha.',
    '💡 No compres por emoción negativa. Si estás triste o estresado, espera antes de abrir la billetera.',
    '💡 El lujo de hoy puede ser la deuda de mañana — vive bien dentro de tus posibilidades reales.',
    '💡 Revisa los estados de cuenta mensualmente para detectar cobros no autorizados o errores.',
    '💡 Ahorra el aumento salarial — si vivías sin ese dinero extra, no lo extrañarás si lo guardas.',
    '💡 La gratificación diferida — saber esperar por lo que quieres — es la habilidad financiera más poderosa.',
    '💡 Un carro económico en mantenimiento es mejor que uno lujoso que vacía tu cuenta cada mes.',
    '💡 Compra de segunda mano lo que no necesita ser nuevo: electrónicos, muebles y ropa en buen estado.',
    '💡 Los libros de finanzas personales y los videos educativos gratuitos son tu mejor inversión de tiempo.',
    '💡 No confundas precio con valor — lo barato que compras dos veces termina saliendo más caro.',
    '💡 Antes de reemplazar, repara. Muchos productos duran mucho más con un pequeño mantenimiento.',
    '💡 Calcula el costo en horas de trabajo de tus compras. ¿Vale la pena trabajar X horas por esto?',
    '💡 Ten un presupuesto para diversión — ser frugal no significa privarte de todo, sino elegir bien.',
    '💡 Reduce gastos de energía en casa: apaga luces, desenchufa aparatos — el ahorro es constante.',
    '💡 El seguro de salud es un ahorro, no un gasto — una emergencia médica puede arruinar tus finanzas.',
    '💡 Compra en cantidad lo que consumes mucho y tiene larga vida útil cuando hay descuentos.',
    '💡 Antes de ir al supermercado, come algo — las compras con hambre siempre salen más caras.',
    '💡 Haz un inventario antes de comprar algo nuevo — evita tener duplicados de cosas que ya tienes.',
    '💡 El tiempo libre es valioso — evalúa si un servicio que pagas realmente te ahorra suficiente tiempo.',
    '💡 Compara bancos y entidades financieras — las tasas de interés en ahorros varían mucho entre ellos.',
    '💡 La mejor inversión es eliminar deudas con altos intereses — libera flujo de caja inmediatamente.',
    '💡 No financies lo que se consume: comida, ropa y entretenimiento no deben comprarse a crédito.',
    '💡 Habla de dinero en familia — los objetivos financieros compartidos se alcanzan más fácilmente.',
    '💡 Configura alertas de gasto en tu banco — saber en tiempo real cuánto gastas cambia tus hábitos.',
    '💡 El marketing está diseñado para hacerte gastar — sé consciente de las estrategias que te rodean.',
    '💡 Cuando algo pasa de moda rápidamente, probablemente no valía la pena comprarlo desde el inicio.',
    '💡 Calcula tu patrimonio neto cada mes — activos menos deudas. Si crece, vas exactamente por buen camino.',
    '💡 Tener una meta específica hace que ahorrar sea más fácil, más motivador y más constante.',
    '💡 Los hábitos financieros se forman en 66 días — dale tiempo a tus nuevos comportamientos.',
    '💡 Una persona frugal no es tacaña, es inteligente con su dinero — y eso se nota en su libertad.',
    '💡 Pagarle a tu yo futuro es tan importante como pagar tus deudas actuales — no lo postergues.',
    '💡 Aprende a distinguir entre un buen precio y una buena compra — no siempre son lo mismo.',
    '💡 Los errores financieros son lecciones valiosas — lo importante es no repetirlos dos veces.',
    '💡 El estrés financiero afecta tu salud — controlar tu dinero mejora tu bienestar integral.',
    '💡 Revisa si tienes dinero olvidado en cuentas antiguas o seguros sin reclamar — podría sorprenderte.',
    '💡 El 1% de mejora financiera cada semana equivale a una transformación completa en un año.',
    '💡 Celebra tus logros financieros — cuando alcances una meta, reconócelo antes de fijar la siguiente.',
    '💡 Una buena negociación puede ahorrarte tanto como meses de trabajo extra — practica ese músculo.',
    '💡 Evita garantías extendidas en casi todos los casos — el costo adicional rara vez vale la pena.',
    '💡 La disciplina financiera en los pequeños detalles es lo que se refleja en los grandes resultados.',
    '💡 Si no sabes adónde va tu dinero, empieza a registrar cada sol gastado — la respuesta te sorprenderá.',
    '💡 Diferencia entre precio y costo total: incluye mantenimiento, seguro y vida útil del producto.',
    '💡 Invertir no es solo para ricos — con montos pequeños pero constantes ya estás construyendo riqueza.',
    '💡 La paciencia es el ingrediente secreto de toda buena estrategia financiera — no hay atajos reales.',
    '💡 No compares tu situación financiera con la de otros — cada persona tiene su propio camino.',
    '💡 Aprende sobre tasas de interés — entender cómo funcionan puede ahorrarte miles de soles.',
    '💡 Tener múltiples metas de ahorro activas a la vez multiplica tu motivación para guardar dinero.',
    '💡 Los gastos de estatus social — marcas, artículos de lujo — son una de las principales trampas.',
    '💡 El ahorro es un músculo — mientras más lo ejercitas, más natural y automático se vuelve.',
    '💡 Si no puedes pagarlo dos veces, probablemente no puedes permitirtelo ni una vez — reflexiona.',
    '💡 Tu peor enemigo financiero puede ser tu yo impulsivo — planifica con calma y decide con la cabeza.',
    '💡 Un presupuesto realista incluye gastos de ocio y socialización — ser muy estricto lleva al abandono.',
    '💡 Cada sol bien administrado hoy es un sol libre mañana para hacer lo que realmente importa.',
    '💡 Comparte tus metas financieras con alguien de confianza — la responsabilidad compartida multiplica el éxito.',
    '💡 Antes de gastar en entretenimiento, busca opciones gratuitas — museos, parques y eventos sin costo.',
    '💡 El dinero ahorrado en gastos innecesarios equivale a dinero ganado sin trabajar más horas.',
    '💡 La independencia financiera no es un destino sino un camino — cada pequeña decisión de hoy cuenta.',
    '💡 Revisa este panel cada día — quien mide sus finanzas las mejora; quien las ignora, las pierde.'
  ];
  let currentTipIdx = null;
  function renderTip(){
    if(currentTipIdx === null){
      // 1 consejo diferente por día durante 100 días consecutivos
      const d = new Date();
      const start = new Date(d.getFullYear(), 0, 0);
      const dayOfYear = Math.floor((d - start) / 86400000);
      currentTipIdx = dayOfYear % SAVINGS_TIPS.length;
    }
    const tip = SAVINGS_TIPS[currentTipIdx];
    const text = escapeHtml(tip.replace(/^\p{Emoji}\s*/u, ''));
    const MAX_DOTS = 5;
    const dots = SAVINGS_TIPS.slice(0, MAX_DOTS).map((_,i)=>`<span class="tip-dot${i===currentTipIdx%MAX_DOTS?' active':''}"></span>`).join('');
    document.getElementById('tipBanner').innerHTML = `
      <div class="tip-eyebrow">Consejo del día</div>
      <div class="tip-icon"><i class="ph ph-lightbulb"></i></div>
      <div class="tip-text">${text}</div>
      <div class="tip-foot">
        <div class="tip-dots">${dots}</div>
        <button type="button" class="tip-btn" data-action="next-tip">Siguiente →</button>
      </div>
    `;
  }
  function nextTip(){
    if(SAVINGS_TIPS.length <= 1) return;
    let next;
    do { next = Math.floor(Math.random()*SAVINGS_TIPS.length); } while(next === currentTipIdx);
    currentTipIdx = next;
    renderTip();
  }

  function monthProgress(){
    const now = new Date();
    const monthKey = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0');
    let ingresos = 0, gastos = 0;
    data.transactions.forEach(tx=>{
      if(!tx.date || tx.date.slice(0,7) !== monthKey) return;
      if(tx.type === 'ingreso') ingresos += tx.amount; else gastos += tx.amount;
    });
    const saved = ingresos - gastos;
    const goal = data.monthlyGoal || 0;
    const pct = goal > 0 ? Math.max(0, Math.min(100, Math.round((saved/goal)*100))) : 0;
    return { goal, saved, pct };
  }

  function renderObjectivesPanel(){
    const el = document.getElementById('objList');
    if(!el) return;
    const pockets = data.pockets || [];
    if(pockets.length === 0){
      el.innerHTML = `<div class="obj-empty">Crea tu primera meta de ahorro para verla aquí.</div>`;
      return;
    }
    el.innerHTML = pockets.map(p => {
      const pct = p.target > 0 ? Math.max(0, Math.min(100, (p.balance / p.target) * 100)) : 0;
      const pctDisp = pct.toFixed(2) + '%';
      return `<div class="obj-item" data-action="switch-tab" data-tab="bolsillos">
        <div class="obj-name">${escapeHtml(p.name)}</div>
        <div class="obj-pct num">${pctDisp}</div>
        <div class="obj-amounts num">${formatMoney(p.balance)} / ${formatMoney(p.target)}</div>
        <div class="obj-track"><div class="obj-fill" style="transform:scaleX(${(pct/100).toFixed(4)})"></div></div>
      </div>`;
    }).join('');
  }


  const CATEGORY_ICONS = { 'Comida':'ph-hamburger','Transporte':'ph-car','Hogar':'ph-house-simple','Entretenimiento':'ph-film-strip','Salud':'ph-pill','Otros':'ph-credit-card' };

  // Color fijo por categoría (mismo color en Transacciones, Panel y donde aparezca),
  // con una asignación determinística (por hash del nombre) para categorías que el
  // usuario cree él mismo y no estén en este mapa.
  const CATEGORY_COLOR_VARS = { 'Comida':'--red', 'Transporte':'--accent2', 'Hogar':'--yellow', 'Entretenimiento':'--lavender', 'Salud':'--sage', 'Otros':'--ochre' };
  const CATEGORY_COLOR_FALLBACK_VARS = ['--red','--accent2','--yellow','--lavender','--sage','--ochre'];
  function categoryColorVarName(cat){
    if(CATEGORY_COLOR_VARS[cat]) return CATEGORY_COLOR_VARS[cat];
    let h = 0;
    for(let i=0;i<cat.length;i++) h = (h*31 + cat.charCodeAt(i)) >>> 0;
    return CATEGORY_COLOR_FALLBACK_VARS[h % CATEGORY_COLOR_FALLBACK_VARS.length];
  }
  function cssVarValue(name){
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }
  function hexToRgba(hex, alpha){
    let h = hex.replace('#','');
    if(h.length === 3) h = h.split('').map(c=>c+c).join('');
    const num = parseInt(h, 16);
    return `rgba(${(num>>16)&255},${(num>>8)&255},${num&255},${alpha})`;
  }
  function categoryColor(cat){
    const varName = categoryColorVarName(cat || 'Otros');
    const hex = cssVarValue(varName);
    return { fg: hex, bg: hexToRgba(hex, isDarkTheme() ? .18 : .13) };
  }

  // Color por cuenta (elegible por el usuario, con respaldo determinístico por id).
  const ACCOUNT_COLOR_PALETTE = ['accent','accent2','ochre','lavender','sage','red'];
  function accountColorKey(acc){
    if(acc && acc.color && ACCOUNT_COLOR_PALETTE.includes(acc.color)) return acc.color;
    const id = (acc && acc.id) || '';
    let h = 0;
    for(let i=0;i<id.length;i++) h = (h*31 + id.charCodeAt(i)) >>> 0;
    return ACCOUNT_COLOR_PALETTE[h % ACCOUNT_COLOR_PALETTE.length];
  }
  function accountColor(acc){
    const hex = cssVarValue('--'+accountColorKey(acc));
    return { fg: hex, soft: hexToRgba(hex, isDarkTheme() ? .18 : .13), key: accountColorKey(acc) };
  }

  function renderActivity(){
    const list = data.transactions.slice().sort((a,b)=> b.date.localeCompare(a.date) || b.id.localeCompare(a.id)).slice(0, 7);
    const el = document.getElementById('activityList');
    if(list.length === 0){
      el.innerHTML = `<div class="empty-state" style="padding:24px 10px;"><p>Todavía no hay movimientos.</p></div>`;
      return;
    }
    el.innerHTML = list.map(tx=>{
      const acc = data.accounts.find(a=>a.id===tx.accountId);
      const icon = CATEGORY_ICONS[tx.category] || 'ph-credit-card';
      return `<div class="activity-row">
        <div class="activity-left">
          <div class="activity-icon"><i class="ph ${icon}"></i></div>
          <div class="activity-text">
            <div class="activity-desc">${escapeHtml(tx.description || tx.category)}</div>
            <div class="activity-meta">${formatDate(tx.date)} · ${escapeHtml(acc ? acc.name : '—')}</div>
          </div>
        </div>
        <div class="activity-amt ${tx.type==='ingreso'?'amt-in':'amt-out'}">${tx.type==='ingreso'?'+':'-'}${formatMoney(tx.amount)}</div>
        <div class="activity-actions">
          <button class="icon-btn xs" data-action="edit-tx" data-id="${tx.id}" title="Editar" aria-label="Editar transacción"><i class="ph ph-pencil-simple"></i></button>
          <button class="icon-btn xs danger" data-action="delete-tx" data-id="${tx.id}" title="Eliminar" aria-label="Eliminar transacción"><i class="ph ph-trash"></i></button>
        </div>
      </div>`;
    }).join('');
  }

  function renderCharts(){
    try{ renderLineChart(); }catch(e){ console.error('Error en gráfica de líneas', e); }
    try{ renderDoughnutChart(); }catch(e){ console.error('Error en gráfica de dona', e); }
  }

  // 'month' = últimos 6 meses (vista larga); 'week'/'day' acotan al mes actual para
  // que se pueda ver el detalle día a día o semana a semana, no solo un punto por mes.
  let lineChartMode = 'month';

  function setLineChartMode(mode){
    lineChartMode = mode;
    document.querySelectorAll('#lineChartModeSwitch .view-tab').forEach(b=>{
      const active = b.dataset.mode === mode;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderLineChart();
  }

  function lineChartBuckets(mode){
    const now = new Date();
    if(mode === 'month'){
      const map = {};
      data.transactions.forEach(tx=>{
        const key = tx.date ? tx.date.slice(0,7) : todayStr().slice(0,7);
        if(!map[key]) map[key] = { ingreso:0, gasto:0 };
        map[key][tx.type] += tx.amount;
      });
      const keys = Object.keys(map).sort().slice(-6);
      const labels = keys.map(m=>{
        const [y,mo] = m.split('-');
        return new Date(Number(y), Number(mo)-1, 1).toLocaleDateString('es-PE', {month:'short', year:'2-digit'});
      });
      return { keys, labels, map };
    }
    const monthKey = now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    const monthTx = data.transactions.filter(tx => (tx.date||'').slice(0,7) === monthKey);
    if(mode === 'day'){
      const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
      const map = {};
      for(let d=1; d<=daysInMonth; d++) map[d] = { ingreso:0, gasto:0 };
      monthTx.forEach(tx=>{
        const day = Number(tx.date.slice(8,10));
        if(map[day]) map[day][tx.type] += tx.amount;
      });
      const keys = Object.keys(map).map(Number).sort((a,b)=>a-b);
      const labels = keys.map(d=>String(d));
      return { keys, labels, map };
    }
    // week: hasta 5 semanas de 7 días dentro del mes actual
    const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const numWeeks = Math.ceil(daysInMonth/7);
    const map = {};
    for(let w=1; w<=numWeeks; w++) map[w] = { ingreso:0, gasto:0 };
    monthTx.forEach(tx=>{
      const day = Number(tx.date.slice(8,10));
      const week = Math.ceil(day/7);
      if(map[week]) map[week][tx.type] += tx.amount;
    });
    const keys = Object.keys(map).map(Number).sort((a,b)=>a-b);
    const labels = keys.map(w=>`Sem ${w}`);
    return { keys, labels, map };
  }

  function renderLineChart(){
    const { keys, labels, map } = lineChartBuckets(lineChartMode);
    const lineWrap = document.getElementById('lineChartWrap');

    if(lineChartInst){ lineChartInst.destroy(); lineChartInst = null; }

    if(typeof Chart === 'undefined'){
      lineWrap.innerHTML = '<div class="empty-note">No se pudo cargar la librería de gráficas (requiere conexión a internet).</div>';
      return;
    }
    if(data.transactions.length === 0){
      lineWrap.innerHTML = '<div class="empty-note">Aún no hay transacciones para graficar.</div>';
      return;
    }
    lineWrap.innerHTML = '<canvas id="lineChart"></canvas>';
    const ctx = document.getElementById('lineChart').getContext('2d');
    const dark = isDarkTheme();
    const ingresoColor = dark ? '#34d399' : '#1f7a4d';
    const gastoColor = dark ? '#e2836b' : '#c1543f';
    const tickColor = dark ? '#9a9787' : '#8a8677';
    const gridColor = dark ? 'rgba(255,255,255,.06)' : 'rgba(20,18,10,.05)';
    const endRadius = keys.map((_,i)=> i===keys.length-1 ? 5 : 2);
    const legendEl = document.getElementById('lineChartLegend');
    if(legendEl){
      legendEl.innerHTML = `
        <span class="lg-item"><span class="lg-dot" style="background:${ingresoColor}"></span>Ingresos</span>
        <span class="lg-item"><span class="lg-dot" style="background:${gastoColor}"></span>Gastos</span>`;
    }
    lineChartInst = new Chart(ctx, {
      type:'line',
      data:{
        labels,
        datasets:[
          { label:'Ingresos', data: keys.map(k=>map[k].ingreso), borderColor:ingresoColor, backgroundColor:dark?'rgba(52,211,153,.14)':'rgba(31,122,77,.10)', tension:.35, fill:true, pointRadius:endRadius, pointHoverRadius:6, pointBackgroundColor:ingresoColor, borderWidth:2 },
          { label:'Gastos', data: keys.map(k=>map[k].gasto), borderColor:gastoColor, backgroundColor:dark?'rgba(226,131,107,.12)':'rgba(193,84,63,.08)', tension:.35, fill:true, pointRadius:endRadius, pointHoverRadius:6, pointBackgroundColor:gastoColor, borderWidth:2 }
        ]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        scales:{
          x:{ ticks:{ color:tickColor }, grid:{ display:false } },
          y:{ ticks:{ color:tickColor }, grid:{ color:gridColor } }
        }
      }
    });
  }

  function renderDoughnutChart(){
    const catMap = {};
    data.transactions.forEach(tx=>{
      if(tx.type !== 'gasto') return;
      catMap[tx.category] = (catMap[tx.category]||0) + tx.amount;
    });
    const cats = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
    const donutWrap = document.getElementById('doughnutChartWrap');

    if(doughnutChartInst){ doughnutChartInst.destroy(); doughnutChartInst = null; }

    if(typeof Chart === 'undefined'){
      donutWrap.innerHTML = '<div class="empty-note">No se pudo cargar la librería de gráficas.</div>';
      return;
    }
    if(cats.length === 0){
      donutWrap.innerHTML = '<div class="empty-note">Aún no hay gastos para graficar.</div>';
      return;
    }
    const total = cats.reduce((s,c)=>s+catMap[c],0);
    donutWrap.innerHTML = `
      <div class="donut-figure">
        <canvas id="doughnutChart"></canvas>
        <div class="donut-center"><span class="donut-center-lbl">Total</span><span class="donut-center-val">${formatMoney(total)}</span></div>
      </div>
      <ul class="donut-legend" id="donutLegend"></ul>
    `;
    const dark = isDarkTheme();
    const colors = cats.map(c=>categoryColor(c).fg);
    const ctx2 = document.getElementById('doughnutChart').getContext('2d');
    doughnutChartInst = new Chart(ctx2, {
      type:'doughnut',
      data:{
        labels: cats,
        datasets:[{ data: cats.map(c=>catMap[c]), backgroundColor: colors, borderWidth:3, borderColor: dark ? '#1e2027' : '#fffdf9' }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{ display:false } },
        cutout:'68%'
      }
    });
    document.getElementById('donutLegend').innerHTML = cats.map((c,i)=>{
      const pct = total>0 ? Math.round((catMap[c]/total)*100) : 0;
      return `<li><span class="lg-dot" style="background:${colors[i]}"></span>${escapeHtml(c)}<b class="num">${formatMoney(catMap[c])}</b><i>${pct}%</i></li>`;
    }).join('');
  }

  /* ---------------- RENDER: Transacciones ---------------- */
  function refreshFilterSelects(){
    const accSel = document.getElementById('filterAccount');
    const catSel = document.getElementById('filterCategory');
    const curAcc = accSel.value, curCat = catSel.value;
    accSel.innerHTML = '<option value="">Cuenta</option>' + data.accounts.map(a=>`<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    catSel.innerHTML = '<option value="">Categoría</option>' + data.categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    accSel.value = curAcc; catSel.value = curCat;
  }

  function updateFilterChipStates(){
    ['filterType','filterAccount','filterCategory'].forEach(id=>{
      const sel = document.getElementById(id);
      sel.closest('.filter-chip-wrap').classList.toggle('active', !!sel.value);
    });
  }

  // "Hoy" / "Ayer" / "3 de agosto" — encabezado de grupo para una fecha ISO (yyyy-mm-dd)
  function dateGroupLabel(iso){
    const today = todayStr();
    const yd = new Date(); yd.setDate(yd.getDate()-1);
    const yStr = yd.getFullYear()+'-'+String(yd.getMonth()+1).padStart(2,'0')+'-'+String(yd.getDate()).padStart(2,'0');
    if(iso === today) return 'Hoy';
    if(iso === yStr) return 'Ayer';
    const d = new Date(iso+'T00:00:00');
    const sameYear = d.getFullYear() === new Date().getFullYear();
    const label = d.toLocaleDateString('es-PE', sameYear ? {day:'numeric',month:'long'} : {day:'numeric',month:'long',year:'numeric'});
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  function renderTransactions(){
    refreshFilterSelects();
    updateFilterChipStates();
    const fType = document.getElementById('filterType').value;
    const fAcc = document.getElementById('filterAccount').value;
    const fCat = document.getElementById('filterCategory').value;
    const q = document.getElementById('filterSearch').value.trim().toLowerCase();

    let list = data.transactions.slice().sort((a,b)=> b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
    if(fType) list = list.filter(t=>t.type===fType);
    if(fAcc) list = list.filter(t=>t.accountId===fAcc);
    if(fCat) list = list.filter(t=>t.category===fCat);
    if(q) list = list.filter(t=>(t.description||'').toLowerCase().includes(q) || t.category.toLowerCase().includes(q));

    const groupedEl = document.getElementById('txGrouped');
    const emptyEl = document.getElementById('txEmpty');
    const statsEl = document.getElementById('txStats');
    const catBarEl = document.getElementById('txCategoryBar');
    const hasFilters = !!(fType || fAcc || fCat || q);

    if(list.length === 0){
      groupedEl.innerHTML = '';
      statsEl.innerHTML = '';
      catBarEl.style.display = 'none';
      emptyEl.style.display = 'block';
      document.getElementById('txEmptyTitle').textContent = hasFilters ? 'No hay transacciones con estos filtros' : 'No hay transacciones todavía';
      document.getElementById('txEmptySub').textContent = hasFilters ? 'Prueba quitar algún filtro o la búsqueda.' : 'Agrega tu primer ingreso o gasto con el botón de arriba, o escríbele al bot de Telegram.';
      return;
    }
    emptyEl.style.display = 'none';

    // Estadísticas sobre la lista ya filtrada
    let sumIn = 0, sumOut = 0;
    list.forEach(t=>{ if(t.type==='ingreso') sumIn += t.amount; else sumOut += t.amount; });
    statsEl.innerHTML = `
      <div class="stat-tile-sm">
        <span class="st-icon neutral"><i class="ph ph-list"></i></span>
        <div><p class="st-label">Movimientos</p><p class="st-val num">${list.length}</p></div>
      </div>
      <div class="stat-tile-sm">
        <span class="st-icon in"><i class="ph ph-arrow-up"></i></span>
        <div><p class="st-label">Ingresos</p><p class="st-val num in">${formatMoney(sumIn)}</p></div>
      </div>
      <div class="stat-tile-sm">
        <span class="st-icon out"><i class="ph ph-arrow-down"></i></span>
        <div><p class="st-label">Gastos</p><p class="st-val num out">${formatMoney(sumOut)}</p></div>
      </div>
    `;

    // Barra de proporción por categoría (solo gastos de la lista filtrada). Categorías
    // que redondean a una franja casi invisible (<3%) se agrupan en "Otros" — mostrarlas
    // sueltas solo ensucia la barra con tiras que no se alcanzan a distinguir ni a tocar.
    const catMap = {};
    list.forEach(t=>{ if(t.type!=='gasto') return; catMap[t.category] = (catMap[t.category]||0) + t.amount; });
    const allCats = Object.keys(catMap).sort((a,b)=>catMap[b]-catMap[a]);
    if(allCats.length === 0){
      catBarEl.style.display = 'none';
      catBarEl.innerHTML = '';
    } else {
      catBarEl.style.display = 'block';
      const totalGasto = allCats.reduce((s,c)=>s+catMap[c],0);
      const MIN_PCT = 3;
      const main = allCats.filter(c => totalGasto===0 || (catMap[c]/totalGasto)*100 >= MIN_PCT);
      const smallCats = allCats.filter(c => !main.includes(c));
      const entries = main.map(c => ({ label:c, amount:catMap[c], color:categoryColor(c).fg }));
      if(smallCats.length){
        const smallTotal = smallCats.reduce((s,c)=>s+catMap[c],0);
        entries.push({ label: `Varios (${smallCats.length})`, amount: smallTotal, color: cssVarValue('--text-dimmer'), title: smallCats.join(', ') });
      }
      const segments = entries.map(e=>{
        const pct = totalGasto>0 ? (e.amount/totalGasto)*100 : 0;
        return `<span style="width:${pct}%;background:${e.color}" title="${escapeHtml(e.title||e.label)}"></span>`;
      }).join('');
      const legend = entries.map(e=>{
        const pct = totalGasto>0 ? Math.round((e.amount/totalGasto)*100) : 0;
        return `<span title="${escapeHtml(e.title||e.label)}"><span class="lg-dot" style="background:${e.color}"></span>${escapeHtml(e.label)} <b class="num">${pct}%</b></span>`;
      }).join('');
      catBarEl.innerHTML = `<div class="tcb-track">${segments}</div><div class="tcb-legend">${legend}</div>`;
    }

    // Agrupar por fecha ("Hoy", "Ayer", "3 de agosto"…)
    const groups = [];
    let current = null;
    list.forEach(tx=>{
      const label = dateGroupLabel(tx.date);
      if(!current || current.label !== label){ current = { label, items: [] }; groups.push(current); }
      current.items.push(tx);
    });

    groupedEl.innerHTML = groups.map(g => `
      <div class="tx-group">
        <div class="tx-group-head">${g.label}</div>
        ${g.items.map(tx=>{
          const acc = data.accounts.find(a=>a.id===tx.accountId);
          const accName = acc ? acc.name : '(cuenta eliminada)';
          const accIcon = ACC_ICONS[acc ? acc.type : ''] || 'ph-wallet';
          const cc = categoryColor(tx.category);
          const icon = CATEGORY_ICONS[tx.category] || 'ph-credit-card';
          return `<div class="tx-row" style="--row-accent:${cc.fg}">
            <span class="tx-icon" style="background:${cc.bg};color:${cc.fg}"><i class="ph ${icon}"></i></span>
            <div class="tx-info">
              <span class="tx-desc">${escapeHtml(tx.description || tx.category)}</span>
              <span class="tag" style="background:${cc.bg};color:${cc.fg}">${escapeHtml(tx.category)}</span>
            </div>
            <span class="tx-acc"><i class="ph ${accIcon}"></i>${escapeHtml(accName)}</span>
            <span class="tx-amt num ${tx.type==='ingreso'?'amt-in':'amt-out'}">${tx.type==='ingreso'?'+':'-'}${formatMoney(tx.amount)}</span>
            <div class="row-actions">
              <button class="icon-btn xs" data-action="edit-tx" data-id="${tx.id}" title="Editar" aria-label="Editar transacción"><i class="ph ph-pencil-simple"></i></button>
              <button class="icon-btn xs danger" data-action="delete-tx" data-id="${tx.id}" title="Eliminar" aria-label="Eliminar transacción"><i class="ph ph-trash"></i></button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `).join('');
  }

  // Antes era un formulario inline arriba de la barra de filtros — duplicaba controles
  // con la barra de búsqueda/filtros justo debajo y no quedaba claro cuál usar primero.
  // Ahora es un modal, igual que "Editar transacción" y el resto de los flujos de "agregar"
  // en la app (cuentas, metas, deudas...), así el patrón es consistente en todos lados.
  document.body.addEventListener('click', (e)=>{
    if(e.target.closest('[data-action="open-add-tx"]')) openAddTxModal();
  });

  function openAddTxModal(){
    if(data.accounts.length === 0){ toast('Primero crea una cuenta', 'error'); return; }
    openModal(`
      <h2>Nueva transacción</h2>
      <form id="addTxForm">
        <div class="form-grid">
          <div class="field">
            <label>Tipo</label>
            <div class="type-toggle" id="addTxType">
              <button type="button" class="active ingreso" data-v="ingreso">Ingreso</button>
              <button type="button" class="gasto" data-v="gasto">Gasto</button>
            </div>
          </div>
          <div class="field"><label>Monto</label><input type="number" min="0" step="0.01" id="addTxAmount" required placeholder="0"></div>
          <div class="field"><label>Fecha</label><input type="date" id="addTxDate" value="${todayStr()}" required></div>
          <div class="field"><label>Descripción</label><input type="text" id="addTxDesc" placeholder="Ej: Almuerzo"></div>
          <div class="field"><label>Categoría</label><select id="addTxCategory">${categoryOptionsHtml()}</select></div>
          <div class="field"><label>Cuenta</label><select id="addTxAccount">${accountOptionsHtml()}</select></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddTx">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>
    `);
    let txTypeSelected = 'ingreso';
    document.querySelectorAll('#addTxType button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#addTxType button').forEach(x=>x.classList.remove('active','ingreso','gasto'));
        b.classList.add('active', b.dataset.v);
        txTypeSelected = b.dataset.v;
      });
    });
    bindCategorySelect(document.getElementById('addTxCategory'));
    document.getElementById('cancelAddTx').addEventListener('click', closeModal);
    document.getElementById('addTxAmount').focus();
    document.getElementById('addTxForm').addEventListener('submit', async (e)=>{
      e.preventDefault();
      clearFormErrors(e.target);
      const amount = parseFloat(document.getElementById('addTxAmount').value);
      const date = document.getElementById('addTxDate').value || todayStr();
      const description = document.getElementById('addTxDesc').value.trim();
      const category = document.getElementById('addTxCategory').value;
      const accountId = document.getElementById('addTxAccount').value;
      if(!amount || amount <= 0){ setFieldError('addTxAmount', 'Ingresa un monto válido'); return; }
      if(!accountId){ setFieldError('addTxAccount', 'Selecciona una cuenta'); return; }
      if(txTypeSelected === 'gasto' && !(await confirmLockedSpend(accountId))) return;
      try{
        await apiCall('POST', '/api/transactions', { type: txTypeSelected, amount, date, description, category: category || 'Otros', accountId });
        closeModal();
        toast('Transacción guardada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  document.getElementById('filterType').addEventListener('change', renderTransactions);
  document.getElementById('filterAccount').addEventListener('change', renderTransactions);
  document.getElementById('filterCategory').addEventListener('change', renderTransactions);
  document.getElementById('filterSearch').addEventListener('input', renderTransactions);
  document.querySelectorAll('.chip-clear').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.getElementById(btn.dataset.clear).value = '';
      renderTransactions();
    });
  });

  function openEditTxModal(tx){
    openModal(`
      <h2>Editar transacción</h2>
      <form id="editTxForm">
        <div class="form-grid">
          <div class="field">
            <label>Tipo</label>
            <div class="type-toggle" id="editTxType">
              <button type="button" class="${tx.type==='ingreso'?'active ingreso':''}" data-v="ingreso">Ingreso</button>
              <button type="button" class="${tx.type==='gasto'?'active gasto':''}" data-v="gasto">Gasto</button>
            </div>
          </div>
          <div class="field"><label>Monto</label><input type="number" min="0" step="0.01" id="editTxAmount" value="${tx.amount}" required></div>
          <div class="field"><label>Fecha</label><input type="date" id="editTxDate" value="${tx.date}" required></div>
          <div class="field"><label>Descripción</label><input type="text" id="editTxDesc" value="${escapeHtml(tx.description||'')}"></div>
          <div class="field"><label>Categoría</label><select id="editTxCategory">${categoryOptionsHtml(tx.category)}</select></div>
          <div class="field"><label>Cuenta</label><select id="editTxAccount">${accountOptionsHtml(tx.accountId)}</select></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelEditTx">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    `);
    let selType = tx.type;
    document.querySelectorAll('#editTxType button').forEach(b=>{
      b.addEventListener('click', ()=>{
        document.querySelectorAll('#editTxType button').forEach(x=>x.classList.remove('active','ingreso','gasto'));
        b.classList.add('active', b.dataset.v);
        selType = b.dataset.v;
      });
    });
    bindCategorySelect(document.getElementById('editTxCategory'));
    document.getElementById('cancelEditTx').addEventListener('click', closeModal);
    document.getElementById('editTxForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const amount = parseFloat(document.getElementById('editTxAmount').value);
      const date = document.getElementById('editTxDate').value;
      const description = document.getElementById('editTxDesc').value.trim();
      const category = document.getElementById('editTxCategory').value;
      const accountId = document.getElementById('editTxAccount').value;
      if(!amount || amount<=0){ setFieldError('editTxAmount', 'Ingresa un monto válido'); return; }
      if(!accountId){ setFieldError('editTxAccount', 'Selecciona una cuenta'); return; }
      if(selType === 'gasto' && !(await confirmLockedSpend(accountId))) return;
      try{
        await apiCall('PUT', `/api/transactions/${tx.id}`, { type: selType, amount, date, description, category, accountId });
        closeModal();
        toast('Transacción actualizada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  /* ---------------- RENDER: Billetera / Cuentas ---------------- */
  const ACC_ICONS = { ahorro: 'ph-vault', corriente: 'ph-bank', efectivo: 'ph-coins', tarjeta: 'ph-credit-card' };
  const ACC_LABELS = { ahorro: 'Cuenta de ahorros', corriente: 'Cuenta corriente', efectivo: 'Efectivo en mano', tarjeta: 'Tarjeta de crédito' };

  let selectedAccountId = null;

  // Si una cuenta está apartada para una meta de Chanchito, devuelve esa meta (o null).
  function lockedAccountPocket(accountId){
    return (data.pockets||[]).find(p=>p.linkedAccountId===accountId) || null;
  }

  // Aviso (no bloqueo) antes de registrar un gasto desde una cuenta apartada para una meta.
  // Muestra el progreso actual del chanchito para que la decisión sea informada,
  // en vez de un confirm() nativo sin contexto.
  async function confirmLockedSpend(accountId){
    const pocket = lockedAccountPocket(accountId);
    if(!pocket) return true;
    const acc = data.accounts.find(a=>a.id===accountId);
    const progress = pocket.target > 0
      ? ` Vas ${formatMoney(pocket.balance)} de ${formatMoney(pocket.target)} (${Math.min(100, Math.round((pocket.balance/pocket.target)*100))}%).`
      : ` Ahorrado hasta ahora: ${formatMoney(pocket.balance)}.`;
    return openConfirm({
      title: 'Cuenta apartada para una meta',
      message: `"${acc?acc.name:'Esta cuenta'}" está apartada para tu meta "${pocket.name}".${progress} ¿Quieres gastar de ahí de todas formas?`,
      confirmLabel: 'Gastar de todas formas'
    });
  }

  function renderAccounts(){
    const cardsEl = document.getElementById('walletCards');
    const cardsLabel = document.getElementById('walletCardsLabel');
    const detailEl = document.getElementById('accountDetail');
    const empty = document.getElementById('accountsEmpty');
    const hero = document.getElementById('walletHero');

    const liquid = data.accounts.filter(a=>a.type!=='tarjeta');

    if(liquid.length === 0){
      cardsEl.innerHTML = ''; cardsLabel.style.display = 'none';
      detailEl.style.display = 'none'; detailEl.innerHTML = '';
      hero.style.display = 'none';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    cardsLabel.style.display = 'block';

    // Mantiene la selección si la cuenta sigue existiendo; si no, elige la primera.
    if(!selectedAccountId || !liquid.find(a=>a.id===selectedAccountId)){
      selectedAccountId = liquid[0].id;
    }

    // Total + distribución por cuenta (solo ahorro/corriente/efectivo — nunca tarjetas ni deudas)
    hero.style.display = 'block';
    const total = liquid.reduce((s,a)=>s+a.balance, 0);
    const sorted = liquid.slice().sort((a,b)=>b.balance-a.balance);
    const barsHtml = sorted.map(a=>{
      const pct = total > 0 ? Math.max(2, Math.round((a.balance/total)*100)) : 0;
      return `<div class="wb-row">
        <span class="wb-name">${escapeHtml(a.name)}</span>
        <div class="wb-bar-wrap"><div class="wb-bar" style="transform:scaleX(${(pct/100).toFixed(4)});background:${accountColor(a).fg};"></div></div>
        <span class="wb-label">${formatMoney(a.balance)}</span>
      </div>`;
    }).join('');
    hero.innerHTML = `
      <div class="wh-label"><i class="ph ph-wallet"></i> Total en tu Billetera</div>
      <div class="wh-total">${formatMoney(total)}</div>
      <div class="wallet-breakdown">${barsHtml}</div>`;

    // Tarjetas de cuenta (seleccionables)
    cardsEl.innerHTML = liquid.map(a=>{
      const ac = accountColor(a);
      const icon = ACC_ICONS[a.type] || 'ph-vault';
      const isActive = a.id === selectedAccountId;
      const lockedFor = lockedAccountPocket(a.id);
      const footHtml = a.bank
        ? `${bankBadgeHtml(a.bank)}<span class="wcard-type">${escapeHtml(ACC_LABELS[a.type]||a.type)}</span>`
        : `<span class="wcard-type solo">${escapeHtml(ACC_LABELS[a.type]||a.type)}</span>`;
      // El efectivo nunca puede ser negativo de verdad — un balance negativo acá es un
      // descalce (movimientos sin registrar), no plata que existe. Nunca se muestra el
      // número negativo tal cual; se avisa aparte y se sugiere registrar la diferencia.
      const isCashDescalce = a.type === 'efectivo' && a.balance < 0;
      return `<button type="button" class="wcard${isActive?' active':''}${isCashDescalce?' has-warn':''}" data-action="select-account" data-id="${a.id}" style="--wc:${ac.fg};--wc-soft:${ac.soft};">
        <div class="wcard-top">
          <span class="wcard-icon"><i class="ph ${icon}"></i></span>
          ${isActive ? '<span class="wcard-check"><i class="ph ph-check"></i></span>' : ''}
        </div>
        <p class="wcard-name">${lockedFor?`<i class="ph ph-lock-simple" title="Apartada para: ${escapeHtml(lockedFor.name)}"></i> `:''}${escapeHtml(a.name)}</p>
        <p class="wcard-balance num">${formatMoney(isCashDescalce ? 0 : a.balance)}</p>
        ${isCashDescalce ? `<span class="wcard-warn-chip"><i class="ph ph-warning"></i> Descalce ${formatMoney(-a.balance)}</span>` : ''}
        <div class="wcard-foot">${footHtml}</div>
      </button>`;
    }).join('') + `
      <button type="button" class="wcard wcard-add" data-action="open-add-account">
        <i class="ph ph-plus"></i><span>Nueva cuenta</span>
      </button>`;

    renderAccountDetail();
  }

  // Cambiar de cuenta seleccionada no necesita red (los datos ya están en memoria) ni
  // reconstruir la grilla completa de tarjetas — solo mueve el estado "activa" y
  // vuelve a pintar el panel de detalle, que es lo único cuyo contenido cambia de verdad.
  function selectAccount(id){
    selectedAccountId = id;
    document.querySelectorAll('#walletCards .wcard[data-action="select-account"]').forEach(btn=>{
      const active = btn.dataset.id === id;
      btn.classList.toggle('active', active);
      const top = btn.querySelector('.wcard-top');
      const check = top.querySelector('.wcard-check');
      if(active && !check) top.insertAdjacentHTML('beforeend', '<span class="wcard-check"><i class="ph ph-check"></i></span>');
      else if(!active && check) check.remove();
    });
    renderAccountDetail();
  }

  function renderAccountDetail(){
    const detailEl = document.getElementById('accountDetail');
    const acc = data.accounts.find(a=>a.id===selectedAccountId);
    if(!acc){ detailEl.style.display = 'none'; detailEl.innerHTML = ''; return; }
    detailEl.style.display = 'grid';
    const icon = ACC_ICONS[acc.type] || 'ph-vault';

    const fields = [
      ['Nombre', escapeHtml(acc.name)],
      ['Tipo', escapeHtml(ACC_LABELS[acc.type]||acc.type)]
    ];
    if(acc.bank) fields.push(['Banco', bankBadgeHtml(acc.bank)]);
    if(acc.type==='ahorro' || acc.type==='corriente'){
      fields.push(['Tasa de interés anual', acc.interestRate ? acc.interestRate+'%' : '—']);
      fields.push(['Depósito automático', acc.monthlyDeposit ? `<span class="num">${formatMoney(acc.monthlyDeposit)}</span> / mes` : '—']);
    }
    const lockedFor = lockedAccountPocket(acc.id);
    if(lockedFor){
      fields.push(['Apartada para', `<button type="button" class="btn btn-ghost btn-sm" data-action="switch-tab" data-tab="bolsillos" style="gap:5px;"><i class="ph ph-lock-simple"></i> ${escapeHtml(lockedFor.name)}</button>`]);
    }
    const isCashDescalce = acc.type === 'efectivo' && acc.balance < 0;
    fields.push(['Saldo actual', `<span class="num">${formatMoney(isCashDescalce ? 0 : acc.balance)}</span>`]);
    const fieldsHtml = fields.map(([k,v])=>`<div><dt>${k}</dt><dd${k==='Saldo actual'?' class="strong"':''}>${v}</dd></div>`).join('');
    const descalceHtml = isCashDescalce ? `
      <div class="dd-urgent-banner" style="align-items:flex-start;margin-bottom:16px;">
        <i class="ph ph-warning-circle" style="margin-top:1px;"></i>
        <span>El efectivo no puede ser negativo — hay <strong class="num">${formatMoney(-acc.balance)}</strong> en gastos registrados que este dinero físico no cubre. Seguramente falta registrar de dónde salió esa plata (un préstamo, un retiro no anotado, etc).
          <button type="button" class="btn btn-primary btn-sm" data-action="open-add-personloan" style="margin-top:10px;">Registrar como préstamo</button>
        </span>
      </div>` : '';

    const swatchesHtml = ACCOUNT_COLOR_PALETTE.map(key=>{
      const isActive = accountColorKey(acc) === key;
      return `<button type="button" class="swatch${isActive?' active':''}" data-action="set-account-color" data-id="${acc.id}" data-color="${key}" style="background:var(--${key})">${isActive?'<i class="ph ph-check"></i>':''}</button>`;
    }).join('');

    // Ingresos vs. gastos de esta cuenta, este mes
    const monthKey = todayStr().slice(0,7);
    let mIn=0, mOut=0;
    data.transactions.forEach(t=>{
      if(t.accountId !== acc.id || !t.date || t.date.slice(0,7) !== monthKey) return;
      if(t.type==='ingreso') mIn += t.amount; else mOut += t.amount;
    });
    const mTotal = mIn+mOut;
    const inPct = mTotal>0 ? Math.round((mIn/mTotal)*100) : 50;

    // Movimientos recientes de esta cuenta
    const recent = data.transactions.filter(t=>t.accountId===acc.id).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id)).slice(0,4);
    const activityHtml = recent.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin movimientos todavía en esta cuenta.</p>`
      : recent.map(t=>{
        const cc = categoryColor(t.category);
        const catIcon = CATEGORY_ICONS[t.category] || 'ph-credit-card';
        return `<div class="wb-act-row">
          <span class="wb-act-icon" style="background:${cc.bg};color:${cc.fg}"><i class="ph ${catIcon}"></i></span>
          <div><p class="wb-act-desc">${escapeHtml(t.description || t.category)}</p><p class="wb-act-meta">${formatDate(t.date)}</p></div>
          <span class="wb-act-amt ${t.type==='ingreso'?'in':'out'} num">${t.type==='ingreso'?'+':'-'}${formatMoney(t.amount)}</span>
        </div>`;
      }).join('');

    detailEl.innerHTML = `
      <div class="wb-detail-main">
        <div class="wb-detail-head">
          <h2><i class="ph ${icon}"></i>Detalles de la cuenta</h2>
          <div class="wb-detail-actions">
            <button class="icon-btn xs" data-action="edit-acc" data-id="${acc.id}" title="Editar" aria-label="Editar cuenta"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn xs danger" data-action="delete-acc" data-id="${acc.id}" title="Eliminar" aria-label="Eliminar cuenta"><i class="ph ph-trash"></i></button>
          </div>
        </div>
        ${descalceHtml}
        <dl class="wb-fields">${fieldsHtml}</dl>
        <p class="wb-theme-label">Color de la cuenta</p>
        <div class="wb-theme-swatches">${swatchesHtml}</div>
      </div>
      <div class="wb-detail-side">
        <p class="section-label sm">Ingresos vs. gastos · esta cuenta</p>
        <div class="mc-mini-bar"><div style="width:${inPct}%;background:var(--green)"></div><div style="width:${100-inPct}%;background:var(--red)"></div></div>
        <div class="mc-mini-labels">
          <span class="in"><i class="ph ph-arrow-up"></i><span class="num">${formatMoney(mIn)}</span></span>
          <span class="out"><i class="ph ph-arrow-down"></i><span class="num">${formatMoney(mOut)}</span></span>
        </div>
        <p class="section-label sm">Movimientos recientes</p>
        <div class="wb-activity">${activityHtml}</div>
      </div>
    `;
  }

  async function setAccountColor(id, color){
    try{
      await apiCall('PUT', `/api/accounts/${id}`, { color });
      await refreshAndRender();
    }catch(err){ toast(err.message, 'error'); }
  }

  function openAddAccountModal(presetType){
    openModal(`
      <h2>Nueva cuenta</h2>
      <form id="addAccForm">
        <div class="form-grid">
          <div class="field">
            <label>Tipo de cuenta</label>
            <select id="accType">
              <option value="ahorro">Cuenta de ahorros</option>
              <option value="corriente">Cuenta corriente</option>
              <option value="efectivo">Efectivo en mano</option>
              <option value="tarjeta">Tarjeta de crédito</option>
            </select>
          </div>
          <div class="field"><label>Nombre</label><input type="text" id="accName" placeholder="Ej: Ahorros BCP" required></div>
          <div class="field" id="accBankField"><label>Banco</label><select id="accBank">${bankOptionsHtml()}</select></div>
          <div class="field" id="accBalanceField"><label>Saldo inicial</label><input type="number" min="0" step="0.01" id="accBalance" value="0"></div>
          <div class="field" id="accNetworkField" style="display:none;"><label>Red de la tarjeta</label><select id="accNetwork">${networkOptionsHtml()}</select></div>
          <div class="field" id="accLimitField" style="display:none;"><label>Límite de crédito (S/)</label><input type="number" min="0" step="0.01" id="accLimit" placeholder="Ej: 5000"></div>
          <div class="field" id="accClosingField" style="display:none;"><label>Día de corte (1-31)</label><input type="number" min="1" max="31" id="accClosing" placeholder="Ej: 15"></div>
          <div class="field" id="accBillingField" style="display:none;"><label>Día de pago (1-31)</label><input type="number" min="1" max="31" id="accBilling" placeholder="Ej: 25"></div>
          <div class="field" id="accInterestField" style="display:none;"><label>Tasa de interés anual (%)</label><input type="number" min="0" step="0.01" id="accInterest" placeholder="Ej: 4.5"></div>
          <div class="field" id="accDepositField" style="display:none;"><label>Depósito mensual automático (S/)</label><input type="number" min="0" step="0.01" id="accDeposit" placeholder="Ej: 200 (opcional)"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddAcc">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear cuenta</button>
        </div>
      </form>
    `);
    function toggleAccFields() {
      const t = document.getElementById('accType').value;
      const isTarjeta = t === 'tarjeta';
      const isSavings = t === 'ahorro' || t === 'corriente';
      const isEfectivo = t === 'efectivo';
      document.querySelector('#accBalanceField label').textContent = isTarjeta ? 'Deuda inicial' : 'Saldo inicial';
      document.getElementById('accBankField').style.display = isEfectivo ? 'none' : 'flex';
      ['accNetworkField','accLimitField','accClosingField','accBillingField'].forEach(id=>{
        document.getElementById(id).style.display = isTarjeta ? 'flex' : 'none';
      });
      document.getElementById('accInterestField').style.display = isSavings ? 'flex' : 'none';
      document.getElementById('accDepositField').style.display = isSavings ? 'flex' : 'none';
    }
    if(presetType) document.getElementById('accType').value = presetType;
    document.getElementById('accType').addEventListener('change', toggleAccFields);
    toggleAccFields();
    document.getElementById('cancelAddAcc').addEventListener('click', closeModal);
    document.getElementById('addAccForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const selType = document.getElementById('accType').value;
      const name = document.getElementById('accName').value.trim();
      const balance = parseFloat(document.getElementById('accBalance').value) || 0;
      const network = document.getElementById('accNetwork').value;
      const bank = (selType !== 'efectivo' && document.getElementById('accBank').value) || null;
      const creditLimit = parseFloat(document.getElementById('accLimit').value) || null;
      const closingDay = parseInt(document.getElementById('accClosing').value, 10) || null;
      const billingDay = parseInt(document.getElementById('accBilling').value, 10) || null;
      const interestRate = parseFloat(document.getElementById('accInterest').value) || null;
      const monthlyDeposit = parseFloat(document.getElementById('accDeposit').value) || null;
      if(!name){ setFieldError('accName', 'Ingresa un nombre'); return; }
      try{
        await apiCall('POST', '/api/accounts', { type: selType, name, balance, network, bank, creditLimit, closingDay, billingDay, interestRate, monthlyDeposit });
        closeModal();
        toast('Cuenta creada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function openEditAccountModal(acc){
    if(!acc) return;
    const isTarjeta = acc.type === 'tarjeta';
    const isSavings = acc.type === 'ahorro' || acc.type === 'corriente';
    const isEfectivo = acc.type === 'efectivo';
    openModal(`
      <h2>Editar cuenta</h2>
      <form id="editAccForm">
        <div class="form-grid">
          <div class="field"><label>Tipo</label><input type="text" value="${ACC_LABELS[acc.type]||acc.type}" disabled></div>
          <div class="field"><label>Nombre</label><input type="text" id="editAccName" value="${escapeHtml(acc.name)}" required></div>
          ${!isEfectivo ? `<div class="field"><label>Banco</label><select id="editAccBank">${bankOptionsHtml(acc.bank||'')}</select></div>` : ''}
          <div class="field"><label>${isTarjeta?'Deuda':'Saldo'}</label><input type="number" step="0.01" id="editAccBalance" value="${acc.balance}"></div>
          ${isTarjeta ? `
          <div class="field"><label>Red de la tarjeta</label><select id="editAccNetwork">${networkOptionsHtml(acc.network)}</select></div>
          <div class="field"><label>Límite de crédito (S/)</label><input type="number" min="0" step="0.01" id="editAccLimit" value="${acc.creditLimit||''}" placeholder="Ej: 5000"></div>
          <div class="field"><label>Día de corte (1-31)</label><input type="number" min="1" max="31" id="editAccClosing" value="${acc.closingDay||''}" placeholder="Ej: 15"></div>
          <div class="field"><label>Día de pago (1-31)</label><input type="number" min="1" max="31" id="editAccBilling" value="${acc.billingDay||''}" placeholder="Ej: 25"></div>
          ` : ''}
          ${isSavings ? `
          <div class="field"><label>Tasa de interés anual (%)</label><input type="number" min="0" step="0.01" id="editAccInterest" value="${acc.interestRate||''}" placeholder="Ej: 4.5"></div>
          <div class="field"><label>Depósito mensual automático (S/)</label><input type="number" min="0" step="0.01" id="editAccDeposit" value="${acc.monthlyDeposit||''}" placeholder="Ej: 200 (opcional)"></div>
          ` : ''}
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelEditAcc">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    `);
    document.getElementById('cancelEditAcc').addEventListener('click', closeModal);
    document.getElementById('editAccForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const name = document.getElementById('editAccName').value.trim();
      const balance = parseFloat(document.getElementById('editAccBalance').value) || 0;
      const networkEl = document.getElementById('editAccNetwork');
      const network = networkEl ? networkEl.value : undefined;
      const bankEl = document.getElementById('editAccBank');
      const bank = bankEl ? (bankEl.value || null) : undefined;
      const limitEl = document.getElementById('editAccLimit');
      const closingEl = document.getElementById('editAccClosing');
      const billingEl = document.getElementById('editAccBilling');
      const interestEl = document.getElementById('editAccInterest');
      const depositEl = document.getElementById('editAccDeposit');
      const creditLimit = limitEl ? (parseFloat(limitEl.value)||null) : undefined;
      const closingDay  = closingEl ? (parseInt(closingEl.value,10)||null) : undefined;
      const billingDay  = billingEl ? (parseInt(billingEl.value,10)||null) : undefined;
      const interestRate = interestEl ? (parseFloat(interestEl.value)||null) : undefined;
      const monthlyDeposit = depositEl ? (parseFloat(depositEl.value)||null) : undefined;
      if(!name){ setFieldError('editAccName', 'Ingresa un nombre'); return; }
      try{
        await apiCall('PUT', `/api/accounts/${acc.id}`, { name, balance, network, bank, creditLimit, closingDay, billingDay, interestRate, monthlyDeposit });
        closeModal();
        toast('Cuenta actualizada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function deleteAccount(id){
    const acc = data.accounts.find(a=>a.id===id);
    if(!acc) return;
    openConfirm({
      title: 'Eliminar cuenta',
      message: `¿Eliminar la cuenta "${acc.name}"? También se eliminarán sus transacciones asociadas.`,
      onConfirm: async ()=>{
        try{
          await apiCall('DELETE', `/api/accounts/${id}`);
          toast('Cuenta eliminada');
          await refreshAndRender();
        }catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  /* ---------------- RENDER: Tarjeta ---------------- */
  function shadeHex(hex, percent){
    const h = hex.replace('#','');
    const num = parseInt(h.length===3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const clamp = v => Math.max(0, Math.min(255, Math.round(v)));
    const r = clamp(((num>>16)&255) + (percent/100)*255);
    const g = clamp(((num>>8)&255) + (percent/100)*255);
    const b = clamp((num&255) + (percent/100)*255);
    return '#' + [r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
  }

  let selectedCardId = null;

  function renderCard(){
    const cards = data.accounts.filter(a=>a.type==='tarjeta');
    const grid = document.getElementById('cardsGrid');
    const empty = document.getElementById('cardsEmpty');
    const detailEl = document.getElementById('cardDetail');
    const addChargeBtn = document.getElementById('btnAddCardCharge');

    if(cards.length === 0){
      grid.innerHTML = '';
      detailEl.style.display = 'none'; detailEl.innerHTML = '';
      empty.style.display = 'block';
      if(addChargeBtn) addChargeBtn.style.display = 'none';
      return;
    }
    empty.style.display = 'none';

    if(!selectedCardId || !cards.find(c=>c.id===selectedCardId)){
      selectedCardId = cards[0].id;
    }
    if(addChargeBtn){ addChargeBtn.style.display = 'inline-flex'; addChargeBtn.dataset.cardid = selectedCardId; }

    grid.innerHTML = cards.map(c=>{
      const ac = accountColor(c);
      const haslimit = c.creditLimit && c.creditLimit > 0;
      // Sin tope en 100: si te pasaste del límite, el % real (ej. 102%) importa más que
      // ocultarlo detrás de un 100% que no distingue "justo al límite" de "en sobregiro".
      const util = haslimit ? Math.round((c.balance / c.creditLimit) * 100) : 0;
      const isOverLimit = haslimit && c.balance > c.creditLimit;
      const disponible = haslimit ? Math.max(0, c.creditLimit - c.balance) : null;
      const isActive = c.id === selectedCardId;
      const bankLabel = c.bank ? (PERUVIAN_BANKS[c.bank]||{label:c.bank}).label : c.name;
      return `<button type="button" class="ccard${isActive?' active':''}" data-action="select-card" data-id="${c.id}" style="--cc1:${ac.fg};--cc2:${shadeHex(ac.fg,-24)};">
        <div class="ccard-top">
          <span class="ccard-bank">${escapeHtml(bankLabel)}</span>
          ${isActive ? '<span class="ccard-check"><i class="ph ph-check"></i></span>' : ''}
        </div>
        <div class="ccard-chip"></div>
        <div class="ccard-figures">
          <p class="ccard-balance num">${formatMoney(haslimit ? disponible : c.balance)}</p>
          <p class="ccard-balance-label">${haslimit ? 'Disponible' : 'Deuda actual'}</p>
          ${haslimit ? `<p class="ccard-used">Usado: <span class="num">${formatMoney(c.balance)}</span></p>` : ''}
        </div>
        ${isOverLimit ? `<span class="ccard-warn" title="Superaste tu línea de crédito"><i class="ph ph-warning"></i> Sobregiro</span>`
          : (haslimit && util>=70 ? `<span class="ccard-warn" title="Utilización alta">${util}%</span>` : '')}
      </button>`;
    }).join('') + `
      <button type="button" class="ccard-add" data-action="open-add-account" data-type="tarjeta">
        <i class="ph ph-plus"></i><span>Nueva tarjeta</span>
      </button>`;

    renderCardDetail();
  }

  function renderCardDetail(){
    const detailEl = document.getElementById('cardDetail');
    const c = data.accounts.find(a=>a.id===selectedCardId);
    if(!c){ detailEl.style.display = 'none'; detailEl.innerHTML = ''; return; }
    detailEl.style.display = 'grid';

    const haslimit = c.creditLimit && c.creditLimit > 0;
    const util = haslimit ? Math.round((c.balance / c.creditLimit) * 100) : 0;
    const isOverLimit = haslimit && c.balance > c.creditLimit;
    const utilColor = isOverLimit || util > 90 ? 'var(--red)' : util >= 70 ? 'var(--yellow)' : 'var(--accent)';
    const disponible = haslimit ? Math.max(0, c.creditLimit - c.balance) : null;

    const fields = [];
    if(c.bank) fields.push(['Banco', bankBadgeHtml(c.bank)]);
    if(c.network) fields.push(['Red', networkBadgeHtml(c.network)]);
    if(c.closingDay) fields.push(['Día de corte', c.closingDay]);
    if(c.billingDay) fields.push(['Día de pago', c.billingDay]);
    fields.push(['Deuda actual', `<span class="num">${formatMoney(c.balance)}</span>`]);
    const fieldsHtml = fields.map(([k,v])=>`<div><dt>${k}</dt><dd${k==='Deuda actual'?' class="strong"':''}>${v}</dd></div>`).join('');

    const swatchesHtml = ACCOUNT_COLOR_PALETTE.map(key=>{
      const isActive = accountColorKey(c) === key;
      return `<button type="button" class="swatch${isActive?' active':''}" data-action="set-account-color" data-id="${c.id}" data-color="${key}" style="background:var(--${key})">${isActive?'<i class="ph ph-check"></i>':''}</button>`;
    }).join('');

    const payments = data.cardPayments.filter(p=>p.cardId===c.id).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    const paymentsHtml = payments.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin pagos registrados todavía.</p>`
      : payments.map(p=>{
        const src = data.accounts.find(a=>a.id===p.sourceId);
        return `<div class="hist-row">
          <div>
            <div class="num" style="font-weight:700;color:var(--ink);">${formatMoney(p.amount)}</div>
            <div class="hr-desc">${formatDate(p.date)} · desde ${escapeHtml(src?src.name:'(cuenta eliminada)')}</div>
          </div>
          <button class="icon-btn xs danger" data-action="delete-payment" data-id="${p.id}" title="Eliminar pago" aria-label="Eliminar pago"><i class="ph ph-trash"></i></button>
        </div>`;
      }).join('');

    const charges = (data.cardCharges||[]).filter(ch=>ch.cardId===c.id).sort((a,b)=>b.purchaseDate.localeCompare(a.purchaseDate));
    const chargesHtml = charges.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin compras en cuotas todavía.</p>`
      : charges.map(ch=>{
        const pct = Math.min(100, Math.round((ch.paidInstallments/ch.totalInstallments)*100));
        const done = ch.paidInstallments >= ch.totalInstallments;
        return `<div class="cuota-progress-box" style="margin-bottom:14px;">
          <div class="cuota-progress-row"><span>${escapeHtml(ch.description)} · ${formatMoney(ch.installmentAmount)}/mes</span><span class="num">${ch.paidInstallments}/${ch.totalInstallments}</span></div>
          <div class="ch-mini-bar"><div style="transform:scaleX(${(pct/100).toFixed(4)});background:var(--accent)"></div></div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
            <span class="muted" style="font-size:11.5px;">Total ${formatMoney(ch.totalAmount)} · ${formatDate(ch.purchaseDate)}</span>
            <div style="display:flex;gap:4px;">
              ${!done ? `<button class="btn btn-ghost btn-sm" data-action="mark-cardcharge" data-id="${ch.id}">Marcar cuota</button>` : `<span class="status-pill success"><i class="ph ph-check-circle"></i> Completa</span>`}
              <button class="icon-btn xs danger" data-action="delete-cardcharge" data-id="${ch.id}" title="Eliminar" aria-label="Eliminar compra"><i class="ph ph-trash"></i></button>
            </div>
          </div>
        </div>`;
      }).join('');

    const purchases = data.transactions.filter(t=>t.accountId===c.id).sort((a,b)=>b.date.localeCompare(a.date)||b.id.localeCompare(a.id));
    const purchasesHtml = purchases.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin compras registradas todavía.</p>`
      : purchases.map(t=>{
        const cc = categoryColor(t.category);
        const catIcon = CATEGORY_ICONS[t.category] || 'ph-credit-card';
        return `<div class="wb-act-row">
          <span class="wb-act-icon" style="background:${cc.bg};color:${cc.fg}"><i class="ph ${catIcon}"></i></span>
          <div><p class="wb-act-desc">${escapeHtml(t.description || t.category)}</p><p class="wb-act-meta">${formatDate(t.date)}</p></div>
          <span class="wb-act-amt ${t.type==='ingreso'?'in':'out'} num">${t.type==='ingreso'?'+':'-'}${formatMoney(t.amount)}</span>
          <div style="display:flex;gap:4px;">
            <button class="icon-btn xs" data-action="edit-tx" data-id="${t.id}" title="Editar" aria-label="Editar compra"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn xs danger" data-action="delete-tx" data-id="${t.id}" title="Eliminar" aria-label="Eliminar compra"><i class="ph ph-trash"></i></button>
          </div>
        </div>`;
      }).join('');

    detailEl.innerHTML = `
      <div class="wb-detail-main">
        <div class="wb-detail-head">
          <h2><i class="ph ph-credit-card"></i>${escapeHtml(c.name)}</h2>
          <div class="wb-detail-actions">
            <button class="icon-btn xs" data-action="edit-acc" data-id="${c.id}" title="Editar" aria-label="Editar tarjeta"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn xs danger" data-action="delete-acc" data-id="${c.id}" title="Eliminar" aria-label="Eliminar tarjeta"><i class="ph ph-trash"></i></button>
          </div>
        </div>
        ${haslimit ? `
        <div style="margin-bottom:16px;">
          <div class="cc-limit-row"><span>Utilización</span><span style="color:${utilColor};font-weight:700;">${util}%${isOverLimit?' · Sobregiro':''}</span></div>
          <div class="cc-util-track" style="height:8px;"><div class="cc-util-fill" style="transform:scaleX(${(Math.min(100,util)/100).toFixed(4)});background:${utilColor};"></div></div>
          ${isOverLimit
            ? `<div class="cc-available" style="color:var(--red);font-weight:700;"><i class="ph ph-warning-circle"></i> Te pasaste del límite por ${formatMoney(c.balance - c.creditLimit)}</div>`
            : `<div class="cc-available">Disponible: ${formatMoney(disponible)} de ${formatMoney(c.creditLimit)}</div>`}
        </div>` : ''}
        <dl class="wb-fields">${fieldsHtml}</dl>
        <p class="wb-theme-label">Color de la tarjeta</p>
        <div class="wb-theme-swatches">${swatchesHtml}</div>
        <button class="btn btn-primary" data-action="pay-card" data-id="${c.id}" style="margin-top:18px;">Pagar tarjeta</button>
      </div>
      <div class="wb-detail-side">
        <p class="section-label sm">Compras en cuotas</p>
        ${chargesHtml}
        <p class="section-label sm" style="margin-top:20px;">Historial de pagos</p>
        <div class="hist-list">${paymentsHtml}</div>
        <p class="section-label sm" style="margin-top:20px;">Historial de compras</p>
        <div class="wb-activity">${purchasesHtml}</div>
      </div>
    `;
  }

  function openAddCardChargeModal(cardId){
    const card = data.accounts.find(a=>a.id===cardId && a.type==='tarjeta');
    if(!card){ toast('Selecciona una tarjeta primero', 'error'); return; }
    openModal(`
      <h2>Nueva compra en cuotas</h2>
      <p style="color:var(--text-dim);font-size:13.5px;margin-bottom:16px;"><i class="ph ph-credit-card"></i> <strong>${escapeHtml(card.name)}</strong></p>
      <form id="addCardChargeForm">
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;"><label>Descripción</label><input type="text" id="ccDesc" placeholder="Ej: Televisor" required></div>
          <div class="field"><label>Monto total (S/)</label><input type="number" min="0.01" step="0.01" id="ccTotal" required></div>
          <div class="field"><label>N° de cuotas</label><input type="number" min="1" id="ccInstallments" value="1" required></div>
          <div class="field"><label>Fecha de compra</label><input type="date" id="ccDate" value="${todayStr()}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddCardCharge">Cancelar</button>
          <button type="submit" class="btn btn-primary">Registrar compra</button>
        </div>
      </form>`);
    document.getElementById('cancelAddCardCharge').addEventListener('click', closeModal);
    document.getElementById('addCardChargeForm').addEventListener('submit', async ev=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const body = {
        cardId,
        description: document.getElementById('ccDesc').value.trim(),
        totalAmount: parseFloat(document.getElementById('ccTotal').value)||0,
        totalInstallments: parseInt(document.getElementById('ccInstallments').value,10)||1,
        date: document.getElementById('ccDate').value || todayStr()
      };
      if(!body.description){ setFieldError('ccDesc', 'Ingresa una descripción'); return; }
      if(!body.totalAmount){ setFieldError('ccTotal', 'Ingresa un monto'); return; }
      try { await apiCall('POST','/api/cardcharges',body); closeModal(); toast('Compra registrada'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function markCardCharge(id){
    apiCall('POST',`/api/cardcharges/${id}/mark`).then(async ()=>{ toast('Cuota marcada'); await refreshAndRender(); }).catch(err=>toast(err.message,'error'));
  }

  function deleteCardCharge(id){
    const ch = (data.cardCharges||[]).find(x=>x.id===id);
    if(!ch) return;
    openConfirm({
      title: 'Eliminar compra',
      message: `¿Eliminar "${ch.description}"? Esto también revierte el cargo en la tarjeta.`,
      onConfirm: async ()=>{
        try { await apiCall('DELETE',`/api/cardcharges/${id}`); closeModal(); toast('Eliminado'); await refreshAndRender(); }
        catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  function openPayCardModal(card){
    const sources = data.accounts.filter(a=>a.type!=='tarjeta');
    if(sources.length === 0){
      toast('Necesitas una cuenta o efectivo para pagar la tarjeta');
      return;
    }
    openModal(`
      <h2>Pagar tarjeta · ${escapeHtml(card.name)}</h2>
      <p class="muted" style="margin-bottom:14px;">Deuda actual: <strong style="color:var(--yellow)">${formatMoney(card.balance)}</strong></p>
      <form id="payCardForm">
        <div class="form-grid">
          <div class="field"><label>Pagar desde</label><select id="paySource">${sources.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} (${formatMoney(s.balance)})</option>`).join('')}</select></div>
          <div class="field"><label>Monto a pagar</label><input type="number" min="0" step="0.01" id="payAmount" value="${Math.min(card.balance, sources[0].balance) || ''}" required></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelPayCard">Cancelar</button>
          <button type="submit" class="btn btn-primary">Confirmar pago</button>
        </div>
      </form>
    `);
    document.getElementById('cancelPayCard').addEventListener('click', closeModal);
    document.getElementById('payCardForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const sourceId = document.getElementById('paySource').value;
      const amount = parseFloat(document.getElementById('payAmount').value);
      if(!amount || amount<=0){ setFieldError('payAmount', 'Ingresa un monto válido'); return; }
      try{
        await apiCall('POST', '/api/card-payments', { cardId: card.id, sourceId, amount });
        closeModal();
        toast('Pago registrado');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function deletePayment(id){
    openConfirm({
      title: 'Eliminar pago',
      message: '¿Eliminar este pago? Se revertirá el saldo y la deuda.',
      onConfirm: async ()=>{
        try{
          await apiCall('DELETE', `/api/card-payments/${id}`);
          toast('Pago eliminado');
          await refreshAndRender();
        }catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  /* ---------------- RENDER: Chanchitos ---------------- */
  function currentMonthLabel(){
    const label = new Date().toLocaleDateString('es-PE',{month:'long'});
    return label.charAt(0).toUpperCase()+label.slice(1);
  }

  function pocketMonthProgress(p){
    const monthKey = todayStr().slice(0,7);
    const saved = (p.contributions||[]).filter(c=>c.date && c.date.slice(0,7)===monthKey).reduce((s,c)=>s+c.amount,0);
    const target = p.monthlyTarget || 0;
    const pct = target>0 ? Math.round((saved/target)*100) : null;
    const now = new Date();
    const daysInMonthCount = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
    const expectedPct = Math.round((now.getDate()/daysInMonthCount)*100);
    const behind = target>0 && now.getDate()>=5 && pct < (expectedPct - 15);
    return { saved, target, pct, behind, daysLeft: Math.max(0, daysInMonthCount - now.getDate()) };
  }

  function pocketAccountOptionsHtml(selected, ignorePocketId){
    const takenIds = new Set(data.pockets.filter(p=>p.id!==ignorePocketId && p.linkedAccountId).map(p=>p.linkedAccountId));
    const available = data.accounts.filter(a=>a.type!=='tarjeta' && (!takenIds.has(a.id) || a.id===selected));
    let html = `<option value="">Ninguna (no apartar cuenta)</option>`;
    html += available.map(a=>`<option value="${a.id}" ${a.id===selected?'selected':''}>${escapeHtml(a.name)}</option>`).join('');
    return html;
  }

  let selectedPocketId = null;

  // Aviso simple (no el motor completo de priorización, que queda para más adelante):
  // si hay una tarjeta muy cara de usar (utilización alta o en sobregiro), ahorrar en vez
  // de bajarla es, en la práctica, perder plata — el interés de la tarjeta come el ahorro.
  function renderPocketPriorityBanner(){
    const el = document.getElementById('pocketsPriorityBanner');
    if(!el) return;
    const critical = data.accounts.filter(a=>{
      if(a.type!=='tarjeta' || !a.creditLimit) return false;
      return a.balance > a.creditLimit || (a.balance/a.creditLimit)*100 > 90;
    });
    if(critical.length === 0 || data.pockets.length === 0){ el.innerHTML = ''; return; }
    const worst = critical.sort((a,b)=>(b.balance/b.creditLimit)-(a.balance/a.creditLimit))[0];
    const util = Math.round((worst.balance/worst.creditLimit)*100);
    el.innerHTML = `
      <div class="dd-urgent-banner" style="align-items:flex-start;">
        <i class="ph ph-warning-circle" style="margin-top:1px;"></i>
        <span>Tu tarjeta <strong>${escapeHtml(worst.name)}</strong> está ${util>100?'en sobregiro':`al ${util}% de uso`} — el interés de eso probablemente sea más alto que lo que rinde este ahorro. Antes de seguir metiendo plata a una meta, considera destinarla a bajar esa tarjeta.
          <button type="button" class="btn btn-ghost btn-sm" data-action="switch-tab" data-tab="tarjeta" style="margin-top:8px;">Ir a Tarjetas</button>
        </span>
      </div>`;
  }

  function renderPockets(){
    const grid = document.getElementById('pocketsGrid');
    const empty = document.getElementById('pocketsEmpty');
    const statsEl = document.getElementById('pocketsStats');
    const detailEl = document.getElementById('pocketDetail');

    renderPocketPriorityBanner();

    if(data.pockets.length === 0){
      grid.innerHTML = ''; statsEl.innerHTML = ''; detailEl.style.display = 'none'; detailEl.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';

    if(!selectedPocketId || !data.pockets.find(p=>p.id===selectedPocketId)){
      const primary = data.pockets.find(p=>p.isPrimary);
      selectedPocketId = primary ? primary.id : data.pockets[0].id;
    }

    const totalSaved = data.pockets.reduce((s,p)=>s+p.balance,0);
    let monthSaved = 0, monthTarget = 0, behindCount = 0, trackedCount = 0;
    data.pockets.forEach(p=>{
      if(!p.monthlyTarget) return;
      trackedCount++;
      const mp = pocketMonthProgress(p);
      monthSaved += mp.saved;
      monthTarget += p.monthlyTarget;
      if(mp.behind) behindCount++;
    });
    statsEl.innerHTML = `
      <div class="stat-tile-sm">
        <span class="st-icon neutral"><i class="ph ph-piggy-bank"></i></span>
        <div><p class="st-label">Ahorrado en total</p><p class="st-val num">${formatMoney(totalSaved)}</p></div>
      </div>
      <div class="stat-tile-sm">
        <span class="st-icon in"><i class="ph ph-check"></i></span>
        <div><p class="st-label">Este mes: ${currentMonthLabel().toLowerCase()}</p><p class="st-val num">${formatMoney(monthSaved)}${monthTarget>0?` <span class="of">de ${formatMoney(monthTarget)}</span>`:''}</p></div>
      </div>
      <div class="stat-tile-sm">
        <span class="st-icon ${behindCount>0?'warn':'in'}"><i class="ph ${behindCount>0?'ph-warning-circle':'ph-check'}"></i></span>
        <div><p class="st-label">Metas atrasadas</p><p class="st-val num">${behindCount} de ${trackedCount}</p></div>
      </div>
    `;

    grid.innerHTML = data.pockets.map(p=>{
      const c = accountColor(p);
      const isActive = p.id === selectedPocketId;
      const linkedAcc = p.linkedAccountId ? data.accounts.find(a=>a.id===p.linkedAccountId) : null;
      const totalPct = p.target > 0 ? Math.min(100, Math.round((p.balance/p.target)*100)) : 100;
      const mp = pocketMonthProgress(p);
      const monthHtml = p.monthlyTarget
        ? `<div class="gcard-month ${mp.behind?'behind':'ok'}"><i class="ph ${mp.behind?'ph-warning-circle':'ph-check'}"></i>${formatMoney(mp.saved)} / ${formatMoney(p.monthlyTarget)}${mp.behind?' — atrasada':''}</div>`
        : `<div class="gcard-month neutral">Sin meta mensual</div>`;
      return `<button type="button" class="gcard${isActive?' active':''}" data-action="select-pocket" data-id="${p.id}" style="--gc:${c.fg};--gc-soft:${c.soft};">
        ${p.isPrimary ? '<span class="gcard-star" title="Meta principal"><i class="ph ph-star"></i></span>' : ''}
        <div class="gcard-top">
          <span class="gcard-icon"><i class="ph ph-piggy-bank"></i></span>
          ${isActive ? '<span class="gcard-check"><i class="ph ph-check"></i></span>' : ''}
        </div>
        <p class="gcard-name">${linkedAcc?`<i class="ph ph-lock-simple" title="Cuenta apartada: ${escapeHtml(linkedAcc.name)}"></i> `:''}${escapeHtml(p.name)}</p>
        <p class="gcard-balance num">${formatMoney(p.balance)}</p>
        <div class="gcard-track"><div style="transform:scaleX(${totalPct/100});background:${c.fg}"></div></div>
        ${monthHtml}
      </button>`;
    }).join('') + `
      <button type="button" class="gcard-add" data-action="open-add-pocket">
        <i class="ph ph-plus"></i><span>Nueva meta</span>
      </button>`;

    renderPocketDetail();
  }

  function renderPocketDetail(){
    const detailEl = document.getElementById('pocketDetail');
    const p = data.pockets.find(x=>x.id===selectedPocketId);
    if(!p){ detailEl.style.display = 'none'; detailEl.innerHTML = ''; return; }
    detailEl.style.display = 'grid';

    const mp = pocketMonthProgress(p);
    const linkedAcc = p.linkedAccountId ? data.accounts.find(a=>a.id===p.linkedAccountId) : null;

    let warnHtml = '';
    if(mp.behind){
      const perDay = mp.daysLeft > 0 ? (p.monthlyTarget - mp.saved) / mp.daysLeft : Math.max(0, p.monthlyTarget - mp.saved);
      warnHtml = `<div class="ch-warn-banner"><i class="ph ph-warning-circle"></i><span>Vas atrasado para llegar a tu meta de ${currentMonthLabel().toLowerCase()} — con ${mp.daysLeft} día${mp.daysLeft===1?'':'s'} restantes, necesitas ahorrar <b class="num">${formatMoney(Math.max(0,perDay))}</b> por día para lograrlo.</span></div>`;
    }

    let monthBarHtml = '';
    if(p.monthlyTarget){
      const pct = Math.min(100, mp.pct || 0);
      monthBarHtml = `
        <p class="section-label sm">Este mes · ${currentMonthLabel()}</p>
        <div class="ch-mini-bar"><div style="transform:scaleX(${(pct/100).toFixed(4)});background:${mp.behind?'var(--ochre)':'var(--green)'}"></div></div>
        <div class="ch-mini-labels"><span class="num">${formatMoney(mp.saved)} ahorrado</span><span>Meta: <span class="num">${formatMoney(p.monthlyTarget)}</span></span></div>
      `;
    }

    let totalBarHtml = '';
    if(p.target){
      const totalPct = Math.min(100, Math.round((p.balance/p.target)*100));
      totalBarHtml = `
        <p class="section-label sm" style="margin-top:${p.monthlyTarget?'18px':'0'};">Meta total</p>
        <div class="ch-mini-bar"><div style="transform:scaleX(${(totalPct/100).toFixed(4)});background:${accountColor(p).fg}"></div></div>
        <div class="ch-mini-labels"><span class="num">${formatMoney(p.balance)} de ${formatMoney(p.target)}</span>${p.targetDate?`<span>Fecha: ${formatDate(p.targetDate)}</span>`:''}</div>
      `;
    }

    const fields = [];
    fields.push(['Cuenta apartada', linkedAcc ? `<i class="ph ph-lock-simple"></i> ${escapeHtml(linkedAcc.name)}` : '—']);
    if(p.rate) fields.push(['Crecimiento automático', p.rate+'% / mes']);
    fields.push(['Avisarme si me atraso', `<label class="mini-switch"><input type="checkbox" data-action="toggle-notify-pocket" data-id="${p.id}" ${p.notifyBehind?'checked':''}><span></span></label>`]);
    fields.push(['Meta principal', p.isPrimary ? '<span style="color:var(--yellow);display:flex;align-items:center;gap:5px;"><i class="ph ph-star"></i> Sí, se muestra en el Panel</span>' : `<button type="button" class="btn btn-ghost btn-sm" data-action="set-primary-pocket" data-id="${p.id}">Marcar como principal</button>`]);
    const fieldsHtml = fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const swatchesHtml = ACCOUNT_COLOR_PALETTE.map(key=>{
      const isActive = accountColorKey(p) === key;
      return `<button type="button" class="swatch${isActive?' active':''}" data-action="set-account-color" data-kind="pocket" data-id="${p.id}" data-color="${key}" style="background:var(--${key})">${isActive?'<i class="ph ph-check"></i>':''}</button>`;
    }).join('');

    const contribs = (p.contributions||[]).slice().sort((a,b)=>b.date.localeCompare(a.date));
    const groups = [];
    let current = null;
    contribs.forEach(c=>{
      const key = c.date.slice(0,7);
      if(!current || current.key !== key){ current = { key, items: [] }; groups.push(current); }
      current.items.push(c);
    });
    const thisMonthKey = todayStr().slice(0,7);
    const ledgerHtml = groups.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin aportes todavía.</p>`
      : groups.map((g,gi)=>{
          const d = new Date(g.key+'-01T00:00:00');
          const label = d.toLocaleDateString('es-PE',{month:'long',year:'numeric'});
          const rows = g.items.map(c=>`<div class="ch-ledger-row"><span class="num">${c.amount>=0?'+':''}${formatMoney(c.amount)}</span><span class="chl-date">${formatDate(c.date)}${c.note?' · '+escapeHtml(c.note):''}</span><button class="chl-del" data-action="del-pocket-contrib" data-id="${p.id}" data-cid="${c.id}" title="Eliminar aporte" aria-label="Eliminar aporte"><i class="ph ph-x"></i></button></div>`).join('');
          return `<p class="section-label sm" style="margin-top:${gi>0?'16px':'0'};">${label.charAt(0).toUpperCase()+label.slice(1)}</p><div class="ch-ledger${g.key===thisMonthKey?'':' dim'}">${rows}</div>`;
        }).join('');

    detailEl.innerHTML = `
      <div class="wb-detail-main">
        <div class="wb-detail-head">
          <h2><i class="ph ph-piggy-bank"></i>${escapeHtml(p.name)}</h2>
          <div class="wb-detail-actions">
            <button class="icon-btn xs" data-action="edit-pocket" data-id="${p.id}" title="Editar" aria-label="Editar meta"><i class="ph ph-pencil-simple"></i></button>
            <button class="icon-btn xs danger" data-action="delete-pocket" data-id="${p.id}" title="Eliminar" aria-label="Eliminar meta"><i class="ph ph-trash"></i></button>
          </div>
        </div>
        ${warnHtml}
        ${monthBarHtml}
        ${totalBarHtml}
        <dl class="wb-fields" style="margin-top:${(p.monthlyTarget||p.target)?'16px':'0'};">${fieldsHtml}</dl>
        <p class="wb-theme-label">Color de la meta</p>
        <div class="wb-theme-swatches">${swatchesHtml}</div>
        <div class="actions" style="margin-top:16px;flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" data-action="meter-pocket" data-id="${p.id}"><i class="ph ph-plus"></i> Agregar aporte</button>
          <button class="btn btn-ghost btn-sm" data-action="sacar-pocket" data-id="${p.id}"><i class="ph ph-minus"></i> Sacar</button>
        </div>
      </div>
      <div class="wb-detail-side">
        <p class="section-label sm">Aportes</p>
        ${ledgerHtml}
      </div>
    `;
  }

  async function setPocketField(id, patch){
    try{
      await apiCall('PUT', `/api/pockets/${id}`, patch);
      await refreshAndRender();
    }catch(err){ toast(err.message, 'error'); }
  }

  function deletePocketContribution(pocketId, cid){
    openConfirm({
      title: 'Eliminar aporte',
      message: '¿Eliminar este aporte?',
      onConfirm: async ()=>{
        try{
          await apiCall('DELETE', `/api/pockets/${pocketId}/contributions/${cid}`);
          toast('Aporte eliminado');
          await refreshAndRender();
        }catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  function openAddPocketModal(){
    openModal(`
      <h2>Nueva meta de ahorro</h2>
      <form id="addPocketForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="pocketName" placeholder="Ej: Viaje a la playa" required></div>
          <div class="field"><label>Saldo inicial</label><input type="number" min="0" step="0.01" id="pocketBalance" value="0"></div>
          <div class="field"><label>Meta mensual (S/) <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="pocketMonthlyTarget" placeholder="Ej: 300"></div>
          <div class="field"><label>Meta total (S/) <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="pocketTarget" placeholder="Ej: 5000"></div>
          <div class="field"><label>Fecha objetivo <span class="muted">(opcional)</span></label><input type="date" id="pocketTargetDate"></div>
          <div class="field"><label>Crecimiento automático % mensual <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="pocketRate" placeholder="Ej: 1.5"></div>
          <div class="field" style="grid-column:1/-1;"><label>Apartar una cuenta real <span class="muted">(opcional, no se puede gastar de ahí sin avisarte)</span></label><select id="pocketAccount">${pocketAccountOptionsHtml()}</select></div>
          <div class="field" style="grid-column:1/-1;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="pocketNotify" style="width:auto;cursor:pointer;">
              Avisarme por Telegram si voy atrasado este mes
            </label>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddPocket">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear meta</button>
        </div>
      </form>
    `);
    document.getElementById('cancelAddPocket').addEventListener('click', closeModal);
    document.getElementById('addPocketForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const name = document.getElementById('pocketName').value.trim();
      const balance = parseFloat(document.getElementById('pocketBalance').value) || 0;
      const monthlyTarget = parseFloat(document.getElementById('pocketMonthlyTarget').value) || null;
      const target = parseFloat(document.getElementById('pocketTarget').value) || null;
      const targetDate = document.getElementById('pocketTargetDate').value || null;
      const rateRaw = document.getElementById('pocketRate').value;
      const rate = rateRaw ? parseFloat(rateRaw) : null;
      const linkedAccountId = document.getElementById('pocketAccount').value || null;
      const notifyBehind = document.getElementById('pocketNotify').checked;
      if(!name){ setFieldError('pocketName', 'Ingresa un nombre'); return; }
      try{
        await apiCall('POST', '/api/pockets', { name, balance, rate, target, targetDate, monthlyTarget, linkedAccountId, notifyBehind });
        closeModal();
        toast('Meta creada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function openEditPocketModal(p){
    openModal(`
      <h2>Editar meta</h2>
      <form id="editPocketForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="editPocketName" value="${escapeHtml(p.name)}" required></div>
          <div class="field"><label>Meta mensual (S/) <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="editPocketMonthlyTarget" value="${p.monthlyTarget||''}" placeholder="Ej: 300"></div>
          <div class="field"><label>Meta total (S/) <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="editPocketTarget" value="${p.target||''}" placeholder="Ej: 5000"></div>
          <div class="field"><label>Fecha objetivo <span class="muted">(opcional)</span></label><input type="date" id="editPocketTargetDate" value="${p.targetDate||''}"></div>
          <div class="field"><label>Crecimiento automático % mensual <span class="muted">(opcional)</span></label><input type="number" min="0" step="0.01" id="editPocketRate" value="${p.rate || ''}" placeholder="Sin crecimiento"></div>
          <div class="field" style="grid-column:1/-1;"><label>Apartar una cuenta real <span class="muted">(opcional)</span></label><select id="editPocketAccount">${pocketAccountOptionsHtml(p.linkedAccountId, p.id)}</select></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelEditPocket">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    `);
    document.getElementById('cancelEditPocket').addEventListener('click', closeModal);
    document.getElementById('editPocketForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const name = document.getElementById('editPocketName').value.trim();
      const monthlyTarget = parseFloat(document.getElementById('editPocketMonthlyTarget').value) || null;
      const target = parseFloat(document.getElementById('editPocketTarget').value) || null;
      const targetDate = document.getElementById('editPocketTargetDate').value || null;
      const rateRaw = document.getElementById('editPocketRate').value;
      const rate = rateRaw ? parseFloat(rateRaw) : null;
      const linkedAccountId = document.getElementById('editPocketAccount').value || null;
      if(!name){ setFieldError('editPocketName', 'Ingresa un nombre'); return; }
      try{
        await apiCall('PUT', `/api/pockets/${p.id}`, { name, rate, target, targetDate, monthlyTarget, linkedAccountId });
        closeModal();
        toast('Meta actualizada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function openMovePocketModal(p, dir){
    const isMeter = dir === 'meter';
    openModal(`
      <h2>${isMeter?'Agregar aporte a':'Sacar dinero de'} "${escapeHtml(p.name)}"</h2>
      <p class="muted" style="margin-bottom:14px;">Saldo actual: <strong class="num" style="color:var(--ink)">${formatMoney(p.balance)}</strong></p>
      <form id="movePocketForm">
        <div class="form-grid">
          <div class="field"><label>Monto</label><input type="number" min="0.01" step="0.01" id="moveAmount" required autofocus></div>
          <div class="field"><label>Fecha</label><input type="date" id="moveDate" value="${todayStr()}"></div>
          <div class="field"><label>Nota <span class="muted">(opcional)</span></label><input type="text" id="moveNote" placeholder="${isMeter?'Ej: Ahorro del mes':'Ej: Emergencia'}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelMovePocket">Cancelar</button>
          <button type="submit" class="btn btn-primary">${isMeter?'Agregar':'Sacar'}</button>
        </div>
      </form>
    `);
    document.getElementById('cancelMovePocket').addEventListener('click', closeModal);
    document.getElementById('movePocketForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const amount = parseFloat(document.getElementById('moveAmount').value);
      if(!amount || amount<=0){ setFieldError('moveAmount', 'Ingresa un monto válido'); return; }
      const date = document.getElementById('moveDate').value || todayStr();
      const note = document.getElementById('moveNote').value.trim();
      const oldPct = p.target > 0 ? Math.min(100, Math.round((p.balance/p.target)*100)) : 100;
      try{
        await apiCall('POST', `/api/pockets/${p.id}/move`, { direction: dir, amount, date, note });
        closeModal();
        toast(isMeter ? 'Aporte agregado' : 'Dinero retirado');
        await refreshAndRender();
        if(isMeter) animatePocketFill(p.id, oldPct);
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  // "Llenado de alcancía": el track se reconstruye en cada render, así que para que se
  // vea crecer (no solo aparecer ya lleno) se fija primero al % viejo sin transición,
  // se fuerza reflow, y recién ahí se sube al % nuevo con una curva con rebote.
  function animatePocketFill(pocketId, oldPct){
    const card = document.querySelector(`.gcard[data-id="${pocketId}"]`);
    if(!card) return;
    const fill = card.querySelector('.gcard-track > div');
    const icon = card.querySelector('.gcard-icon');
    if(fill){
      const newTransform = fill.style.transform;
      fill.style.transition = 'none';
      fill.style.transform = `scaleX(${oldPct/100})`;
      fill.offsetWidth; // force reflow
      fill.style.transition = '';
      fill.style.transform = newTransform;
    }
    if(icon){
      icon.classList.add('pocket-pulse');
      setTimeout(()=>icon.classList.remove('pocket-pulse'), 500);
    }
  }

  function deletePocket(id){
    const p = data.pockets.find(x=>x.id===id);
    if(!p) return;
    openConfirm({
      title: 'Eliminar meta',
      message: `¿Eliminar la meta "${p.name}"? Se perderá su historial de aportes.`,
      onConfirm: async ()=>{
        try{
          await apiCall('DELETE', `/api/pockets/${id}`);
          toast('Meta eliminada');
          selectedPocketId = null;
          await refreshAndRender();
        }catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  /* ---------------- RENDER: Calendario ---------------- */
  let calViewDate = new Date();
  calViewDate.setDate(1);
  let calView = 'calendar'; // 'calendar' | 'list'

  function getCalEvents(daysInMonthCount) {
    const monthKey = calViewDate.getFullYear() + '-' + String(calViewDate.getMonth()+1).padStart(2,'0');
    const paidDeudaIds = new Set((data.deudaPayments||[]).filter(p=>p.month===monthKey).map(p=>p.deudaId));
    const byDay = {};
    function addEvent(day, type, item) {
      const d = Math.min(day, daysInMonthCount);
      if(!byDay[d]) byDay[d] = [];
      byDay[d].push({ type, item });
    }
    (data.reminders||[]).forEach(r => addEvent(r.dueDay, 'reminder', r));
    (data.deudas||[]).forEach(d => addEvent(d.dueDay, 'deuda', { ...d, paid: paidDeudaIds.has(d.id) }));
    data.accounts.filter(a=>a.type==='tarjeta'&&a.billingDay).forEach(c => addEvent(c.billingDay, 'card', c));
    return byDay;
  }

  function getDayEvents(day){
    const daysInMonth = new Date(calViewDate.getFullYear(), calViewDate.getMonth()+1, 0).getDate();
    const byDay = getCalEvents(daysInMonth);
    return byDay[day] || [];
  }

  function reminderUrgencyInfo(r){
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((nextOccurrence(r.dueDay, today) - today) / 86400000);
    if(days === 0) return { text:'Vence hoy', urgent:true };
    if(days < 0) return { text:`Vencido hace ${-days} día${-days===1?'':'s'}`, urgent:true };
    if(days <= 3) return { text:`Vence en ${days} día${days===1?'':'s'}`, urgent:true };
    return { text:`Vence en ${days} días`, urgent:false };
  }

  // Convierte un evento crudo del calendario ({type,item}) en algo listo para pintar,
  // ya sea como tarjeta en la ventana del día o como fila en la vista de Lista.
  function describeCalEvent(ev){
    const it = ev.item;
    if(ev.type === 'card'){
      return {
        etype:'card', eid: it.id, icon:'ph-credit-card', color:'var(--red)',
        name: it.name, tagHtml:'', amount: it.balance, approx:false,
        statusHtml: `<span class="status-pill danger"><i class="ph ph-scissors"></i>Corte</span>`,
        isPayable:false, payLabel:'', progress:null, urgent:false
      };
    }
    if(ev.type === 'reminder'){
      const isCuota = !!(it.totalInstallments && it.totalInstallments > 0);
      const paidN = it.paidInstallments || 0;
      const allPaid = isCuota && paidN >= it.totalInstallments;
      const urgency = reminderUrgencyInfo(it);
      return {
        etype:'reminder', eid: it.id,
        icon: isCuota ? 'ph-package' : 'ph-calendar-blank', color:'var(--accent2)',
        name: it.name,
        tagHtml: isCuota ? `<span class="dd-rate-chip">Cuota ${paidN}/${it.totalInstallments}</span>` : '',
        amount: it.amount, approx:false,
        statusHtml: allPaid
          ? `<span class="status-pill success"><i class="ph ph-check-circle"></i>Completado</span>`
          : `<span class="status-pill ${urgency.urgent?'warning':'info'}">${urgency.text}</span>`,
        isPayable: isCuota && !allPaid,
        payLabel: `Pagar cuota ${paidN+1}`,
        progress: isCuota ? { paid:paidN, total:it.totalInstallments, color:'var(--accent2)' } : null,
        urgent: urgency.urgent && !allPaid
      };
    }
    // deuda
    const urgency = deudaUrgencyInfo(it, it.paid);
    const color = deudaTypeColor(it.type);
    const isVariableApprox = !it.paid && it.variableAmount;
    return {
      etype:'deuda', eid: it.id,
      icon: DEUDA_TYPE_ICON[it.type] || 'ph-list', color,
      name: it.name,
      tagHtml: (it.type==='prestamo' && it.interestRate ? `<span class="dd-rate-chip">${it.interestRate}%</span>` : '') +
               (it.variableAmount ? `<span class="dd-variable-tag">Variable</span>` : ''),
      amount: isVariableApprox ? deudaReferenceAmount(it) : it.amount, approx: isVariableApprox,
      statusHtml: it.paid
        ? `<span class="status-pill success"><i class="ph ph-check-circle"></i>Pagado</span>`
        : `<span class="status-pill ${urgency.urgent?'warning':'info'}">${urgency.text}</span>`,
      isPayable: !it.paid,
      payLabel: 'Pagar',
      progress: (it.type==='prestamo' && it.totalInstallments) ? { paid: it.paidInstallments||0, total: it.totalInstallments, color } : null,
      urgent: urgency.urgent && !it.paid
    };
  }

  function dayEventCardHtml(desc){
    const progressHtml = desc.progress ? `
      <div class="cuota-progress" style="margin:0 0 10px;">
        <div class="cp-label"><span>Cuotas pagadas</span><span>${desc.progress.paid}/${desc.progress.total}</span></div>
        <div class="ch-mini-bar"><div style="transform:scaleX(${(desc.progress.paid/desc.progress.total).toFixed(4)});background:${desc.progress.color};"></div></div>
      </div>` : '';
    const payBtn = desc.isPayable
      ? `<button type="button" class="btn btn-primary btn-sm" data-action="cal-pay" data-etype="${desc.etype}" data-eid="${desc.eid}">${desc.payLabel}</button>`
      : '';
    return `<div class="day-event-card${desc.urgent?' urgent':''}">
      <div class="dec-top">
        <div class="cal-event-icon" style="background:color-mix(in srgb, ${desc.color} 18%, transparent);color:${desc.color};"><i class="ph ${desc.icon}"></i></div>
        <div class="dec-info">
          <div class="dec-name">${escapeHtml(desc.name)}${desc.tagHtml}</div>
          <div class="dec-sub"><span class="num">${desc.approx?'~':''}${formatMoney(desc.amount||0)}</span>${desc.statusHtml}</div>
        </div>
      </div>
      ${progressHtml}
      <div class="dec-actions">${payBtn}
        <button type="button" class="icon-btn xs" data-action="cal-edit" data-etype="${desc.etype}" data-eid="${desc.eid}" title="Editar"><i class="ph ph-pencil-simple"></i></button>
      </div>
    </div>`;
  }

  function listRowHtml(day, desc){
    const payBtn = desc.isPayable
      ? `<button type="button" class="btn btn-primary btn-sm" data-action="cal-pay" data-etype="${desc.etype}" data-eid="${desc.eid}">${desc.payLabel}</button>`
      : '';
    return `<div class="cal-event-row${desc.urgent?' urgent':''}" role="button" tabindex="0" data-action="open-day-modal" data-id="${day}">
      <div class="cal-event-day">${day}</div>
      <div class="cal-event-icon" style="background:color-mix(in srgb, ${desc.color} 18%, transparent);color:${desc.color};"><i class="ph ${desc.icon}"></i></div>
      <div class="cal-event-label">${escapeHtml(desc.name)}${desc.tagHtml}</div>
      <div class="cal-event-amt num">${desc.approx?'~':''}${formatMoney(desc.amount||0)}</div>
      ${desc.statusHtml}
      <div class="cal-event-actions">${payBtn}
        <button type="button" class="icon-btn xs" data-action="cal-edit" data-etype="${desc.etype}" data-eid="${desc.eid}" title="Editar"><i class="ph ph-pencil-simple"></i></button>
      </div>
    </div>`;
  }

  function dispatchCalPay(etype, id){
    if(etype === 'deuda') openPayDeudaModal((data.deudas||[]).find(d=>d.id===id));
    else if(etype === 'reminder') openPayInstallmentModal((data.reminders||[]).find(r=>r.id===id));
  }
  function dispatchCalEdit(etype, id){
    if(etype === 'deuda') openEditDeudaModal((data.deudas||[]).find(d=>d.id===id));
    else if(etype === 'reminder') openEditReminderModal((data.reminders||[]).find(r=>r.id===id));
    else if(etype === 'card') openEditAccountModal((data.accounts||[]).find(a=>a.id===id));
  }

  function openDayModal(day){
    const events = getDayEvents(day);
    const dateObj = new Date(calViewDate.getFullYear(), calViewDate.getMonth(), day);
    let weekday = dateObj.toLocaleDateString('es-PE', { weekday:'long' });
    weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    if(events.length === 0){
      openModal(`
        <h2>Día ${day} · ${weekday}</h2>
        <p class="muted" style="margin-bottom:16px;">Sin pagos programados este día.</p>
        <div class="modal-actions" style="justify-content:flex-start;">
          <button type="button" class="btn btn-primary btn-sm" data-action="cal-add-for-day" data-day="${day}"><i class="ph ph-plus"></i> Agregar pago para el día ${day}</button>
        </div>
      `);
    } else {
      openModal(`<h2>Día ${day} · ${weekday}</h2>` + events.map(ev => dayEventCardHtml(describeCalEvent(ev))).join(''));
    }
  }

  function ensureMonthPickerOptions(){
    const monthSel = document.getElementById('monthPickerSelect');
    if(monthSel.options.length) return;
    const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    monthSel.innerHTML = months.map((m,i)=>`<option value="${i}">${m}</option>`).join('');
    const yearSel = document.getElementById('yearPickerSelect');
    const nowY = new Date().getFullYear();
    let yearsHtml = '';
    for(let y=nowY-3; y<=nowY+5; y++) yearsHtml += `<option value="${y}">${y}</option>`;
    yearSel.innerHTML = yearsHtml;
  }
  function toggleMonthPicker(){
    ensureMonthPickerOptions();
    const el = document.getElementById('monthPicker');
    const opening = !el.classList.contains('open');
    el.classList.toggle('open');
    if(opening){
      document.getElementById('monthPickerSelect').value = calViewDate.getMonth();
      document.getElementById('yearPickerSelect').value = calViewDate.getFullYear();
    }
  }
  function applyMonthPicker(){
    const m = parseInt(document.getElementById('monthPickerSelect').value, 10);
    const y = parseInt(document.getElementById('yearPickerSelect').value, 10);
    calViewDate = new Date(y, m, 1);
    document.getElementById('monthPicker').classList.remove('open');
    renderCalendar();
  }
  function setCalView(view){
    calView = view;
    document.querySelectorAll('.view-tab').forEach(t=>{
      const active = t.dataset.view === view;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.getElementById('calendarViewCard').style.display = view === 'calendar' ? 'block' : 'none';
    document.getElementById('listViewCard').style.display = view === 'list' ? 'block' : 'none';
  }

  function renderCalendar(){
    ensureMonthPickerOptions();
    const label = calViewDate.toLocaleDateString('es-PE', { month:'long', year:'numeric' });
    const labelText = label.charAt(0).toUpperCase() + label.slice(1);
    document.getElementById('calMonthLabel').textContent = labelText;
    const monthName = calViewDate.toLocaleDateString('es-PE', { month:'long' });
    document.getElementById('calListMonthLabel').textContent = monthName + ' de ' + calViewDate.getFullYear();
    document.getElementById('calendarViewCard').style.display = calView === 'calendar' ? 'block' : 'none';
    document.getElementById('listViewCard').style.display = calView === 'list' ? 'block' : 'none';

    const year = calViewDate.getFullYear(), month = calViewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let startOffset = firstDay.getDay() - 1;
    if(startOffset < 0) startOffset = 6;

    const byDay = getCalEvents(daysInMonth);
    const todayStrLocal = todayStr();
    let html = '';
    for(let i=0; i<startOffset; i++) html += `<div class="cal-day empty"></div>`;
    for(let d=1; d<=daysInMonth; d++){
      const iso = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const events = byDay[d] || [];
      const hasEvents = events.length > 0;

      let bottomHtml = '';
      if(events.length === 1){
        const ev = events[0];
        const rawName = ev.item.name || '';
        const label = rawName.length > 8 ? rawName.slice(0,7)+'…' : rawName;
        if(ev.type === 'reminder'){
          bottomHtml = `<span class="cal-chip cal-chip-r" title="${escapeHtml(rawName)}">${escapeHtml(label)}</span>`;
        } else if(ev.type === 'deuda'){
          const paid = ev.item.paid;
          bottomHtml = `<span class="cal-chip cal-chip-d${paid?' chip-paid':''}" title="${escapeHtml(rawName)}">${escapeHtml(label)}</span>`;
        } else {
          bottomHtml = `<span class="cal-chip cal-chip-c" title="${escapeHtml(rawName)} — Corte"><i class="ph ph-credit-card"></i></span>`;
        }
      } else if(events.length >= 2){
        bottomHtml = `<div class="cal-dots">` + events.slice(0,4).map(ev=>{
          if(ev.type==='reminder') return `<span class="cal-dot-r" title="${escapeHtml(ev.item.name||'')}"></span>`;
          if(ev.type==='deuda') return `<span class="cal-dot-d${ev.item.paid?' chip-paid':''}" title="${escapeHtml(ev.item.name||'')}"></span>`;
          return `<span class="cal-dot-c" title="${escapeHtml(ev.item.name||'')} — Corte"></span>`;
        }).join('') + `</div>` + (events.length>4?`<span style="font-size:9px;color:var(--text-dimmer);text-align:center;">+${events.length-4}</span>`:'');
      }

      const isIncomeDay = (data.settings && data.settings.incomeDays || []).includes(d);
      html += `<div class="cal-day ${iso===todayStrLocal?'today':''} ${hasEvents?'has-events':''} ${isIncomeDay?'income-day':''}" role="button" tabindex="0" data-action="open-day-modal" data-id="${d}">
        ${isIncomeDay ? `<span class="cal-income-badge" title="Día de sueldo"><i class="ph ph-hand-coins"></i></span>` : ''}
        <span class="cal-day-num">${d}</span>
        ${bottomHtml ? `<div class="cal-chips">${bottomHtml}</div>` : ''}
      </div>`;
    }
    document.getElementById('calGrid').innerHTML = html;

    // Vista de Lista: todos los eventos del mes, ordenados por día
    const allEvents = [];
    Object.entries(byDay).forEach(([day, evs]) => {
      evs.forEach(ev => allEvents.push({ day: Number(day), ...ev }));
    });
    allEvents.sort((a,b)=>a.day-b.day);

    const listEl = document.getElementById('calEventsList');
    const emptyEl = document.getElementById('calEventsEmpty');
    if(allEvents.length > 0){
      emptyEl.style.display = 'none';
      listEl.innerHTML = allEvents.map(ev => listRowHtml(ev.day, describeCalEvent(ev))).join('');
    } else {
      listEl.innerHTML = '';
      emptyEl.style.display = 'block';
    }
  }

  function renderReminders(){
    renderCalendar();
  }

  function reminderAccountOptionsHtml(selected){
    let html = `<option value="">Sin cuenta asociada</option>`;
    html += data.accounts.map(a => `<option value="${a.id}" ${a.id===selected?'selected':''}>${escapeHtml(a.name)}</option>`).join('');
    return html;
  }

  function openAddReminderModal(presetDay){
    openModal(`
      <h2>Nuevo pago programado</h2>
      <form id="addReminderForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="remName" placeholder="Ej: Televisor Samsung" required></div>
          <div class="field"><label>Día del mes (1-31)</label><input type="number" min="1" max="31" id="remDay" value="${presetDay||''}" placeholder="Ej: 15" required></div>
          <div class="field" style="grid-column:1/-1;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="remIsCuota" style="width:auto;cursor:pointer;">
              Es un plan de cuotas (compra financiada)
            </label>
          </div>
          <div class="field" id="cuotaCountField" style="display:none;"><label>Número de cuotas</label><input type="number" min="1" id="remTotalInstallments" placeholder="Ej: 6"></div>
          <div class="field"><label id="remAmountLabel">Monto por cuota (opcional)</label><input type="number" min="0" step="0.01" id="remAmount" placeholder="Ej: 150000"></div>
          <div class="field"><label>Cuenta (opcional)</label><select id="remAccount">${reminderAccountOptionsHtml()}</select></div>
          <div class="field"><label>Avisar con cuántos días de anticipación</label><input type="number" min="0" max="15" id="remNotify" value="1"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddReminder">Cancelar</button>
          <button type="submit" class="btn btn-primary">Crear</button>
        </div>
      </form>
    `);
    document.getElementById('cancelAddReminder').addEventListener('click', closeModal);
    document.getElementById('remIsCuota').addEventListener('change', function(){
      document.getElementById('cuotaCountField').style.display = this.checked ? 'flex' : 'none';
      document.getElementById('remAmountLabel').textContent = this.checked ? 'Monto por cuota (opcional)' : 'Monto (opcional)';
    });
    document.getElementById('addReminderForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const name = document.getElementById('remName').value.trim();
      const dueDay = parseInt(document.getElementById('remDay').value, 10);
      const amount = parseFloat(document.getElementById('remAmount').value) || null;
      const accountId = document.getElementById('remAccount').value || null;
      const notifyDaysBefore = parseInt(document.getElementById('remNotify').value, 10) || 0;
      const isCuota = document.getElementById('remIsCuota').checked;
      const totalInstallments = isCuota ? (parseInt(document.getElementById('remTotalInstallments').value,10) || null) : null;
      if(!name){ setFieldError('remName', 'Ingresa un nombre'); return; }
      if(isCuota && !totalInstallments){ setFieldError('remTotalInstallments', 'Ingresa el número de cuotas'); return; }
      try{
        await apiCall('POST', '/api/reminders', { name, dueDay, amount, accountId, notifyDaysBefore, totalInstallments });
        closeModal();
        toast(isCuota ? `Plan de ${totalInstallments} cuotas creado` : 'Pago programado creado');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function openEditReminderModal(r){
    const isCuota = !!(r.totalInstallments && r.totalInstallments > 0);
    openModal(`
      <h2>Editar pago programado</h2>
      <form id="editReminderForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="remName" value="${escapeHtml(r.name)}" required></div>
          <div class="field"><label>Día del mes (1-31)</label><input type="number" min="1" max="31" id="remDay" value="${r.dueDay}" required></div>
          ${isCuota ? `<div class="field"><label>Cuotas (pagadas ${r.paidInstallments||0}/${r.totalInstallments})</label><input type="number" min="${r.paidInstallments||0}" id="remTotalInstallments" value="${r.totalInstallments}"></div>` : ''}
          <div class="field"><label>${isCuota?'Monto por cuota':'Monto'} (opcional)</label><input type="number" min="0" step="0.01" id="remAmount" value="${r.amount || ''}"></div>
          <div class="field"><label>Cuenta (opcional)</label><select id="remAccount">${reminderAccountOptionsHtml(r.accountId)}</select></div>
          <div class="field"><label>Avisar con cuántos días de anticipación</label><input type="number" min="0" max="15" id="remNotify" value="${r.notifyDaysBefore}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" data-action="delete-reminder" data-id="${r.id}" style="margin-right:auto;"><i class="ph ph-trash"></i> Eliminar</button>
          <button type="button" class="btn btn-ghost" id="cancelEditReminder">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar cambios</button>
        </div>
      </form>
    `);
    document.getElementById('cancelEditReminder').addEventListener('click', closeModal);
    document.getElementById('editReminderForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const name = document.getElementById('remName').value.trim();
      const dueDay = parseInt(document.getElementById('remDay').value, 10);
      const amount = parseFloat(document.getElementById('remAmount').value) || null;
      const accountId = document.getElementById('remAccount').value || null;
      const notifyDaysBefore = parseInt(document.getElementById('remNotify').value, 10) || 0;
      const totalInstEl = document.getElementById('remTotalInstallments');
      const totalInstallments = totalInstEl ? (parseInt(totalInstEl.value,10) || null) : undefined;
      if(!name){ setFieldError('remName', 'Ingresa un nombre'); return; }
      try{
        const payload = { name, dueDay, amount, accountId, notifyDaysBefore };
        if(totalInstallments !== undefined) payload.totalInstallments = totalInstallments;
        await apiCall('PUT', `/api/reminders/${r.id}`, payload);
        closeModal();
        toast('Pago actualizado');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function openPayInstallmentModal(r){
    const sources = data.accounts.filter(a=>a.type!=='tarjeta');
    const cuotaNum = (r.paidInstallments||0) + 1;
    const needsAccount = !!(r.amount && sources.length > 0);
    openModal(`
      <h2>Registrar cuota ${cuotaNum}/${r.totalInstallments}</h2>
      <p style="color:var(--text-dim);font-size:13.5px;margin-bottom:16px;">${escapeHtml(r.name)}${r.amount ? ' · <strong style="color:var(--ink);">'+formatMoney(r.amount)+'</strong> por cuota' : ''}</p>
      <form id="payInstForm">
        ${needsAccount ? `
        <div class="form-grid">
          <div class="field"><label>Descontar de cuenta</label>
            <select id="payInstSource">${sources.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} (${formatMoney(s.balance)})</option>`).join('')}</select>
          </div>
        </div>` : `<p class="muted" style="margin-bottom:12px;">Solo se marcará como pagada (no hay monto definido).</p>`}
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelPayInst">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="ph ph-check"></i> Confirmar pago</button>
        </div>
      </form>
    `);
    document.getElementById('cancelPayInst').addEventListener('click', closeModal);
    document.getElementById('payInstForm').addEventListener('submit', async (ev)=>{
      ev.preventDefault();
      const accountId = needsAccount ? document.getElementById('payInstSource').value : null;
      try{
        const result = await apiCall('POST', `/api/reminders/${r.id}/pay`, { accountId });
        closeModal();
        await refreshAndRender();
        if(result.completed){
          setTimeout(()=>showCelebrationModal(r, result), 300);
        } else {
          toast(`Cuota ${result.cuotaNum}/${result.totalInstallments} pagada`);
          if(result.onTime) setTimeout(()=>toast('¡Pagaste a tiempo! 👏'), 1200);
        }
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  function showCelebrationModal(r, result){
    const savingsMsg = r.amount
      ? `Ahora tienes <strong style="color:var(--green)">${formatMoney(r.amount)}</strong> libres al mes que puedes redirigir a tu meta de ahorro.`
      : '';
    openModal(`
      <div style="text-align:center;padding:8px 0 16px;">
        <div style="font-size:54px;margin-bottom:14px;line-height:1;">🎉</div>
        <h2 style="font-size:21px;margin-bottom:10px;color:var(--ink);">¡Felicitaciones!</h2>
        <p style="color:var(--text-dim);font-size:14.5px;margin-bottom:16px;line-height:1.5;">
          Terminaste de pagar todas las cuotas de<br><strong style="color:var(--ink);">"${escapeHtml(r.name)}"</strong>.
        </p>
        ${savingsMsg ? `<div style="background:rgba(31,122,77,.09);border:1px solid rgba(31,122,77,.2);border-radius:14px;padding:14px 16px;text-align:left;font-size:13.5px;line-height:1.55;color:var(--text);margin-bottom:20px;">${savingsMsg} ¡Eso te acerca más a tu meta mensual!</div>` : ''}
        <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="document.getElementById('modalOverlay').classList.remove('open');">¡Genial, lo logré!</button>
      </div>
    `);
  }

  function deleteReminder(id){
    openConfirm({
      title: 'Eliminar pago programado',
      message: '¿Eliminar este pago programado?',
      onConfirm: async ()=>{
        try{
          await apiCall('DELETE', `/api/reminders/${id}`);
          closeModal();
          toast('Pago eliminado');
          await refreshAndRender();
        }catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  /* ---------------- DEUDAS & compromisos ---------------- */
  const DEUDA_TYPES = {
    agua:        { label:'Agua',               icon:'💧' },
    luz:         { label:'Luz / Electricidad', icon:'⚡' },
    gas:         { label:'Gas',                icon:'🔥' },
    internet:    { label:'Internet / TV',      icon:'📡' },
    prestamo:    { label:'Préstamo personal',  icon:'🏦' },
    alquiler:    { label:'Alquiler',           icon:'🏠' },
    suscripcion: { label:'Suscripción',        icon:'📱' },
    otro:        { label:'Otro',               icon:'📋' }
  };
  // Los <option> nativos no aceptan HTML, así que el emoji de arriba se usa solo ahí;
  // para renderizado real (encabezados, tarjetas) usamos este set de iconos Phosphor.
  const DEUDA_TYPE_ICON = {
    agua:'ph-drop', luz:'ph-lightning', gas:'ph-fire', internet:'ph-wifi-high',
    prestamo:'ph-bank', alquiler:'ph-house', suscripcion:'ph-device-mobile', otro:'ph-list'
  };
  // Los tipos son un enum fijo (no elegido por el usuario), así que el color va por tipo
  // y no por una paleta seleccionable, a diferencia de cuentas/tarjetas/chanchitos.
  const DEUDA_TYPE_COLOR_VAR = {
    agua:'--sage', luz:'--yellow', gas:'--red', internet:'--lavender',
    prestamo:'--accent2', alquiler:'--ochre', suscripcion:'--accent', otro:'--text-dimmer'
  };
  const LENDER_LABELS = { banco:'Banco', financiera:'Financiera', app:'App / Fintech', persona:'Persona' };

  function deudaTypeColor(type){
    return cssVarValue(DEUDA_TYPE_COLOR_VAR[type] || '--text-dimmer');
  }

  function deudaTypeOptionsHtml(selected, excludePrestamo){
    return Object.entries(DEUDA_TYPES).filter(([k])=> !excludePrestamo || k!=='prestamo').map(([k,v])=>
      `<option value="${k}" ${k===selected?'selected':''}>${v.icon} ${v.label}</option>`
    ).join('');
  }

  function lenderTypeOptionsHtml(selected){
    return Object.entries(LENDER_LABELS).map(([k,v])=>
      `<option value="${k}" ${k===selected?'selected':''}>${v}</option>`
    ).join('');
  }

  function deudaUrgencyInfo(d, paid){
    if(paid) return { text:'Pagado este mes', urgent:false };
    const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.round((nextOccurrence(d.dueDay, today)-today)/86400000);
    if(days === 0) return { text:'Vence hoy', urgent:true };
    if(days < 0) return { text:`Vencido hace ${-days} día${-days===1?'':'s'}`, urgent:true };
    if(days <= 3) return { text:`Vence en ${days} día${days===1?'':'s'}`, urgent:true };
    return { text:`Vence en ${days} días`, urgent:false };
  }

  // Para compromisos de monto variable (agua, luz...) no hay un "monto mensual" fijo;
  // se muestra un promedio de los últimos pagos como referencia, no como valor exacto.
  function deudaReferenceAmount(d){
    const pays = (data.deudaPayments||[]).filter(p=>p.deudaId===d.id && p.amount)
      .slice().sort((a,b)=>b.month.localeCompare(a.month)).slice(0,3);
    if(pays.length === 0) return d.amount || 0;
    return pays.reduce((s,p)=>s+p.amount,0) / pays.length;
  }

  // Servicios (agua, luz, alquiler...) y Préstamos de banco/financiera/app viven en
  // pestañas separadas, pero comparten el mismo modelo de datos (store.deudas) — esta
  // config parametriza el mismo render/detalle para ambas listas, cada una con su propia
  // selección, en vez de duplicar ~180 líneas de HTML por segunda vez.
  const DEUDA_LIST_CONFIG = {
    servicio: { summaryEl:'deudasSummary', listEl:'deudasList', detailEl:'deudaDetail', emptyEl:'deudasEmpty', predicate: d => d.type !== 'prestamo', grouped:true },
    bankloan: { summaryEl:'bankLoansSummary', listEl:'bankLoansList', detailEl:'bankLoanDetail', emptyEl:'bankLoansEmpty', predicate: d => d.type === 'prestamo', grouped:false }
  };
  let selectedDeudaId = { servicio:null, bankloan:null };

  function renderDeudaKind(kind){
    const cfg = DEUDA_LIST_CONFIG[kind];
    const summaryEl = cfg.summaryEl && document.getElementById(cfg.summaryEl);
    const listEl    = document.getElementById(cfg.listEl);
    const emptyEl   = document.getElementById(cfg.emptyEl);
    const detailEl  = document.getElementById(cfg.detailEl);
    if(!listEl) return;

    const monthKey  = new Date().toISOString().slice(0,7);
    const deudas    = (data.deudas || []).filter(cfg.predicate);
    const payments  = data.deudaPayments || [];

    if(deudas.length === 0){
      if(summaryEl) summaryEl.style.display = 'none';
      listEl.innerHTML = '';
      if(detailEl){ detailEl.style.display = 'none'; detailEl.innerHTML = ''; }
      if(emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if(emptyEl) emptyEl.style.display = 'none';
    if(summaryEl) summaryEl.style.display = 'block';

    if(!selectedDeudaId[kind] || !deudas.find(d=>d.id===selectedDeudaId[kind])){
      selectedDeudaId[kind] = deudas[0].id;
    }

    const paymentsThisMonth = payments.filter(p => p.month === monthKey);
    const paidIds  = new Set(paymentsThisMonth.map(p => p.deudaId));

    if(summaryEl){
      const totalMes = deudas.reduce((s,d) => s + (d.type==='prestamo' || !d.variableAmount ? (d.amount||0) : deudaReferenceAmount(d)), 0);
      const pagado   = paymentsThisMonth.reduce((s,p) => s + (deudas.some(d=>d.id===p.deudaId) ? (p.amount||0) : 0), 0);
      const pendiente= Math.max(0, totalMes - pagado);
      const relevantPaidIds = deudas.filter(d=>paidIds.has(d.id)).length;
      const pct      = deudas.length > 0 ? Math.round((relevantPaidIds / deudas.length) * 100) : 0;
      const now      = new Date();
      const mesLabel = now.toLocaleDateString('es-PE', { month:'long', year:'numeric' });
      summaryEl.innerHTML = `
        <div class="ds-head">
          <div>
            <div class="ds-title">Este mes · ${mesLabel.charAt(0).toUpperCase()+mesLabel.slice(1)}</div>
            <div class="ds-total">${formatMoney(totalMes)}<span class="ds-sub"> / mes aprox.</span></div>
          </div>
          <div class="ds-count">
            <div class="ds-count-num">${relevantPaidIds}/${deudas.length}</div>
            <div class="ds-count-lbl">pagadas</div>
          </div>
        </div>
        <div class="ds-bar-track"><div class="ds-bar-fill" style="transform:scaleX(${(pct/100).toFixed(4)})"></div></div>
        <div class="ds-labels">
          <span class="ds-label green num"><i class="ph ph-check-circle"></i> ${formatMoney(pagado)} pagado</span>
          <span class="ds-label red num"><i class="ph ph-hourglass"></i> ${formatMoney(pendiente)} pendiente</span>
        </div>`;
    }

    function itemHtml(d){
      const paid   = paidIds.has(d.id);
      const payRec = paymentsThisMonth.find(p => p.deudaId === d.id);
      const acc    = d.accountId ? data.accounts.find(a => a.id === d.accountId) : null;
      const color  = deudaTypeColor(d.type);
      const isSelected = d.id === selectedDeudaId[kind];
      const urgency = deudaUrgencyInfo(d, paid);
      let displayAmount, approx = false;
      if(paid) displayAmount = (payRec && payRec.amount != null) ? payRec.amount : d.amount;
      else if(d.variableAmount){ displayAmount = deudaReferenceAmount(d); approx = true; }
      else displayAmount = d.amount;
      const metaParts = [`Día ${d.dueDay}`];
      if(acc) metaParts.push(escapeHtml(acc.name));
      if(d.type==='prestamo' && d.lenderName) metaParts.push(escapeHtml(d.lenderName));
      return `<div class="deuda-item${paid?' paid':''}${isSelected?' active':''}" role="button" tabindex="0" data-action="select-deuda" data-kind="${kind}" data-id="${d.id}" style="--dc:${color};">
        <span class="di-dot"></span>
        <div class="di-left">
          <div class="di-name">${escapeHtml(d.name)}${d.type==='prestamo' && d.interestRate ? `<span class="dd-rate-chip">${d.interestRate}%</span>` : ''}${d.variableAmount?`<span class="dd-rate-chip">Variable</span>`:''}${d.autoDebit?`<span class="dd-rate-chip" title="Débito automático"><i class="ph ph-repeat"></i> Auto</span>`:''}</div>
          <div class="di-meta">${metaParts.join(' · ')}</div>
        </div>
        <div class="di-urgency${urgency.urgent && !paid?' urgent':''}">${paid ? '<i class="ph ph-check-circle"></i> Pagado' : urgency.text}</div>
        <div class="di-right">
          <div class="di-amount">${displayAmount ? (approx?'~'+formatMoney(displayAmount):formatMoney(displayAmount)) : '—'}</div>
          <div class="di-actions">
            ${paid
              ? `<button class="icon-btn xs" data-action="unpay-deuda" data-id="${payRec.id}" title="Deshacer pago" aria-label="Deshacer pago"><i class="ph ph-arrow-counter-clockwise"></i></button>`
              : `<button class="btn btn-primary btn-sm" data-action="pay-deuda" data-id="${d.id}">Pagar</button>`}
            <button class="icon-btn xs" data-action="edit-deuda" data-id="${d.id}" title="Editar" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button>
          </div>
        </div>
      </div>`;
    }

    if(cfg.grouped){
      const ORDER = ['alquiler','agua','luz','gas','internet','suscripcion','otro'];
      const grouped = {};
      deudas.forEach(d => { if(!grouped[d.type]) grouped[d.type]=[]; grouped[d.type].push(d); });
      const sortedTypes = [...new Set([...ORDER.filter(t=>grouped[t]), ...Object.keys(grouped).filter(t=>!ORDER.includes(t))])];
      listEl.innerHTML = sortedTypes.map(type => {
        const ti = DEUDA_TYPES[type] || { label:type };
        const tIcon = DEUDA_TYPE_ICON[type] || 'ph-list';
        const anyVariable = grouped[type].some(d=>d.variableAmount);
        return `<div class="deuda-group">
          <div class="dg-header"><i class="ph ${tIcon}"></i> ${ti.label}${anyVariable?'<span class="dd-variable-tag">Monto variable</span>':''}</div>
          ${grouped[type].map(itemHtml).join('')}
        </div>`;
      }).join('');
    } else {
      listEl.innerHTML = deudas.map(itemHtml).join('');
    }

    renderDeudaDetail(kind);
  }
  function renderDeudas(){ renderDeudaKind('servicio'); }
  function renderPrestamos(){ renderDeudaKind('bankloan'); renderPersonLoans(); }

  function renderDeudaDetail(kind){
    const cfg = DEUDA_LIST_CONFIG[kind];
    const detailEl = document.getElementById(cfg.detailEl);
    if(!detailEl) return;
    const d = (data.deudas||[]).find(x=>x.id===selectedDeudaId[kind]);
    if(!d){ detailEl.style.display = 'none'; detailEl.innerHTML = ''; return; }
    detailEl.style.display = 'grid';

    const monthKey = todayStr().slice(0,7);
    const isPrestamo = d.type === 'prestamo';
    const tIcon = DEUDA_TYPE_ICON[d.type] || 'ph-list';
    const acc = d.accountId ? data.accounts.find(a=>a.id===d.accountId) : null;
    const paidThisMonth = (data.deudaPayments||[]).some(p=>p.deudaId===d.id && p.month===monthKey);

    let bannerHtml = '';
    let progressHtml = '';
    const fields = [];

    if(isPrestamo){
      fields.push(['Prestamista', d.lenderName ? `${escapeHtml(d.lenderName)} <span class="muted">(${LENDER_LABELS[d.lenderType]||d.lenderType})</span>` : (LENDER_LABELS[d.lenderType]||'—')]);
      fields.push(['Tasa de interés', d.interestRate ? d.interestRate+'% mensual' : '—']);
      fields.push(['Monto del préstamo', d.principal ? formatMoney(d.principal) : '—']);
      fields.push(['Saldo pendiente', d.remainingBalance != null ? formatMoney(d.remainingBalance) : '—']);
      fields.push(['Cuota mensual', d.amount ? formatMoney(d.amount) : '—']);
      fields.push(['Día de pago', 'Día '+d.dueDay]);
      if(acc) fields.push(['Cuenta', escapeHtml(acc.name)]);
      if(d.totalInstallments){
        const pct = Math.min(100, Math.round(((d.paidInstallments||0)/d.totalInstallments)*100));
        progressHtml = `
          <div class="cuota-progress-box">
            <div class="cuota-progress-row"><span>Cuotas pagadas</span><span class="num">${d.paidInstallments||0} / ${d.totalInstallments}</span></div>
            <div class="ch-mini-bar"><div style="transform:scaleX(${(pct/100).toFixed(4)});background:${deudaTypeColor(d.type)}"></div></div>
          </div>`;
      }
    } else {
      if(d.variableAmount){
        bannerHtml = `<div class="dd-variable-banner"><i class="ph ph-info"></i><span>El monto de este compromiso varía cada mes. El valor mostrado es un promedio de referencia según tus últimos pagos.</span></div>`;
        fields.push(['Monto de referencia (promedio)', formatMoney(deudaReferenceAmount(d))]);
      } else {
        fields.push(['Monto mensual', d.amount ? formatMoney(d.amount) : '—']);
      }
      fields.push(['Día de pago', 'Día '+d.dueDay]);
      if(acc) fields.push(['Cuenta', escapeHtml(acc.name)]);
      if(d.description) fields.push(['Notas', escapeHtml(d.description)]);
    }

    const fieldsHtml = fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');

    const pays = (data.deudaPayments||[]).filter(p=>p.deudaId===d.id).slice().sort((a,b)=>b.month.localeCompare(a.month));
    const ledgerHtml = pays.length === 0
      ? `<p class="muted" style="padding:8px 0;">Sin pagos registrados todavía.</p>`
      : pays.map(p=>{
          const dt = new Date(p.month+'-01T00:00:00');
          const label = dt.toLocaleDateString('es-PE',{month:'long',year:'numeric'});
          return `<div class="ch-ledger-row"><span class="num">${p.amount!=null?formatMoney(p.amount):'—'}</span><span class="chl-date">${label.charAt(0).toUpperCase()+label.slice(1)} · ${formatDate(p.paidDate)}</span></div>`;
        }).join('');

    detailEl.innerHTML = `
      <div class="wb-detail-main">
        <div class="wb-detail-head">
          <h2><i class="ph ${tIcon}"></i>${escapeHtml(d.name)}</h2>
          <div class="wb-detail-actions">
            <button class="icon-btn xs" data-action="edit-deuda" data-id="${d.id}" title="Editar" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button>
          </div>
        </div>
        ${bannerHtml}
        ${progressHtml}
        <dl class="wb-fields">${fieldsHtml}</dl>
        <div class="actions" style="margin-top:16px;flex-wrap:wrap;">
          ${paidThisMonth
            ? `<span class="status-pill success"><i class="ph ph-check-circle"></i> Pagado este mes</span>`
            : `<button class="btn btn-primary btn-sm" data-action="pay-deuda" data-id="${d.id}"><i class="ph ph-check"></i> Marcar como pagado</button>`}
        </div>
      </div>
      <div class="wb-detail-side">
        <p class="section-label sm">Historial de pagos</p>
        ${ledgerHtml}
      </div>
    `;
  }

  // forcedType 'prestamo' => se abre desde Préstamos (tipo fijo, sin selector);
  // sin forcedType => se abre desde Servicios (selector de tipo sin la opción préstamo).
  function openAddDeudaModal(forcedType){
    const isP = forcedType === 'prestamo';
    openModal(`
      <h2>${isP ? 'Nuevo préstamo' : 'Nuevo servicio'}</h2>
      <form id="addDeudaForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="dName" placeholder="${isP?'Ej: Préstamo BCP':'Ej: Agua Sedapal'}" required></div>
          ${isP
            ? `<input type="hidden" id="dType" value="prestamo">`
            : `<div class="field"><label>Tipo</label><select id="dType">${deudaTypeOptionsHtml('otro', true)}</select></div>`}
          <div class="field" id="dAmountField"><label id="dAmountLabel">${isP?'Cuota mensual (S/)':'Monto mensual (S/)'}</label><input type="number" min="0" step="0.01" id="dAmount" placeholder="Ej: 45 (opcional)"></div>
          <div class="field"><label>Día de pago (1-31)</label><input type="number" min="1" max="31" id="dDay" value="1"></div>
          <div class="field" id="dVariableField" style="grid-column:1/-1;display:${isP?'none':'flex'};">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="dVariable" style="width:auto;cursor:pointer;">
              El monto varía cada mes (ej: agua, luz)
            </label>
          </div>
          <div class="field" id="dAutoDebitField" style="grid-column:1/-1;display:${isP?'none':'flex'};">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="dAutoDebit" style="width:auto;cursor:pointer;">
              Está en débito automático (el banco lo cobra solo)
            </label>
          </div>
          <div class="field" id="dLenderTypeField" style="display:${isP?'flex':'none'};"><label>Prestamista</label><select id="dLenderType">${lenderTypeOptionsHtml('banco')}</select></div>
          <div class="field" id="dLenderNameField" style="display:${isP?'flex':'none'};"><label>Nombre del prestamista</label><input type="text" id="dLenderName" placeholder="Ej: BCP, Crediscotia"></div>
          <div class="field" id="dInterestField" style="display:${isP?'flex':'none'};"><label>Tasa de interés mensual (%)</label><input type="number" min="0" step="0.01" id="dInterest" placeholder="Ej: 2.5"></div>
          <div class="field" id="dPrincipalField" style="display:${isP?'flex':'none'};"><label>Monto del préstamo (S/)</label><input type="number" min="0" step="0.01" id="dPrincipal" placeholder="Ej: 3000"></div>
          <div class="field" id="dInstallmentsField" style="display:${isP?'flex':'none'};"><label>N° de cuotas <span class="muted">(opcional)</span></label><input type="number" min="1" id="dInstallments" placeholder="Ej: 12"></div>
          <div class="field"><label>Cuenta (opcional)</label><select id="dAccount">${reminderAccountOptionsHtml()}</select></div>
          <div class="field"><label>Notas (opcional)</label><input type="text" id="dDesc" placeholder="${isP?'Ej: destino del préstamo':'Ej: Pagar por app Sedapal'}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddDeuda">Cancelar</button>
          <button type="submit" class="btn btn-primary">Agregar</button>
        </div>
      </form>`);
    if(!isP){
      function toggleDeudaFields(){
        document.getElementById('dVariableField').style.display = 'flex';
      }
      document.getElementById('dType').addEventListener('change', toggleDeudaFields);
    }
    document.getElementById('cancelAddDeuda').addEventListener('click', closeModal);
    document.getElementById('addDeudaForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      clearFormErrors(ev.target);
      const type = document.getElementById('dType').value;
      const body = {
        name:       document.getElementById('dName').value.trim(),
        type,
        amount:     parseFloat(document.getElementById('dAmount').value)||null,
        dueDay:     parseInt(document.getElementById('dDay').value,10)||1,
        accountId:  document.getElementById('dAccount').value||null,
        description:document.getElementById('dDesc').value.trim(),
        variableAmount: !isP && document.getElementById('dVariable').checked,
        autoDebit: !isP && document.getElementById('dAutoDebit').checked
      };
      if(isP){
        body.lenderType = document.getElementById('dLenderType').value;
        body.lenderName = document.getElementById('dLenderName').value.trim();
        body.interestRate = parseFloat(document.getElementById('dInterest').value)||null;
        body.principal = parseFloat(document.getElementById('dPrincipal').value)||null;
        body.totalInstallments = parseInt(document.getElementById('dInstallments').value,10)||null;
      }
      if(!body.name){ setFieldError('dName', 'Ingresa un nombre'); return; }
      try { await apiCall('POST','/api/deudas',body); closeModal(); toast(isP?'Préstamo agregado':'Servicio agregado'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function openEditDeudaModal(d){
    if(!d) return;
    const isPrestamo = d.type === 'prestamo';
    openModal(`
      <h2>${isPrestamo ? 'Editar préstamo' : 'Editar servicio'}</h2>
      <form id="editDeudaForm">
        <div class="form-grid">
          <div class="field"><label>Nombre</label><input type="text" id="dName" value="${escapeHtml(d.name)}" required></div>
          ${isPrestamo
            ? `<input type="hidden" id="dType" value="prestamo">`
            : `<div class="field"><label>Tipo</label><select id="dType">${deudaTypeOptionsHtml(d.type, true)}</select></div>`}
          <div class="field" id="dAmountField"><label id="dAmountLabel">${isPrestamo?'Cuota mensual (S/)':'Monto mensual (S/)'}</label><input type="number" min="0" step="0.01" id="dAmount" value="${d.amount||''}"></div>
          <div class="field"><label>Día de pago (1-31)</label><input type="number" min="1" max="31" id="dDay" value="${d.dueDay}"></div>
          <div class="field" id="dVariableField" style="grid-column:1/-1;display:${isPrestamo?'none':'flex'};">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="dVariable" style="width:auto;cursor:pointer;" ${d.variableAmount?'checked':''}>
              El monto varía cada mes (ej: agua, luz)
            </label>
          </div>
          <div class="field" id="dAutoDebitField" style="grid-column:1/-1;display:${isPrestamo?'none':'flex'};">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-weight:600;font-size:13px;color:var(--text);">
              <input type="checkbox" id="dAutoDebit" style="width:auto;cursor:pointer;" ${d.autoDebit?'checked':''}>
              Está en débito automático (el banco lo cobra solo)
            </label>
          </div>
          <div class="field" id="dLenderTypeField" style="display:${isPrestamo?'flex':'none'};"><label>Prestamista</label><select id="dLenderType">${lenderTypeOptionsHtml(d.lenderType)}</select></div>
          <div class="field" id="dLenderNameField" style="display:${isPrestamo?'flex':'none'};"><label>Nombre del prestamista</label><input type="text" id="dLenderName" value="${escapeHtml(d.lenderName||'')}" placeholder="Ej: BCP, Crediscotia, Juan Pérez"></div>
          <div class="field" id="dInterestField" style="display:${isPrestamo?'flex':'none'};"><label>Tasa de interés mensual (%)</label><input type="number" min="0" step="0.01" id="dInterest" value="${d.interestRate||''}" placeholder="Ej: 2.5"></div>
          <div class="field" id="dPrincipalField" style="display:${isPrestamo?'flex':'none'};"><label>Monto del préstamo (S/)</label><input type="number" min="0" step="0.01" id="dPrincipal" value="${d.principal||''}" placeholder="Ej: 3000"></div>
          <div class="field" id="dRemainingField" style="display:${isPrestamo?'flex':'none'};"><label>Saldo pendiente (S/)</label><input type="number" min="0" step="0.01" id="dRemaining" value="${d.remainingBalance!=null?d.remainingBalance:''}" placeholder="Ej: 2400"></div>
          <div class="field" id="dInstallmentsField" style="display:${isPrestamo?'flex':'none'};"><label>N° de cuotas <span class="muted">(opcional)</span></label><input type="number" min="1" id="dInstallments" value="${d.totalInstallments||''}" placeholder="Ej: 12"></div>
          <div class="field"><label>Cuenta (opcional)</label><select id="dAccount">${reminderAccountOptionsHtml(d.accountId)}</select></div>
          <div class="field"><label>Notas (opcional)</label><input type="text" id="dDesc" value="${escapeHtml(d.description||'')}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" data-action="delete-deuda" data-id="${d.id}" style="margin-right:auto;"><i class="ph ph-trash"></i> Eliminar</button>
          <button type="button" class="btn btn-ghost" id="cancelEditDeuda">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
    document.getElementById('cancelEditDeuda').addEventListener('click', closeModal);
    document.getElementById('editDeudaForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      clearFormErrors(ev.target);
      const type = document.getElementById('dType').value;
      const isP = type === 'prestamo';
      const body = {
        name:       document.getElementById('dName').value.trim(),
        type,
        amount:     parseFloat(document.getElementById('dAmount').value)||null,
        dueDay:     parseInt(document.getElementById('dDay').value,10)||1,
        accountId:  document.getElementById('dAccount').value||null,
        description:document.getElementById('dDesc').value.trim(),
        variableAmount: !isP && document.getElementById('dVariable').checked,
        autoDebit: !isP && document.getElementById('dAutoDebit').checked
      };
      if(isP){
        body.lenderType = document.getElementById('dLenderType').value;
        body.lenderName = document.getElementById('dLenderName').value.trim();
        body.interestRate = parseFloat(document.getElementById('dInterest').value)||null;
        body.principal = parseFloat(document.getElementById('dPrincipal').value)||null;
        body.remainingBalance = document.getElementById('dRemaining').value!=='' ? parseFloat(document.getElementById('dRemaining').value) : null;
        body.totalInstallments = parseInt(document.getElementById('dInstallments').value,10)||null;
      }
      if(!body.name){ setFieldError('dName', 'Ingresa un nombre'); return; }
      try { await apiCall('PUT',`/api/deudas/${d.id}`,body); closeModal(); toast('Actualizado'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function openPayDeudaModal(d){
    if(!d) return;
    const tIcon   = DEUDA_TYPE_ICON[d.type] || 'ph-list';
    const sources = data.accounts.filter(a => a.type!=='tarjeta');
    const needsAmount = d.type === 'prestamo' || d.variableAmount;
    const defaultAmount = needsAmount
      ? (d.type==='prestamo' ? (d.amount||'') : (Math.round(deudaReferenceAmount(d)*100)/100 || ''))
      : '';
    openModal(`
      <h2>Marcar como pagado</h2>
      <p style="color:var(--text-dim);font-size:13.5px;margin-bottom:16px;"><i class="ph ${tIcon}"></i> <strong>${escapeHtml(d.name)}</strong>${!needsAmount && d.amount ? ' · '+formatMoney(d.amount) : ''}</p>
      <form id="payDeudaForm">
        <div class="form-grid">
          ${needsAmount ? `<div class="field" style="grid-column:1/-1;"><label>Monto pagado (S/)${d.variableAmount?' <span class="muted">(puede variar cada mes)</span>':''}</label><input type="number" min="0.01" step="0.01" id="payDeudaAmount" value="${defaultAmount}" required></div>` : ''}
          <div class="field" style="grid-column:1/-1;"><label>Descontar de cuenta (opcional)</label>
            <select id="payDeudaAccount">
              <option value="">Solo marcar como pagada</option>
              ${sources.map(s=>`<option value="${s.id}" ${d.accountId===s.id?'selected':''}>${escapeHtml(s.name)} (${formatMoney(s.balance)})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelPayDeuda">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="ph ph-check"></i> Confirmar</button>
        </div>
      </form>`);
    document.getElementById('cancelPayDeuda').addEventListener('click', closeModal);
    document.getElementById('payDeudaForm').addEventListener('submit', async ev => {
      ev.preventDefault();
      const accountId = document.getElementById('payDeudaAccount').value||null;
      const amountEl = document.getElementById('payDeudaAmount');
      const body = { accountId };
      if(amountEl) body.amount = parseFloat(amountEl.value)||null;
      try { await apiCall('POST',`/api/deudas/${d.id}/pay`,body); closeModal(); toast(`${escapeHtml(d.name)} marcada como pagada`); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  /* ---------------- Préstamos entre personas ---------------- */
  function personLoanUrgency(p){
    if(!p.dueDate) return { text:'Sin fecha', urgent:false };
    const today = new Date(); today.setHours(0,0,0,0);
    const d = new Date(p.dueDate+'T00:00:00');
    const days = Math.round((d-today)/86400000);
    if(days === 0) return { text:'Vence hoy', urgent:true };
    if(days < 0) return { text:`Vencido hace ${-days} día${-days===1?'':'s'}`, urgent:true };
    if(days <= 3) return { text:`Vence en ${days} día${days===1?'':'s'}`, urgent:true };
    return { text:`Vence en ${days} días`, urgent:false };
  }

  function renderPersonLoans(){
    const listEl  = document.getElementById('personLoansList');
    const emptyEl = document.getElementById('personLoansEmpty');
    if(!listEl) return;
    const loans = data.personLoans || [];
    if(loans.length === 0){
      listEl.innerHTML = '';
      if(emptyEl) emptyEl.style.display = 'block';
      return;
    }
    if(emptyEl) emptyEl.style.display = 'none';

    const pending = loans.filter(p=>!p.paid).sort((a,b)=>(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    const settled = loans.filter(p=>p.paid).sort((a,b)=>(b.paidDate||'').localeCompare(a.paidDate||''));

    function itemHtml(p){
      const isDebo = p.direction === 'debo';
      const urgency = personLoanUrgency(p);
      const dirLabel = isDebo ? 'Yo debo' : 'Me deben';
      const dirIcon = isDebo ? 'ph-arrow-up-right' : 'ph-arrow-down-left';
      const color = isDebo ? cssVarValue('--red') : cssVarValue('--green');
      return `<div class="deuda-item${p.paid?' paid':''}" style="--dc:${color};">
        <span class="di-dot"></span>
        <div class="di-left">
          <div class="di-name"><span class="dd-rate-chip" style="color:${color};border-color:${color};">${dirLabel}</span> ${escapeHtml(p.personName)}</div>
          <div class="di-meta">${p.dueDate ? formatDate(p.dueDate) : 'Sin fecha'}${p.note ? ' · '+escapeHtml(p.note) : ''}</div>
        </div>
        ${!p.paid ? `<div class="di-urgency${urgency.urgent?' urgent':''}"><i class="ph ${dirIcon}"></i> ${urgency.text}</div>` : `<div class="di-urgency"><i class="ph ph-check-circle"></i> Saldado</div>`}
        <div class="di-right">
          <div class="di-amount">${formatMoney(p.amount)}</div>
          <div class="di-actions">
            ${!p.paid ? `<button class="icon-btn xs" data-action="whatsapp-personloan" data-id="${p.id}" title="Recordar por WhatsApp" aria-label="Recordar por WhatsApp"><i class="ph ph-whatsapp-logo"></i></button>` : ''}
            ${!p.paid ? `<button class="btn btn-primary btn-sm" data-action="settle-personloan" data-id="${p.id}">${isDebo?'Pagar':'Cobrar'}</button>` : ''}
            <button class="icon-btn xs" data-action="edit-personloan" data-id="${p.id}" title="Editar" aria-label="Editar"><i class="ph ph-pencil-simple"></i></button>
          </div>
        </div>
      </div>`;
    }

    listEl.innerHTML =
      pending.map(itemHtml).join('') +
      (settled.length ? `<div class="dg-header" style="margin-top:10px;"><i class="ph ph-check-circle"></i> Saldados</div>${settled.map(itemHtml).join('')}` : '');
  }

  // Perú usa mucho Yape/Plin, pero ninguno de los dos tiene un link público documentado
  // para "pedir un cobro" — WhatsApp sí, así que el recordatorio rápido va por ahí.
  function sendPersonLoanWhatsApp(id){
    const p = (data.personLoans||[]).find(x=>x.id===id);
    if(!p) return;
    const isDebo = p.direction === 'debo';
    const msg = isDebo
      ? `Hola ${p.personName}, te aviso que te debo ${formatMoney(p.amount)}${p.dueDate?` (quedamos para el ${formatDate(p.dueDate)})`:''}. ¡Te caigo pronto! 🙏`
      : `Hola ${p.personName}, te recuerdo que me quedaste debiendo ${formatMoney(p.amount)}${p.dueDate?` (vencía el ${formatDate(p.dueDate)})`:''} 😊`;
    const digits = (p.phone||'').replace(/\D/g,'');
    const phonePart = digits ? (digits.length === 9 ? '51'+digits : digits) : '';
    window.open(`https://wa.me/${phonePart}?text=${encodeURIComponent(msg)}`, '_blank');
  }

  function openAddPersonLoanModal(){
    openModal(`
      <h2>Nuevo préstamo entre personas</h2>
      <form id="addPersonLoanForm">
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <div class="type-toggle">
              <button type="button" class="active" data-dir="debo">Yo debo</button>
              <button type="button" data-dir="me_deben">Me deben</button>
            </div>
          </div>
          <div class="field"><label>Nombre de la persona</label><input type="text" id="plName" placeholder="Ej: Mamá" required></div>
          <div class="field"><label>Monto (S/)</label><input type="number" min="0.01" step="0.01" id="plAmount" required></div>
          <div class="field"><label>Fecha</label><input type="date" id="plDate" value="${todayStr()}"></div>
          <div class="field"><label>Fecha de vencimiento (opcional)</label><input type="date" id="plDueDate"></div>
          <div class="field"><label>WhatsApp (opcional)</label><input type="tel" id="plPhone" placeholder="Ej: 987654321"></div>
          <div class="field"><label>Nota (opcional)</label><input type="text" id="plNote" placeholder="Ej: Para el pasaje"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelAddPersonLoan">Cancelar</button>
          <button type="submit" class="btn btn-primary">Agregar</button>
        </div>
      </form>`);
    let direction = 'debo';
    document.querySelectorAll('#addPersonLoanForm .type-toggle button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        direction = btn.dataset.dir;
        document.querySelectorAll('#addPersonLoanForm .type-toggle button').forEach(b=>b.classList.toggle('active', b===btn));
      });
    });
    document.getElementById('cancelAddPersonLoan').addEventListener('click', closeModal);
    document.getElementById('addPersonLoanForm').addEventListener('submit', async ev=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const body = {
        direction,
        personName: document.getElementById('plName').value.trim(),
        amount: parseFloat(document.getElementById('plAmount').value)||0,
        date: document.getElementById('plDate').value || todayStr(),
        dueDate: document.getElementById('plDueDate').value || null,
        phone: document.getElementById('plPhone').value.trim(),
        note: document.getElementById('plNote').value.trim()
      };
      if(!body.personName){ setFieldError('plName', 'Ingresa un nombre'); return; }
      if(!body.amount){ setFieldError('plAmount', 'Ingresa un monto'); return; }
      try { await apiCall('POST','/api/personloans',body); closeModal(); toast('Préstamo agregado'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function openEditPersonLoanModal(p){
    if(!p) return;
    openModal(`
      <h2>Editar préstamo</h2>
      <form id="editPersonLoanForm">
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <div class="type-toggle">
              <button type="button" class="${p.direction==='debo'?'active':''}" data-dir="debo">Yo debo</button>
              <button type="button" class="${p.direction==='me_deben'?'active':''}" data-dir="me_deben">Me deben</button>
            </div>
          </div>
          <div class="field"><label>Nombre de la persona</label><input type="text" id="plName" value="${escapeHtml(p.personName)}" required></div>
          <div class="field"><label>Monto (S/)</label><input type="number" min="0.01" step="0.01" id="plAmount" value="${p.amount}" required></div>
          <div class="field"><label>Fecha</label><input type="date" id="plDate" value="${p.date||todayStr()}"></div>
          <div class="field"><label>Fecha de vencimiento (opcional)</label><input type="date" id="plDueDate" value="${p.dueDate||''}"></div>
          <div class="field"><label>WhatsApp (opcional)</label><input type="tel" id="plPhone" value="${escapeHtml(p.phone||'')}" placeholder="Ej: 987654321"></div>
          <div class="field"><label>Nota (opcional)</label><input type="text" id="plNote" value="${escapeHtml(p.note||'')}"></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-danger" data-action="delete-personloan" data-id="${p.id}" style="margin-right:auto;"><i class="ph ph-trash"></i> Eliminar</button>
          <button type="button" class="btn btn-ghost" id="cancelEditPersonLoan">Cancelar</button>
          <button type="submit" class="btn btn-primary">Guardar</button>
        </div>
      </form>`);
    let direction = p.direction;
    document.querySelectorAll('#editPersonLoanForm .type-toggle button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        direction = btn.dataset.dir;
        document.querySelectorAll('#editPersonLoanForm .type-toggle button').forEach(b=>b.classList.toggle('active', b===btn));
      });
    });
    document.getElementById('cancelEditPersonLoan').addEventListener('click', closeModal);
    document.getElementById('editPersonLoanForm').addEventListener('submit', async ev=>{
      ev.preventDefault();
      clearFormErrors(ev.target);
      const body = {
        direction,
        personName: document.getElementById('plName').value.trim(),
        amount: parseFloat(document.getElementById('plAmount').value)||0,
        date: document.getElementById('plDate').value || todayStr(),
        dueDate: document.getElementById('plDueDate').value || null,
        phone: document.getElementById('plPhone').value.trim(),
        note: document.getElementById('plNote').value.trim()
      };
      if(!body.personName){ setFieldError('plName', 'Ingresa un nombre'); return; }
      try { await apiCall('PUT',`/api/personloans/${p.id}`,body); closeModal(); toast('Actualizado'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function deletePersonLoan(id){
    const p = (data.personLoans||[]).find(x=>x.id===id);
    if(!p) return;
    openConfirm({
      title: 'Eliminar préstamo',
      message: `¿Eliminar el préstamo con "${p.personName}"?`,
      onConfirm: async ()=>{
        try { await apiCall('DELETE',`/api/personloans/${id}`); closeModal(); toast('Eliminado'); await refreshAndRender(); }
        catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  function settlePersonLoan(id){
    const p = (data.personLoans||[]).find(x=>x.id===id);
    if(!p) return;
    const isDebo = p.direction === 'debo';
    const sources = data.accounts.filter(a=>a.type!=='tarjeta');
    openModal(`
      <h2>${isDebo?'Marcar como pagado':'Marcar como cobrado'}</h2>
      <p style="color:var(--text-dim);font-size:13.5px;margin-bottom:16px;"><strong>${escapeHtml(p.personName)}</strong> · ${formatMoney(p.amount)}</p>
      <form id="settlePersonLoanForm">
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;"><label>${isDebo?'Descontar de cuenta':'Depositar en cuenta'} (opcional)</label>
            <select id="settlePlAccount">
              <option value="">Solo marcar como saldado</option>
              ${sources.map(s=>`<option value="${s.id}">${escapeHtml(s.name)} (${formatMoney(s.balance)})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" id="cancelSettlePl">Cancelar</button>
          <button type="submit" class="btn btn-primary"><i class="ph ph-check"></i> Confirmar</button>
        </div>
      </form>`);
    document.getElementById('cancelSettlePl').addEventListener('click', closeModal);
    document.getElementById('settlePersonLoanForm').addEventListener('submit', async ev=>{
      ev.preventDefault();
      const accountId = document.getElementById('settlePlAccount').value || null;
      try { await apiCall('POST',`/api/personloans/${id}/settle`,{accountId}); closeModal(); toast('Préstamo saldado'); await refreshAndRender(); }
      catch(err){ toast(err.message, 'error'); }
    });
  }

  function deleteDeuda(id){
    const d = (data.deudas||[]).find(x=>x.id===id);
    if(!d) return;
    openConfirm({
      title: 'Eliminar compromiso',
      message: `¿Eliminar "${d.name}"?`,
      onConfirm: async ()=>{
        try {
          await apiCall('DELETE',`/api/deudas/${id}`);
          closeModal();
          if(selectedDeudaId.servicio === id) selectedDeudaId.servicio = null;
          if(selectedDeudaId.bankloan === id) selectedDeudaId.bankloan = null;
          toast('Eliminado');
          await refreshAndRender();
        }
        catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  function unPayDeuda(paymentId){
    openConfirm({
      title: 'Deshacer pago',
      message: '¿Deshacer este pago?',
      confirmLabel: 'Deshacer',
      onConfirm: async ()=>{
        try { await apiCall('DELETE',`/api/deuda-payments/${paymentId}`); toast('Pago deshecho'); await refreshAndRender(); }
        catch(err){ toast(err.message, 'error'); }
      }
    });
  }

  /* ---------------- Sub-vistas (Ingresos / Gastos / Balance) ---------------- */
  let svMonth = new Date(); svMonth.setDate(1);
  let _currentSubView = null;

  function showSubView(type){
    _currentSubView = type;
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
    const panel = document.getElementById('view-' + type);
    if(panel) panel.classList.add('active');
    const titles = { ingresos:'Ingresos del mes', gastos:'Gastos del mes', balance:'Balance neto' };
    const titleEl = document.getElementById('pageTitle');
    if(titleEl) titleEl.textContent = titles[type] || '';
    if(window.innerWidth < 860) closeSidebar();
    if(type === 'ingresos')   renderIngresosView();
    else if(type === 'gastos') renderGastosView();
    else if(type === 'balance') renderBalanceView();
  }

  function svMonthLabel(){ const l = svMonth.toLocaleDateString('es-PE',{month:'long',year:'numeric'}); return l.charAt(0).toUpperCase()+l.slice(1); }
  function svMonthKey(){ return svMonth.getFullYear()+'-'+String(svMonth.getMonth()+1).padStart(2,'0'); }

  function _buildDailyData(type){
    const mk = svMonthKey();
    const year = svMonth.getFullYear(), month = svMonth.getMonth();
    const daysCount = new Date(year, month+1, 0).getDate();
    const byDay = new Array(daysCount+1).fill(0);
    const txList = [];
    data.transactions.forEach(tx=>{
      if(!tx.date || !tx.date.startsWith(mk)) return;
      if(tx.type !== type) return;
      const d = parseInt(tx.date.slice(8,10),10);
      byDay[d] += tx.amount;
      txList.push(tx);
    });
    return { daysCount, byDay, txList };
  }

  function _makeBarChart(canvasId, labels, values, color, borderColor){
    const ctx = document.getElementById(canvasId);
    if(!ctx) return;
    if(ctx._chart) ctx._chart.destroy();
    const isDark = isDarkTheme();
    ctx._chart = new Chart(ctx, {
      type:'bar',
      data:{
        labels,
        datasets:[{
          data: values,
          backgroundColor: color,
          borderColor: borderColor,
          borderWidth:1.5, borderRadius:5, borderSkipped:false
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c=>formatMoney(c.raw) } } },
        scales:{
          x:{ grid:{display:false}, ticks:{font:{size:10}, maxTicksLimit:16} },
          y:{ grid:{color:isDark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)'}, ticks:{ callback: v=>'S/'+v.toLocaleString() } }
        }
      }
    });
  }

  function _buildTxListHtml(txList, amtClass, sign){
    if(txList.length === 0) return `<div class="empty-note" style="padding:40px 0;">Sin movimientos este mes</div>`;
    const sorted = txList.slice().sort((a,b)=>b.date.localeCompare(a.date));
    const total = txList.reduce((s,t)=>s+t.amount,0);
    return `
      <div style="font-size:12.5px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px;">
        ${sorted.length} movimiento${sorted.length!==1?'s':''} · Total: <span style="color:var(--ink)">${formatMoney(total)}</span>
      </div>
      ${sorted.map(tx=>{
        const acc = data.accounts.find(a=>a.id===tx.accountId);
        const dd = tx.date.slice(8,10)+'/'+tx.date.slice(5,7);
        return `<div class="sv-tx-row">
          <div class="sv-tx-date">${dd}</div>
          <div class="sv-tx-info">
            <div class="sv-tx-desc">${escapeHtml(tx.description||tx.category||'—')}</div>
            <div class="sv-tx-meta">${escapeHtml(tx.category||'')}${acc?' · '+escapeHtml(acc.name):''}</div>
          </div>
          <div class="sv-tx-amt ${amtClass}">${sign}${formatMoney(tx.amount)}</div>
        </div>`;
      }).join('')}
    `;
  }

  function renderIngresosView(){
    const el = document.getElementById('svIngresosLabel');
    if(el) el.textContent = svMonthLabel();
    const { daysCount, byDay, txList } = _buildDailyData('ingreso');
    const labels = Array.from({length:daysCount},(_,i)=>String(i+1));
    const values = labels.map((_,i)=>byDay[i+1]);
    const isDark = isDarkTheme();
    _makeBarChart('ingresosChart', labels, values,
      isDark?'rgba(52,211,153,.55)':'rgba(31,122,77,.5)',
      isDark?'#34d399':'#1f7a4d');
    const listEl = document.getElementById('ingresosList');
    if(listEl) listEl.innerHTML = _buildTxListHtml(txList,'amt-in','+');
  }

  function renderGastosView(){
    const el = document.getElementById('svGastosLabel');
    if(el) el.textContent = svMonthLabel();
    const { daysCount, byDay, txList } = _buildDailyData('gasto');
    const labels = Array.from({length:daysCount},(_,i)=>String(i+1));
    const values = labels.map((_,i)=>byDay[i+1]);
    const isDark = isDarkTheme();
    _makeBarChart('gastosChart', labels, values,
      isDark?'rgba(226,131,107,.55)':'rgba(193,84,63,.5)',
      isDark?'#e2836b':'#c1543f');
    const listEl = document.getElementById('gastosList');
    if(listEl) listEl.innerHTML = _buildTxListHtml(txList,'amt-out','-');
  }

  function renderBalanceView(){
    const lbl = document.getElementById('svBalanceLabel');
    if(lbl) lbl.textContent = svMonthLabel();
    const mk = svMonthKey();
    let totalIn=0, totalOut=0;
    data.transactions.forEach(tx=>{
      if(!tx.date||!tx.date.startsWith(mk)) return;
      if(tx.type==='ingreso') totalIn+=tx.amount; else totalOut+=tx.amount;
    });
    const net = totalIn - totalOut;
    const isDark = isDarkTheme();
    const el = document.getElementById('balanceView');
    if(!el) return;
    el.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px;">
        <div class="card" style="padding:20px 16px;text-align:center;">
          <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Ingresos</div>
          <div style="font-size:26px;font-weight:800;color:var(--green);">${formatMoney(totalIn)}</div>
        </div>
        <div class="card" style="padding:20px 16px;text-align:center;">
          <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Gastos</div>
          <div style="font-size:26px;font-weight:800;color:var(--red);">${formatMoney(totalOut)}</div>
        </div>
        <div class="card" style="padding:20px 16px;text-align:center;">
          <div style="font-size:11px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Balance neto</div>
          <div style="font-size:26px;font-weight:800;color:${net>=0?'var(--green)':'var(--red)'};">${net>=0?'+':''}${formatMoney(net)}</div>
        </div>
      </div>
      ${totalIn===0&&totalOut===0
        ? `<div class="card" style="padding:40px;text-align:center;color:var(--text-dimmer);">Sin movimientos este mes</div>`
        : `<div class="card" style="padding:22px;">
            <h2 style="font-size:14px;margin-bottom:16px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Comparación del mes</h2>
            <div style="height:220px;position:relative;"><canvas id="balanceChart"></canvas></div>
           </div>`
      }
      <div class="card" style="padding:22px;margin-top:14px;">
        <h2 style="font-size:14px;margin-bottom:12px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;">Tasa de ahorro</h2>
        ${totalIn>0
          ? (()=>{
              const rate = Math.max(0,Math.round((net/totalIn)*100));
              const good = rate >= 20;
              return `<div style="display:flex;justify-content:space-between;font-size:13px;color:var(--text-dim);font-weight:600;margin-bottom:6px;">
                        <span>Porcentaje ahorrado</span><span style="color:${good?'var(--green)':'var(--yellow)'};">${rate}%</span>
                      </div>
                      <div style="height:10px;border-radius:999px;background:var(--bg-soft);border:1px solid var(--border);overflow:hidden;">
                        <div style="height:100%;width:${Math.min(100,rate)}%;background:${good?'var(--accent)':'var(--yellow)'};border-radius:999px;transition:width .4s ease;"></div>
                      </div>
                      <div style="font-size:12px;color:var(--text-dim);margin-top:8px;">${good?'✅ ¡Excelente tasa de ahorro!':'⚠️ Meta recomendada: ahorrar al menos 20% de los ingresos.'}</div>`;
            })()
          : `<div style="font-size:13px;color:var(--text-dimmer);">Sin ingresos registrados este mes.</div>`
        }
      </div>
    `;
    // Render comparison bar chart
    if(totalIn>0||totalOut>0){
      const ctx = document.getElementById('balanceChart');
      if(ctx){
        if(ctx._chart) ctx._chart.destroy();
        ctx._chart = new Chart(ctx,{
          type:'bar',
          data:{
            labels:['Ingresos','Gastos'],
            datasets:[{
              data:[totalIn,totalOut],
              backgroundColor:[
                isDark?'rgba(52,211,153,.6)':'rgba(31,122,77,.55)',
                isDark?'rgba(226,131,107,.6)':'rgba(193,84,63,.55)'
              ],
              borderColor:[isDark?'#34d399':'#1f7a4d', isDark?'#e2836b':'#c1543f'],
              borderWidth:2, borderRadius:12, borderSkipped:false
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label: c=>formatMoney(c.raw) } } },
            scales:{
              x:{ grid:{display:false}, ticks:{font:{size:13,weight:'bold'}} },
              y:{ grid:{color:isDark?'rgba(255,255,255,.05)':'rgba(0,0,0,.04)'}, ticks:{ callback: v=>'S/'+v.toLocaleString() } }
            }
          }
        });
      }
    }
  }

  /* ---------------- Búsqueda y notificaciones del topbar ---------------- */
  function focusTxSearch(){
    switchTab('transacciones');
    setTimeout(()=>{
      const input = document.getElementById('filterSearch');
      if(input){ input.focus(); input.scrollIntoView({block:'center'}); }
    }, 50);
  }

  const UPAY_ICON_TOPBAR = { reminder:'ph-calendar-blank', servicio:'ph-receipt', bankloan:'ph-bank', tarjeta:'ph-credit-card', personloan:'ph-users-three' };

  function renderNotifPanel(){
    const notifOn = !data.settings || data.settings.telegramNotifications !== false;
    const upcoming = computeUpcomingPayments(14).items.slice(0, 6);
    document.getElementById('notifPanel').innerHTML = `
      <div class="notif-head">
        <span class="notif-title">Notificaciones</span>
      </div>
      <div class="notif-toggle-row">
        <span class="notif-toggle-label">Avisarme de vencimientos</span>
        <label class="mini-switch">
          <input type="checkbox" id="notifPanelToggle" ${notifOn?'checked':''}>
          <span></span>
        </label>
      </div>
      <div class="notif-list">
        ${upcoming.length === 0
          ? `<div class="notif-empty">No tienes vencimientos en los próximos 14 días.</div>`
          : upcoming.map(i=>{
              const dueLabel = i.days < 0 ? `Vencido hace ${-i.days}d` : i.days === 0 ? 'Hoy' : i.days === 1 ? 'Mañana' : `En ${i.days} días`;
              const urgent = i.days <= 2;
              return `<button type="button" class="notif-item${urgent?' urgent':''}" data-action="switch-tab" data-tab="${i.tab}">
                <span class="ni"><i class="ph ${UPAY_ICON_TOPBAR[i.kind]||'ph-receipt'}"></i></span>
                <span class="notif-item-name">${escapeHtml(i.name)}</span>
                <span class="notif-item-due">${dueLabel}</span>
              </button>`;
            }).join('')
        }
      </div>
    `;
    document.getElementById('notifPanelToggle').addEventListener('change', async function(){
      const telegramNotifications = this.checked;
      try{
        await apiCall('PUT', '/api/settings', { telegramNotifications });
        if(!data.settings) data.settings = {};
        data.settings.telegramNotifications = telegramNotifications;
        toast(telegramNotifications ? 'Alertas activadas' : 'Alertas desactivadas');
      }catch(err){ toast(err.message, 'error'); this.checked = !telegramNotifications; }
    });
  }

  function toggleNotifPanel(){
    const panel = document.getElementById('notifPanel');
    const opening = !panel.classList.contains('open');
    if(opening) renderNotifPanel();
    panel.classList.toggle('open', opening);
  }

  function updateNotifDot(){
    const dot = document.getElementById('notifDot');
    if(!dot) return;
    const hasUrgent = computeUpcomingPayments(2).items.length > 0;
    dot.style.display = hasUrgent ? 'block' : 'none';
  }

  function updateAvatar(){
    const btn = document.getElementById('avatarBtn');
    if(!btn) return;
    const name = data.profile && data.profile.ownerName;
    btn.textContent = name ? name.trim().charAt(0) : '';
    btn.innerHTML = name ? name.trim().charAt(0) : '<i class="ph ph-user"></i>';
  }

  document.addEventListener('click', (e)=>{
    const panel = document.getElementById('notifPanel');
    if(panel && panel.classList.contains('open') && !panel.contains(e.target) && !e.target.closest('[data-action="toggle-notif-panel"]')){
      panel.classList.remove('open');
    }
  });

  /* ---------------- Settings ---------------- */
  async function openSettingsModal(){
    const settings = data.settings || {};
    const notifOn = settings.telegramNotifications !== false;
    const notifyDays = settings.notifyDaysBefore !== undefined ? settings.notifyDaysBefore : 2;
    let linked = false;
    try{ const st = await apiCall('GET', '/api/telegram/link-status'); linked = !!st.linked; }catch(_){}
    const ownerName = (data.profile && data.profile.ownerName) || '';
    const monthlyGoal = data.monthlyGoal || '';
    openModal(`
      <h2><i class="ph ph-gear"></i> Configuración</h2>
      <div style="margin-bottom:20px;">
        <div style="font-size:12.5px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Tu nombre</div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <label>Cómo te saluda la app</label>
            <input type="text" id="settingOwnerName" value="${escapeHtml(ownerName)}" placeholder="Ej: Sandro">
          </div>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:12.5px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Meta de ahorro</div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <label>Meta de ahorro mensual (S/)</label>
            <input type="number" min="0" step="0.01" id="settingGoalAmount" value="${escapeHtml(monthlyGoal)}" placeholder="Ej: 500">
          </div>
        </div>
      </div>
      <div style="margin-bottom:20px;">
        <div style="font-size:12.5px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px;">Bot de Telegram</div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <div style="display:flex;align-items:center;justify-content:space-between;background:var(--bg-soft);border:1px solid var(--border);padding:12px 14px;border-radius:12px;gap:12px;">
              <div>
                <div style="font-size:13.5px;font-weight:700;color:var(--ink);">Notificaciones de vencimiento</div>
                <div style="font-size:12px;color:var(--text-dim);margin-top:2px;">Te avisa antes de que venzan compromisos, deudas y tarjetas.</div>
              </div>
              <label style="position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0;">
                <input type="checkbox" id="settingNotif" ${notifOn?'checked':''} style="opacity:0;width:0;height:0;position:absolute;">
                <span id="settingNotifTrack" style="
                  position:absolute;inset:0;border-radius:999px;cursor:pointer;
                  background:${notifOn?'var(--accent)':'var(--bg-soft)'};
                  border:1px solid ${notifOn?'var(--accent)':'var(--border)'};
                  transition:background .2s;">
                  <span style="
                    position:absolute;top:2px;left:${notifOn?'22':'2'}px;width:18px;height:18px;
                    background:#fff;border-radius:50%;transition:left .2s;box-shadow:0 1px 3px rgba(0,0,0,.2);">
                  </span>
                </span>
              </label>
            </div>
          </div>
          <div class="field">
            <label>Avisar con cuántos días de anticipación</label>
            <input type="number" min="0" max="14" id="settingDays" value="${notifyDays}">
          </div>
        </div>
        <div style="font-size:12.5px;color:var(--text-dim);font-weight:700;text-transform:uppercase;letter-spacing:.4px;margin:18px 0 8px;">Calendario</div>
        <div class="form-grid">
          <div class="field" style="grid-column:1/-1;">
            <label>Días de sueldo (1-31, separados por coma)</label>
            <input type="text" id="settingIncomeDays" value="${(settings.incomeDays||[]).join(', ')}" placeholder="Ej: 1, 15">
          </div>
        </div>
        <div id="telegramLinkBox" style="display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;font-size:12.5px;color:var(--text-dim);">
          <i class="ph ${linked?'ph-check-circle':'ph-warning-circle'}" style="color:${linked?'var(--green)':'var(--yellow)'};flex-shrink:0;"></i>
          <span style="flex:1;">${linked ? 'Bot vinculado a tu Telegram.' : 'Bot no vinculado todavía.'}</span>
          ${linked
            ? '<button type="button" class="btn btn-ghost" id="unlinkTelegramBtn" style="padding:6px 12px;font-size:12px;">Desvincular</button>'
            : '<button type="button" class="btn btn-ghost" id="linkTelegramBtn" style="padding:6px 12px;font-size:12px;">Vincular</button>'}
        </div>
        <div id="telegramCodeBox" style="display:none;margin-top:10px;padding:12px 14px;background:var(--bg-soft);border:1px solid var(--border);border-radius:10px;text-align:center;"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-danger" id="logoutBtn" style="margin-right:auto;">Cerrar sesión</button>
        <button type="button" class="btn btn-ghost" id="cancelSettings">Cancelar</button>
        <button type="button" class="btn btn-primary" id="saveSettings">Guardar</button>
      </div>
    `);
    document.getElementById('logoutBtn').addEventListener('click', async ()=>{
      closeModal();
      if(window.NUVA_AUTH) await window.NUVA_AUTH.signOut();
    });
    const linkBtn = document.getElementById('linkTelegramBtn');
    if(linkBtn) linkBtn.addEventListener('click', async ()=>{
      linkBtn.disabled = true;
      try{
        const { code, expiresAt } = await apiCall('POST', '/api/telegram/link-code');
        const box = document.getElementById('telegramCodeBox');
        box.style.display = 'block';
        const expiresMs = new Date(expiresAt).getTime();
        const renderCountdown = ()=>{
          const secsLeft = Math.max(0, Math.round((expiresMs - Date.now())/1000));
          const mm = Math.floor(secsLeft/60), ss = String(secsLeft%60).padStart(2,'0');
          box.innerHTML = `
            <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;margin-bottom:6px;">Tu código (válido ${mm}:${ss})</div>
            <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:var(--ink);font-variant-numeric:tabular-nums;">${code}</div>
            <div style="font-size:12px;color:var(--text-dim);margin-top:8px;">Abre el bot en Telegram y pégalo en el chat.</div>
          `;
          if(secsLeft <= 0){ clearInterval(timer); box.innerHTML = '<div style="font-size:12.5px;color:var(--text-dim);">El código venció. Genera uno nuevo.</div>'; linkBtn.disabled = false; }
        };
        renderCountdown();
        const timer = setInterval(renderCountdown, 1000);
      }catch(err){ toast(err.message, 'error'); linkBtn.disabled = false; }
    });
    const unlinkBtn = document.getElementById('unlinkTelegramBtn');
    if(unlinkBtn) unlinkBtn.addEventListener('click', async ()=>{
      if(!confirm('¿Desvincular tu Telegram? Podrás volver a vincularlo cuando quieras.')) return;
      try{ await apiCall('DELETE', '/api/telegram/link'); toast('Telegram desvinculado'); closeModal(); await openSettingsModal(); }
      catch(err){ toast(err.message, 'error'); }
    });
    const notifChk = document.getElementById('settingNotif');
    const track = document.getElementById('settingNotifTrack');
    notifChk.addEventListener('change', function(){
      track.style.background = this.checked ? 'var(--accent)' : 'var(--bg-soft)';
      track.style.borderColor = this.checked ? 'var(--accent)' : 'var(--border)';
      track.querySelector('span').style.left = this.checked ? '22px' : '2px';
    });
    document.getElementById('cancelSettings').addEventListener('click', closeModal);
    document.getElementById('saveSettings').addEventListener('click', async ()=>{
      const telegramNotifications = document.getElementById('settingNotif').checked;
      const notifyDaysBefore = parseInt(document.getElementById('settingDays').value,10)||2;
      const incomeDays = document.getElementById('settingIncomeDays').value.split(',').map(s=>parseInt(s.trim(),10)).filter(n=>n>=1 && n<=31);
      const ownerNameVal = document.getElementById('settingOwnerName').value.trim();
      const goalAmount = parseFloat(document.getElementById('settingGoalAmount').value) || 0;
      try{
        await apiCall('PUT', '/api/settings', { telegramNotifications, notifyDaysBefore, incomeDays });
        await apiCall('PUT', '/api/profile', { ownerName: ownerNameVal });
        await apiCall('PUT', '/api/goal', { amount: goalAmount });
        closeModal();
        toast('Configuración guardada');
        await refreshAndRender();
      }catch(err){ toast(err.message, 'error'); }
    });
  }

  /* ---------------- Excel export ---------------- */
  function downloadExcel(){
    if(typeof XLSX === 'undefined'){
      toast('Librería Excel no disponible (requiere internet)');
      return;
    }
    const wb  = XLSX.utils.book_new();
    const hoy = new Date().toLocaleDateString('es-PE');

    // Hoja 1: Resumen
    const resRows = [
      ['NUVA — Resumen financiero',''],
      [`Generado el: ${hoy}`, ''],[''],
      ['== CUENTAS =='],
      ['Nombre','Tipo','Saldo (S/)'],
      ...data.accounts.map(a=>[a.name, ACC_LABELS[a.type] || a.type, a.balance]),
      [''],['== CHANCHITOS =='],
      ['Nombre','Saldo (S/)','Tasa mensual (%)'],
      ...(data.pockets.length ? data.pockets.map(p=>[p.name,p.balance,p.rate||'']) : [['(sin chanchitos)','','']]),
      [''],['== COMPROMISOS MENSUALES =='],
      ['Nombre','Tipo','Monto (S/)','Día de pago'],
      ...((data.deudas||[]).length ? (data.deudas||[]).map(d=>[d.name,(DEUDA_TYPES[d.type]||{label:d.type}).label,d.amount||'',d.dueDay]) : [['(sin compromisos)','','','']])
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resRows), 'Resumen');

    // Hoja 2: Transacciones
    const txSorted = data.transactions.slice().sort((a,b)=>b.date.localeCompare(a.date));
    const txRows = [
      ['Fecha','Tipo','Descripción','Categoría','Cuenta','Monto (S/)'],
      ...txSorted.map(tx=>{
        const acc = data.accounts.find(a=>a.id===tx.accountId);
        return [tx.date, tx.type==='ingreso'?'Ingreso':'Gasto', tx.description||'', tx.category, acc?acc.name:'(eliminada)', tx.type==='ingreso'?tx.amount:-tx.amount];
      })
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), 'Transacciones');

    // Hoja 3: Compromisos
    if((data.deudas||[]).length > 0){
      const dRows = [
        ['Nombre','Tipo','Monto mensual (S/)','Día de pago','Cuenta','Notas'],
        ...(data.deudas||[]).map(d=>{
          const acc = data.accounts.find(a=>a.id===d.accountId);
          return [d.name,(DEUDA_TYPES[d.type]||{label:d.type}).label,d.amount||'',d.dueDay,acc?acc.name:'',d.description||''];
        })
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dRows), 'Compromisos');
    }

    // Hoja 4: Calendario de pagos
    if((data.reminders||[]).length > 0){
      const rRows = [
        ['Nombre','Monto (S/)','Día','Cuotas totales','Cuotas pagadas','Cuenta'],
        ...data.reminders.map(r=>{
          const acc = data.accounts.find(a=>a.id===r.accountId);
          return [r.name,r.amount||'',r.dueDay,r.totalInstallments||'',r.paidInstallments||'',acc?acc.name:''];
        })
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rRows), 'Calendario pagos');
    }

    const now = new Date();
    const fname = `finanzia_${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}.xlsx`;
    XLSX.writeFile(wb, fname);
    toast('Excel descargado ✅');
  }

  /* ---------------- Global click delegation ---------------- */
  document.body.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-action]');
    if(!el) return;
    const action = el.dataset.action;
    const id = el.dataset.id;

    switch(action){
      case 'next-tip': nextTip(); break;
      case 'open-add-account': openAddAccountModal(el.dataset.type); break;
      case 'edit-acc': openEditAccountModal(data.accounts.find(a=>a.id===id)); break;
      case 'delete-acc': deleteAccount(id); break;
      case 'select-account': selectAccount(id); break;
      case 'select-card': selectedCardId = id; renderCard(); break;
      case 'set-account-color':
        if(el.dataset.kind === 'pocket') setPocketField(id, { color: el.dataset.color });
        else setAccountColor(id, el.dataset.color);
        break;

      case 'edit-tx': openEditTxModal(data.transactions.find(t=>t.id===id)); break;
      case 'delete-tx': {
        const tx = data.transactions.find(t=>t.id===id);
        if(tx){
          const desc = tx.description ? `"${tx.description}"` : (tx.type==='ingreso'?'este ingreso':'este gasto');
          openConfirm({
            title: 'Eliminar transacción',
            message: `¿Eliminar ${desc} · ${formatMoney(tx.amount)} del ${formatDate(tx.date)}?`,
            onConfirm: ()=> apiCall('DELETE', `/api/transactions/${id}`)
              .then(()=>{
                refreshAndRender();
                toast('Transacción eliminada', 'success', async ()=>{
                  try{
                    await apiCall('POST', '/api/transactions', {
                      type: tx.type, amount: tx.amount, date: tx.date,
                      description: tx.description, category: tx.category, accountId: tx.accountId
                    });
                    toast('Transacción restaurada');
                    await refreshAndRender();
                  }catch(err){ toast(err.message, 'error'); }
                });
              })
              .catch(err=> toast(err.message, 'error'))
          });
        }
        break;
      }

      case 'pay-card': openPayCardModal(data.accounts.find(a=>a.id===id)); break;
      case 'delete-payment': deletePayment(id); break;

      case 'open-add-pocket': openAddPocketModal(); break;
      case 'edit-pocket': openEditPocketModal(data.pockets.find(p=>p.id===id)); break;
      case 'delete-pocket': deletePocket(id); break;
      case 'meter-pocket': openMovePocketModal(data.pockets.find(p=>p.id===id), 'meter'); break;
      case 'sacar-pocket': openMovePocketModal(data.pockets.find(p=>p.id===id), 'sacar'); break;
      case 'select-pocket': selectedPocketId = id; renderPockets(); break;
      case 'toggle-notify-pocket': setPocketField(id, { notifyBehind: el.checked }); break;
      case 'set-primary-pocket': setPocketField(id, { isPrimary: true }); break;
      case 'del-pocket-contrib': deletePocketContribution(id, el.dataset.cid); break;

      case 'open-add-reminder': openAddReminderModal(); break;
      case 'edit-reminder': openEditReminderModal(data.reminders.find(r=>r.id===id)); break;
      case 'delete-reminder': deleteReminder(id); break;
      case 'pay-installment': openPayInstallmentModal(data.reminders.find(r=>r.id===id)); break;
      case 'open-subview': showSubView(el.dataset.view); break;
      case 'switch-tab': switchTab(el.dataset.tab); break;
      case 'back-to-panel': switchTab('dashboard'); break;
      case 'sv-prev': {
        svMonth.setMonth(svMonth.getMonth()-1);
        if(_currentSubView) showSubView(_currentSubView);
        break;
      }
      case 'sv-next': {
        svMonth.setMonth(svMonth.getMonth()+1);
        if(_currentSubView) showSubView(_currentSubView);
        break;
      }

      case 'cal-prev': calViewDate.setMonth(calViewDate.getMonth()-1); renderCalendar(); break;
      case 'cal-next': calViewDate.setMonth(calViewDate.getMonth()+1); renderCalendar(); break;
      case 'cal-set-view': setCalView(el.dataset.view); break;
      case 'set-linechart-mode': setLineChartMode(el.dataset.mode); break;
      case 'toggle-month-picker': toggleMonthPicker(); break;
      case 'apply-month-picker': applyMonthPicker(); break;
      case 'open-day-modal': openDayModal(Number(id)); break;
      case 'cal-pay': dispatchCalPay(el.dataset.etype, el.dataset.eid); break;
      case 'cal-edit': dispatchCalEdit(el.dataset.etype, el.dataset.eid); break;
      case 'cal-add-for-day': openAddReminderModal(Number(el.dataset.day)); break;

      case 'open-add-deuda': openAddDeudaModal(); break;
      case 'open-add-bankloan': openAddDeudaModal('prestamo'); break;
      case 'edit-deuda': openEditDeudaModal((data.deudas||[]).find(d=>d.id===id)); break;
      case 'delete-deuda': deleteDeuda(id); break;
      case 'select-deuda': { const kind = el.dataset.kind || 'servicio'; selectedDeudaId[kind] = id; renderDeudaKind(kind); break; }
      case 'pay-deuda': openPayDeudaModal((data.deudas||[]).find(d=>d.id===id)); break;
      case 'unpay-deuda': unPayDeuda(id); break;

      case 'open-add-personloan': openAddPersonLoanModal(); break;
      case 'whatsapp-personloan': sendPersonLoanWhatsApp(id); break;
      case 'edit-personloan': openEditPersonLoanModal((data.personLoans||[]).find(p=>p.id===id)); break;
      case 'delete-personloan': deletePersonLoan(id); break;
      case 'settle-personloan': settlePersonLoan(id); break;

      case 'open-add-cardcharge': openAddCardChargeModal(el.dataset.cardid || selectedCardId); break;
      case 'mark-cardcharge': markCardCharge(id); break;
      case 'delete-cardcharge': deleteCardCharge(id); break;
      case 'download-excel': downloadExcel(); break;
      case 'open-settings': openSettingsModal(); break;
      case 'focus-search': focusTxSearch(); break;
      case 'toggle-notif-panel': toggleNotifPanel(); break;
    }
  });

  // Filas seleccionables que no son <button> real (p.ej. .deuda-item, que contiene
  // botones anidados como Pagar/Editar) necesitan su propio soporte de teclado.
  document.body.addEventListener('keydown', (e)=>{
    if((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role="button"][data-action]')){
      e.preventDefault();
      e.target.click();
    }
  });

  document.addEventListener('click', (e)=>{
    const picker = document.getElementById('monthPicker');
    if(picker && picker.classList.contains('open') && !picker.contains(e.target) && !e.target.closest('[data-action="toggle-month-picker"]')){
      picker.classList.remove('open');
    }
  });

  /* ---------------- Render all ---------------- */
  function renderAll(){
    try{ renderDashboard(); }catch(e){ console.error('Error en dashboard', e); }
    try{ renderTransactions(); }catch(e){ console.error('Error en transacciones', e); }
    try{ renderAccounts(); }catch(e){ console.error('Error en cuentas', e); }
    try{ renderCard(); }catch(e){ console.error('Error en tarjeta', e); }
    try{ renderPockets(); }catch(e){ console.error('Error en chanchitos', e); }
    try{ renderDeudas(); }catch(e){ console.error('Error en servicios', e); }
    try{ renderPrestamos(); }catch(e){ console.error('Error en préstamos', e); }
    try{ renderReminders(); }catch(e){ console.error('Error en calendario', e); }
    try{ updateAvatar(); updateNotifDot(); }catch(e){ console.error('Error en topbar', e); }
    try{ renderAdminNav(); }catch(e){ console.error('Error en nav admin', e); }
  }

  // El refresco automático reconstruye listas y gráficos por completo; si el usuario
  // está escribiendo o tiene un modal/diálogo abierto sobre datos ya cargados, saltarlo
  // evita perder el foco, el hover de una fila, o pisar un formulario a medio llenar.
  function isUserInteracting(){
    if(modalOverlay.classList.contains('open')) return true;
    if(confirmOverlay.classList.contains('open')) return true;
    if(promptOverlay.classList.contains('open')) return true;
    const ae = document.activeElement;
    return !!(ae && ['INPUT','TEXTAREA','SELECT'].includes(ae.tagName));
  }

  // La app ya no arranca sola al cargar el script — espera a que public/js/auth.js
  // confirme que hay una sesión válida y llame a esto (ver window.__startNuvaApp).
  let _autoRefreshStarted = false;
  window.__startNuvaApp = function(){
    refreshAndRender();
    if(!_autoRefreshStarted){
      _autoRefreshStarted = true;
      // Refresca automáticamente cada 15s para reflejar movimientos hechos desde Telegram u otro dispositivo
      setInterval(()=>{ if(!isUserInteracting()) refreshAndRender(); }, 15000);
    }
  };

})();

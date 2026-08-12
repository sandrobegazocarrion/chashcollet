(function(){
  "use strict";

  const BANKS = {
    bcp:'BCP', bbva:'BBVA', interbank:'Interbank', scotiabank:'Scotiabank',
    banbif:'BanBif', pichincha:'Pichincha', mibanco:'Mibanco', nacion:'Nación', otra:'Otro banco'
  };
  const ACC_TYPES = {
    ahorro:'Cuenta de ahorros', corriente:'Cuenta corriente', efectivo:'Efectivo en mano', tarjeta:'Tarjeta de crédito'
  };

  const STEPS = ['welcome','basic','accounts','categories','goal','telegram','done'];

  const wiz = {
    overlay: null, body: null, stepsBar: null,
    shown: false,
    stepIndex: 0,
    addedAccounts: [],
    telegramLinked: false
  };

  // window.NUVA_API lo expone public/js/app.js — ya maneja el token de sesión y
  // el apiBase (Vercel → Railway). El wizard nunca debe hacer fetch() directo.
  function api(method, url, body){ return window.NUVA_API(method, url, body); }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderDots(){
    wiz.stepsBar.innerHTML = STEPS.map((s,i)=>{
      const cls = i < wiz.stepIndex ? 'wiz-dot done' : (i === wiz.stepIndex ? 'wiz-dot active' : 'wiz-dot');
      return `<div class="${cls}"></div>`;
    }).join('');
  }

  function currentStepName(){ return STEPS[wiz.stepIndex]; }

  function goTo(stepName){
    wiz.stepIndex = STEPS.indexOf(stepName);
    render();
  }
  function next(){ wiz.stepIndex++; render(); }
  function back(){ wiz.stepIndex--; render(); }

  function render(){
    const step = currentStepName();
    renderDots();
    const renderers = {
      welcome: renderWelcome, basic: renderBasic, accounts: renderAccounts,
      categories: renderCategories, goal: renderGoal, telegram: renderTelegram, done: renderDone
    };
    (renderers[step] || renderWelcome)();
  }

  /* ---------------- Paso: bienvenida ---------------- */
  function renderWelcome(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Bienvenido a NUVA</div>
      <div class="wiz-title">Organicemos tus finanzas</div>
      <div class="wiz-sub">Este recorrido rápido te muestra lo esencial: tu primera cuenta, tus categorías de gasto, una meta de ahorro y cómo registrar movimientos por Telegram. Toma menos de 2 minutos y puedes cambiar cualquier cosa después.</div>
      <div class="wiz-actions">
        <span></span>
        <div class="wiz-actions-right">
          <button type="button" class="btn btn-primary" id="wizNextBtn">Empecemos</button>
        </div>
      </div>
    `;
    document.getElementById('wizNextBtn').addEventListener('click', next);
  }

  /* ---------------- Paso: datos básicos ---------------- */
  function renderBasic(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 1 de 5</div>
      <div class="wiz-title">Cuéntanos de ti</div>
      <div class="wiz-sub">Usamos tu nombre solo para saludarte dentro de la app. La moneda de NUVA es soles (S/), fija.</div>
      <div class="field" style="margin-bottom:18px;"><label>Tu nombre (opcional)</label><input type="text" id="wizOwnerName" placeholder="Ej: Sandro"></div>
      <div class="wiz-actions">
        <span></span>
        <div class="wiz-actions-right">
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    document.getElementById('wizNextBtn').addEventListener('click', async ()=>{
      const name = document.getElementById('wizOwnerName').value.trim();
      try{ if(name) await api('PUT', '/api/profile', { ownerName: name }); }catch(e){}
      next();
    });
  }

  /* ---------------- Paso: cuentas ---------------- */
  function accListHtml(){
    if(!wiz.addedAccounts.length) return '';
    return `<div class="wiz-list">${wiz.addedAccounts.map((a,i)=>`
      <div class="wiz-list-item">
        <div style="flex:1;">
          <div class="wli-main">${escapeHtml(a.name)}</div>
          <div class="wli-sub">${ACC_TYPES[a.type]}${a.bank ? ' · ' + BANKS[a.bank] : ''}</div>
        </div>
        <button type="button" class="wli-remove" data-idx="${i}" title="Quitar" aria-label="Quitar"><i class="ph ph-x"></i></button>
      </div>
    `).join('')}</div>`;
  }

  function renderAccounts(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 2 de 5</div>
      <div class="wiz-title">Tu primera cuenta</div>
      <div class="wiz-sub">Todo en NUVA parte de una cuenta: banco, efectivo o tarjeta de crédito. Tus movimientos, metas y tarjetas siempre están ligados a una. Puedes agregar más después desde Billetera.</div>
      ${accListHtml()}
      <div class="form-grid" style="margin-bottom:14px;">
        <div class="field"><label>Tipo</label>
          <select id="wizAccType">
            <option value="ahorro">Cuenta de ahorros</option>
            <option value="corriente">Cuenta corriente</option>
            <option value="efectivo">Efectivo en mano</option>
            <option value="tarjeta">Tarjeta de crédito</option>
          </select>
        </div>
        <div class="field"><label>Nombre</label><input type="text" id="wizAccName" placeholder="Ej: Ahorros BCP"></div>
        <div class="field" id="wizAccBankField"><label>Banco</label><select id="wizAccBank"><option value="">Sin banco específico</option>${Object.keys(BANKS).map(k=>`<option value="${k}">${BANKS[k]}</option>`).join('')}</select></div>
        <div class="field"><label id="wizAccBalanceLabel">Saldo inicial</label><input type="number" min="0" step="0.01" id="wizAccBalance" value="0"></div>
      </div>
      <button type="button" class="btn btn-ghost" id="wizAddAccBtn" style="margin-bottom:16px;">+ Agregar esta cuenta</button>
      <div id="wizAccError"></div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
        <div class="wiz-actions-right">
          <button type="button" class="wiz-skip" id="wizSkipBtn">Omitir por ahora</button>
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    document.getElementById('wizBackBtn').addEventListener('click', back);
    document.getElementById('wizSkipBtn').addEventListener('click', next);
    document.getElementById('wizNextBtn').addEventListener('click', next);
    document.getElementById('wizAccType').addEventListener('change', (e)=>{
      const isTarjeta = e.target.value === 'tarjeta';
      const isEfectivo = e.target.value === 'efectivo';
      document.getElementById('wizAccBankField').style.display = isEfectivo ? 'none' : 'flex';
      document.getElementById('wizAccBalanceLabel').textContent = isTarjeta ? 'Deuda inicial' : 'Saldo inicial';
    });
    document.getElementById('wizAddAccBtn').addEventListener('click', async ()=>{
      const errBox = document.getElementById('wizAccError');
      errBox.innerHTML = '';
      const type = document.getElementById('wizAccType').value;
      const name = document.getElementById('wizAccName').value.trim();
      const bank = type !== 'efectivo' ? (document.getElementById('wizAccBank').value || null) : null;
      const balance = parseFloat(document.getElementById('wizAccBalance').value) || 0;
      if(!name){ errBox.innerHTML = `<div class="wiz-error">Ponle un nombre a la cuenta</div>`; return; }
      try{
        await api('POST', '/api/accounts', { type, name, balance, bank });
        wiz.addedAccounts.push({ type, name, bank });
        render();
      }catch(e){ errBox.innerHTML = `<div class="wiz-error">${escapeHtml(e.message)}</div>`; }
    });
    wiz.body.querySelectorAll('.wli-remove').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        // Las cuentas ya se crearon en el servidor; quitarlas de la lista del wizard no las borra
        // (evita depender de un id que no guardamos aquí) — se pueden borrar luego desde Billetera.
        wiz.addedAccounts.splice(Number(btn.dataset.idx), 1);
        render();
      });
    });
  }

  /* ---------------- Paso: categorías ---------------- */
  function renderCategories(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 3 de 5</div>
      <div class="wiz-title">Categorías de gasto</div>
      <div class="wiz-sub">Cada gasto o ingreso que registres queda agrupado por categoría — así los gráficos del Panel te muestran en qué se te va la plata. Ya vienen algunas comunes; agrega las que te falten.</div>
      <div class="wiz-chip-row" id="wizCatChips"><div class="wiz-chip">Cargando…</div></div>
      <div class="wiz-inline-add">
        <input type="text" id="wizCatInput" placeholder="Ej: Mascotas">
        <button type="button" class="btn btn-ghost" id="wizCatAddBtn">Agregar</button>
      </div>
      <div id="wizCatError"></div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
        <div class="wiz-actions-right">
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    document.getElementById('wizBackBtn').addEventListener('click', back);
    document.getElementById('wizNextBtn').addEventListener('click', next);
    loadCategoryChips();
    document.getElementById('wizCatAddBtn').addEventListener('click', addWizCategory);
    document.getElementById('wizCatInput').addEventListener('keydown', (e)=>{ if(e.key === 'Enter'){ e.preventDefault(); addWizCategory(); } });
  }
  async function loadCategoryChips(){
    try{
      const state = await api('GET', '/api/state');
      const wrap = document.getElementById('wizCatChips');
      if(wrap) wrap.innerHTML = (state.categories || []).map(c => `<span class="wiz-chip">${escapeHtml(c)}</span>`).join('');
    }catch(e){}
  }
  async function addWizCategory(){
    const input = document.getElementById('wizCatInput');
    const name = input.value.trim();
    const errBox = document.getElementById('wizCatError');
    errBox.innerHTML = '';
    if(!name) return;
    try{
      await api('POST', '/api/categories', { name });
      input.value = '';
      await loadCategoryChips();
    }catch(e){ errBox.innerHTML = `<div class="wiz-error">${escapeHtml(e.message)}</div>`; }
  }

  /* ---------------- Paso: meta de ahorro ---------------- */
  function renderGoal(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 4 de 5 · Opcional</div>
      <div class="wiz-title">Meta de ahorro mensual</div>
      <div class="wiz-sub">Si nos dices cuánto quieres ahorrar cada mes, el Panel te muestra tu progreso en tiempo real. Puedes cambiarla cuando quieras.</div>
      <div class="field" style="margin-bottom:18px;"><label>Meta mensual (S/)</label><input type="number" min="0" step="0.01" id="wizGoalAmount" placeholder="Ej: 500"></div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
        <div class="wiz-actions-right">
          <button type="button" class="wiz-skip" id="wizSkipBtn">Omitir</button>
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    document.getElementById('wizBackBtn').addEventListener('click', back);
    document.getElementById('wizSkipBtn').addEventListener('click', next);
    document.getElementById('wizNextBtn').addEventListener('click', async ()=>{
      const amount = parseFloat(document.getElementById('wizGoalAmount').value) || 0;
      try{ if(amount > 0) await api('PUT', '/api/goal', { amount }); }catch(e){}
      next();
    });
  }

  /* ---------------- Paso: Telegram ---------------- */
  let wizTelegramPoll = null;
  let wizCodeCountdown = null;
  function renderTelegram(){
    clearInterval(wizTelegramPoll);
    clearInterval(wizCodeCountdown);
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 5 de 5 · Opcional</div>
      <div class="wiz-title">Registra gastos por Telegram</div>
      <div class="wiz-sub">NUVA tiene un bot compartido: escríbele "gasto 25 comida" y queda registrado al toque, sin abrir la app. Para vincularlo, genera un código acá y pégalo en el chat del bot.</div>
      <button type="button" class="btn btn-ghost" id="wizTgGenBtn" style="margin-bottom:14px;">Generar código de vinculación</button>
      <div id="wizTgCodeBox"></div>
      <div id="wizTgStatus"></div>
      <div id="wizTgError"></div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
        <div class="wiz-actions-right">
          <button type="button" class="wiz-skip" id="wizSkipBtn">Omitir por ahora</button>
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    const stopPolling = () => { clearInterval(wizTelegramPoll); clearInterval(wizCodeCountdown); };
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ stopPolling(); back(); });
    document.getElementById('wizSkipBtn').addEventListener('click', ()=>{ stopPolling(); next(); });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{ stopPolling(); next(); });
    document.getElementById('wizTgGenBtn').addEventListener('click', async ()=>{
      const errBox = document.getElementById('wizTgError');
      errBox.innerHTML = '';
      try{
        const { code, expiresAt } = await api('POST', '/api/telegram/link-code');
        const box = document.getElementById('wizTgCodeBox');
        const expiresMs = new Date(expiresAt).getTime();
        const renderCountdown = ()=>{
          const secsLeft = Math.max(0, Math.round((expiresMs - Date.now())/1000));
          const mm = Math.floor(secsLeft/60), ss = String(secsLeft%60).padStart(2,'0');
          box.innerHTML = `
            <div class="wiz-status-row" style="justify-content:center;flex-direction:column;gap:6px;padding:14px;">
              <div style="font-size:11px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.4px;">Tu código (válido ${mm}:${ss})</div>
              <div style="font-size:28px;font-weight:800;letter-spacing:4px;color:var(--ink);font-variant-numeric:tabular-nums;">${escapeHtml(code)}</div>
              <div style="font-size:12px;color:var(--text-dim);">Abre el bot en Telegram y pégalo en el chat.</div>
            </div>
          `;
          if(secsLeft <= 0){ clearInterval(wizCodeCountdown); box.innerHTML = `<div class="wiz-error">El código venció. Genera uno nuevo.</div>`; }
        };
        renderCountdown();
        wizCodeCountdown = setInterval(renderCountdown, 1000);
        showTgStatus('pulse', 'Esperando a que lo pegues en Telegram…');
        wizTelegramPoll = setInterval(pollTelegramStatus, 3000);
      }catch(e){ errBox.innerHTML = `<div class="wiz-error">${escapeHtml(e.message)}</div>`; }
    });
  }
  function showTgStatus(state, text){
    const el = document.getElementById('wizTgStatus');
    if(!el) return;
    el.innerHTML = `<div class="wiz-status-row"><span class="wiz-status-dot ${state}"></span>${escapeHtml(text)}</div>`;
  }
  async function pollTelegramStatus(){
    try{
      const status = await api('GET', '/api/telegram/link-status');
      if(status.linked){
        clearInterval(wizTelegramPoll);
        clearInterval(wizCodeCountdown);
        showTgStatus('ok', '¡Listo! Tu Telegram quedó vinculado.');
      }
    }catch(e){}
  }

  /* ---------------- Paso: final ---------------- */
  function renderDone(){
    clearInterval(wizTelegramPoll);
    clearInterval(wizCodeCountdown);
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Todo listo</div>
      <div class="wiz-title">NUVA está configurado</div>
      <div class="wiz-sub">Puedes cambiar cualquiera de estas cosas después desde la propia app.</div>
      <div class="wiz-summary">
        <div class="wiz-summary-row"><span class="wsr-label">Cuentas agregadas</span><span class="wsr-val">${wiz.addedAccounts.length}</span></div>
      </div>
      <div class="wiz-actions">
        <span></span>
        <div class="wiz-actions-right">
          <button type="button" class="btn btn-primary" id="wizFinishBtn">Empezar a usar NUVA</button>
        </div>
      </div>
    `;
    document.getElementById('wizFinishBtn').addEventListener('click', async ()=>{
      try{ await api('POST', '/api/setup/complete'); }catch(e){}
      wiz.overlay.classList.remove('open');
      document.body.style.overflow = '';
      // __startNuvaApp() ya es seguro de llamar de nuevo — vuelve a pedir el estado
      // (ahora con setupCompleted:true) sin duplicar el intervalo de auto-refresco.
      window.__startNuvaApp ? window.__startNuvaApp() : location.reload();
    });
  }

  /* ---------------- Disparo ---------------- */
  // Se llama desde public/js/app.js, dentro de refreshAndRender(), justo después de
  // cargar el estado ya autenticado del usuario — así el wizard nunca hace su propia
  // llamada sin sesión (esa era la causa de que nunca apareciera).
  function maybeShow(state){
    if(wiz.shown) return;
    if(!state || state.setupCompleted) return;
    wiz.overlay = document.getElementById('wizOverlay');
    wiz.body = document.getElementById('wizBody');
    wiz.stepsBar = document.getElementById('wizSteps');
    if(!wiz.overlay) return;
    wiz.shown = true;
    wiz.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    goTo('welcome');
  }

  window.NUVA_WIZARD = { maybeShow };
})();

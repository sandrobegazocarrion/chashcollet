(function(){
  "use strict";

  const BANKS = {
    bcp:'BCP', bbva:'BBVA', interbank:'Interbank', scotiabank:'Scotiabank',
    banbif:'BanBif', pichincha:'Pichincha', mibanco:'Mibanco', nacion:'Nación', otra:'Otro banco'
  };
  const ACC_TYPES = {
    ahorro:'Cuenta de ahorros', corriente:'Cuenta corriente', efectivo:'Efectivo en mano', tarjeta:'Tarjeta de crédito'
  };

  const STEPS = ['welcome','import','basic','accounts','categories','goal','telegram','mobile','done'];

  const wiz = {
    overlay: null, body: null, stepsBar: null,
    path: null, // 'scratch' | 'import'
    stepIndex: 0,
    addedAccounts: [],
    addedCategories: [],
    telegramLinked: false
  };

  async function api(method, url, body){
    const res = await fetch(url, {
      method,
      headers: body !== undefined ? {'Content-Type':'application/json'} : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
    let json = null;
    try{ json = await res.json(); }catch(e){}
    if(!res.ok) throw new Error((json && json.error) || 'Error de conexión con el servidor');
    return json;
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function visibleSteps(){
    // El camino de "importar" salta directo a la pantalla de importación y termina ahí.
    if(wiz.path === 'import') return ['welcome','import'];
    return STEPS.filter(s => s !== 'import');
  }

  function renderDots(){
    const steps = visibleSteps();
    const idx = steps.indexOf(STEPS[wiz.stepIndex] === 'import' ? 'import' : currentStepName());
    wiz.stepsBar.innerHTML = steps.map((s,i)=>{
      const cls = i < idx ? 'wiz-dot done' : (i === idx ? 'wiz-dot active' : 'wiz-dot');
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
      welcome: renderWelcome, import: renderImport, basic: renderBasic,
      accounts: renderAccounts, categories: renderCategories, goal: renderGoal,
      telegram: renderTelegram, mobile: renderMobile, done: renderDone
    };
    (renderers[step] || renderWelcome)();
  }

  /* ---------------- Paso: bienvenida ---------------- */
  function renderWelcome(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Bienvenido</div>
      <div class="wiz-title">Configuremos NUVA</div>
      <div class="wiz-sub">Antes de empezar, dinos cómo quieres arrancar. Esto solo se pregunta una vez.</div>
      <div class="wiz-choice-grid">
        <button type="button" class="wiz-choice" id="wizChoiceScratch">
          <i class="ph ph-sparkle"></i>
          <div class="wc-title">Configurar desde cero</div>
          <div class="wc-sub">Crea tus cuentas, categorías y preferencias en unos pasos.</div>
        </button>
        <button type="button" class="wiz-choice" id="wizChoiceImport">
          <i class="ph ph-upload-simple"></i>
          <div class="wc-title">Importar configuración existente</div>
          <div class="wc-sub">Sube un archivo data.json de un respaldo o de otra instalación.</div>
        </button>
      </div>
    `;
    document.getElementById('wizChoiceScratch').addEventListener('click', ()=>{ wiz.path = 'scratch'; goTo('basic'); });
    document.getElementById('wizChoiceImport').addEventListener('click', ()=>{ wiz.path = 'import'; goTo('import'); });
  }

  /* ---------------- Paso: importar ---------------- */
  function renderImport(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Importar</div>
      <div class="wiz-title">Sube tu archivo data.json</div>
      <div class="wiz-sub">Reemplazará cualquier dato de esta instalación por el contenido del archivo.</div>
      <div class="wiz-file-drop" id="wizDropZone">
        <i class="ph ph-file-arrow-up"></i>
        <div class="wfd-text">Haz clic para elegir el archivo</div>
        <div class="wfd-sub">Debe ser el data.json exportado desde NUVA</div>
      </div>
      <input type="file" id="wizFileInput" accept="application/json,.json" style="display:none;">
      <div id="wizImportError"></div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
      </div>
    `;
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ wiz.path = null; goTo('welcome'); });
    const dz = document.getElementById('wizDropZone');
    const input = document.getElementById('wizFileInput');
    dz.addEventListener('click', ()=> input.click());
    input.addEventListener('change', async ()=>{
      const file = input.files[0];
      if(!file) return;
      const errBox = document.getElementById('wizImportError');
      errBox.innerHTML = '';
      try{
        const text = await file.text();
        const parsed = JSON.parse(text);
        await api('POST', '/api/setup/import', parsed);
        finishAndReload();
      }catch(e){
        errBox.innerHTML = `<div class="wiz-error">No se pudo importar: ${escapeHtml(e.message)}</div>`;
      }
    });
  }

  /* ---------------- Paso: datos básicos ---------------- */
  function renderBasic(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 1 de 6</div>
      <div class="wiz-title">Cuéntanos de ti</div>
      <div class="wiz-sub">La moneda de NUVA es soles (S/) — está fija, no hace falta configurarla.</div>
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
      <div class="wiz-eyebrow">Paso 2 de 6</div>
      <div class="wiz-title">Tus cuentas</div>
      <div class="wiz-sub">Agrega tus cuentas de banco, efectivo o tarjetas de crédito. Puedes agregar más después desde Billetera.</div>
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
      <div class="wiz-eyebrow">Paso 3 de 6</div>
      <div class="wiz-title">Categorías de gasto</div>
      <div class="wiz-sub">Ya vienen algunas categorías comunes. Agrega las que te falten (puedes agregar más después).</div>
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
      <div class="wiz-eyebrow">Paso 4 de 6 · Opcional</div>
      <div class="wiz-title">Meta de ahorro mensual</div>
      <div class="wiz-sub">¿Cuánto te gustaría ahorrar cada mes? Puedes cambiarlo cuando quieras desde el Panel.</div>
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
  function renderTelegram(){
    clearInterval(wizTelegramPoll);
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 5 de 6 · Opcional</div>
      <div class="wiz-title">Bot de Telegram</div>
      <div class="wiz-sub">Recibe avisos de pagos, cuotas y metas de ahorro directo en Telegram. Cada instalación usa su propio bot, así que nadie más puede ver tus datos.</div>
      <ol class="wiz-steps-list">
        <li>Abre Telegram y busca <b>@BotFather</b>.</li>
        <li>Envíale <b>/newbot</b> y sigue las instrucciones (nombre y usuario del bot).</li>
        <li>Copia el <b>token</b> que te da y pégalo abajo.</li>
      </ol>
      <div class="field" style="margin-bottom:12px;"><label>Token del bot</label><input type="text" id="wizTgToken" placeholder="123456789:AA...", autocomplete="off"></div>
      <button type="button" class="btn btn-ghost" id="wizTgConnectBtn" style="margin-bottom:14px;">Vincular bot</button>
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
    document.getElementById('wizBackBtn').addEventListener('click', ()=>{ clearInterval(wizTelegramPoll); back(); });
    document.getElementById('wizSkipBtn').addEventListener('click', ()=>{ clearInterval(wizTelegramPoll); next(); });
    document.getElementById('wizNextBtn').addEventListener('click', ()=>{ clearInterval(wizTelegramPoll); next(); });
    document.getElementById('wizTgConnectBtn').addEventListener('click', async ()=>{
      const token = document.getElementById('wizTgToken').value.trim();
      const errBox = document.getElementById('wizTgError');
      errBox.innerHTML = '';
      if(!token){ errBox.innerHTML = `<div class="wiz-error">Pega el token que te dio @BotFather</div>`; return; }
      try{
        await api('POST', '/api/setup/telegram', { token });
        showTgStatus('pulse', 'Bot iniciado. Ahora abre tu bot en Telegram y envíale /start…');
        wizTelegramPoll = setInterval(pollTelegramStatus, 2500);
        pollTelegramStatus();
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
      const status = await api('GET', '/api/setup/telegram-status');
      if(status.linked){
        clearInterval(wizTelegramPoll);
        showTgStatus('ok', '¡Listo! Tu bot quedó vinculado a esta instalación.');
      }
    }catch(e){}
  }

  /* ---------------- Paso: celular ---------------- */
  function renderMobile(){
    wiz.body.innerHTML = `
      <div class="wiz-eyebrow">Paso 6 de 6</div>
      <div class="wiz-title">Usa NUVA desde tu celular</div>
      <div class="wiz-sub">Con tu celular conectado a la <b>misma red WiFi</b> que esta computadora, abre esta dirección en el navegador del celular:</div>
      <div id="wizMobileBox"><div class="wiz-link-box"><span class="wlb-url">Cargando…</span></div></div>
      <div class="wiz-note"><i class="ph ph-info"></i>Esta dirección puede cambiar si tu red WiFi cambia. Siempre puedes verla de nuevo en esta app.</div>
      <div class="wiz-actions">
        <button type="button" class="btn btn-ghost" id="wizBackBtn">Atrás</button>
        <div class="wiz-actions-right">
          <button type="button" class="btn btn-primary" id="wizNextBtn">Continuar</button>
        </div>
      </div>
    `;
    document.getElementById('wizBackBtn').addEventListener('click', back);
    document.getElementById('wizNextBtn').addEventListener('click', next);
    loadNetworkInfo();
  }
  async function loadNetworkInfo(){
    try{
      const info = await api('GET', '/api/network-info');
      const box = document.getElementById('wizMobileBox');
      if(!box) return;
      if(!info.ips || !info.ips.length){
        box.innerHTML = `<div class="wiz-note"><i class="ph ph-warning-circle"></i>No se detectó una red WiFi activa. Conecta esta computadora a tu WiFi y vuelve a intentar más tarde desde Ajustes.</div>`;
        return;
      }
      box.innerHTML = info.ips.map(ip => `<div class="wiz-link-box"><span class="wlb-url">http://${ip}:${info.port}</span></div>`).join('');
    }catch(e){}
  }

  /* ---------------- Paso: final ---------------- */
  function renderDone(){
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
      finishAndReload();
    });
  }

  function finishAndReload(){
    location.reload();
  }

  /* ---------------- Arranque ---------------- */
  async function init(){
    wiz.overlay = document.getElementById('wizOverlay');
    wiz.body = document.getElementById('wizBody');
    wiz.stepsBar = document.getElementById('wizSteps');
    if(!wiz.overlay) return;
    try{
      const state = await api('GET', '/api/state');
      if(state.setupCompleted) return;
    }catch(e){
      return; // sin conexión con el servidor: no bloquear con el wizard
    }
    wiz.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    goTo('welcome');
  }

  init();
})();

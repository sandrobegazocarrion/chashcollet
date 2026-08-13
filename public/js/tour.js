(function(){
  "use strict";

  /*
   * Recorrido de bienvenida tipo "spotlight": en vez de un formulario aparte, señala
   * botones reales de la app (Billetera, Configuración, etc.) con un anillo + una
   * tarjeta explicativa. El usuario avanza con "Siguiente"/"Atrás" — nunca se hace la
   * acción por él, solo se le muestra dónde está. Cada paso es idempotente: si el
   * usuario cerró un modal o cambió de pestaña por su cuenta, el paso se auto-corrige
   * al (re)renderizarse, tanto avanzando como retrocediendo.
   */

  const STEPS = [
    {
      key: 'welcome', center: true,
      title: 'Bienvenido a NUVA',
      body: 'Te muestro rápido dónde está todo. Puedes saltar el recorrido cuando quieras.'
    },
    {
      key: 'account',
      prepare: async () => {
        const nav = document.querySelector('.nav-item[data-tab="billetera"]');
        if(nav) nav.click();
        await waitForElement('.wcard-add[data-action="open-add-account"]');
      },
      target: '.wcard-add[data-action="open-add-account"]',
      title: 'Tu primera cuenta',
      body: 'Todo en NUVA parte de una cuenta: banco, efectivo o tarjeta de crédito. Acá la agregas.'
    },
    {
      key: 'tx',
      target: '.sb-add-btn[data-action="open-add-tx"]',
      title: 'Registra un movimiento',
      body: 'Desde acá agregas ingresos y gastos. Al elegir categoría puedes crear una propia con "+ Nueva categoría...".'
    },
    {
      key: 'name',
      prepare: () => openSettingsIfNeeded(),
      target: '#settingOwnerName',
      title: 'Tu nombre',
      body: 'Lo usamos solo para saludarte dentro de la app.'
    },
    {
      key: 'goal',
      prepare: () => openSettingsIfNeeded(),
      target: '#settingGoalAmount',
      title: 'Meta de ahorro mensual',
      body: 'Si nos dices cuánto quieres ahorrar cada mes, el Panel te muestra tu progreso en tiempo real.'
    },
    {
      key: 'telegram',
      prepare: () => openSettingsIfNeeded(),
      target: '#linkTelegramBtn, #unlinkTelegramBtn',
      title: 'Vincula tu Telegram',
      body: 'Escríbele al bot "gasto 25 comida" y queda registrado al toque, sin abrir la app. Vincúlalo cuando quieras.'
    },
    {
      key: 'done', center: true, isFinal: true,
      title: '¡Listo!',
      body: 'Ya sabes lo esencial. Puedes volver a cualquiera de estas pantallas cuando quieras.'
    }
  ];

  let stepIndex = 0;
  let started = false;
  let overlay, highlightEl, tooltipEl;

  function waitForElement(selector, timeoutMs){
    timeoutMs = timeoutMs || 3000;
    return new Promise((resolve) => {
      const start = Date.now();
      (function poll(){
        const el = document.querySelector(selector);
        if(el || Date.now() - start > timeoutMs){ resolve(el); return; }
        requestAnimationFrame(poll);
      })();
    });
  }

  async function openSettingsIfNeeded(){
    // Si el usuario ya tiene el modal abierto (viniendo del paso anterior de esta
    // misma sección), no lo reabrimos — perdería lo que haya empezado a escribir.
    if(document.getElementById('settingOwnerName')) return;
    const btn = document.getElementById('avatarBtn');
    if(btn) btn.click();
    await waitForElement('#settingOwnerName');
  }

  function buildOverlay(){
    overlay = document.createElement('div');
    overlay.className = 'tour-root';
    highlightEl = document.createElement('div');
    highlightEl.className = 'tour-highlight';
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tour-tooltip';
    overlay.appendChild(highlightEl);
    overlay.appendChild(tooltipEl);
    document.body.appendChild(overlay);
    window.addEventListener('resize', () => positionAll(getTargetEl(STEPS[stepIndex])));
  }

  function getTargetEl(step){
    return step.target ? document.querySelector(step.target) : null;
  }

  function positionAll(targetEl){
    const step = STEPS[stepIndex];
    if(step.center || !targetEl){
      highlightEl.style.display = 'none';
      const tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
      tooltipEl.style.left = Math.round(window.innerWidth/2 - tw/2) + 'px';
      tooltipEl.style.top = Math.round(window.innerHeight/2 - th/2) + 'px';
      return;
    }
    const pad = 6;
    const r = targetEl.getBoundingClientRect();
    highlightEl.style.display = 'block';
    highlightEl.style.left = (r.left - pad) + 'px';
    highlightEl.style.top = (r.top - pad) + 'px';
    highlightEl.style.width = (r.width + pad*2) + 'px';
    highlightEl.style.height = (r.height + pad*2) + 'px';

    const margin = 14;
    const tw = tooltipEl.offsetWidth, th = tooltipEl.offsetHeight;
    let top = r.bottom + margin;
    let left = r.left;
    if(top + th > window.innerHeight - 10) top = r.top - th - margin;
    if(top < 10) top = 10;
    if(left + tw > window.innerWidth - 10) left = window.innerWidth - tw - 10;
    if(left < 10) left = 10;
    tooltipEl.style.left = left + 'px';
    tooltipEl.style.top = top + 'px';

    targetEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function escapeHtml(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function renderStep(){
    const step = STEPS[stepIndex];
    const total = STEPS.length - 2; // sin contar bienvenida/fin en la numeración visible
    const isReal = !step.center;
    const eyebrow = step.center ? (step.isFinal ? 'Todo listo' : 'Bienvenida') : `Paso ${stepIndex} de ${total}`;

    tooltipEl.innerHTML = `
      <div class="tour-eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="tour-title">${escapeHtml(step.title)}</div>
      <div class="tour-body">${escapeHtml(step.body)}</div>
      <div class="tour-actions">
        <button type="button" class="tour-skip" id="tourSkipBtn">${step.isFinal ? '' : 'Saltar tour'}</button>
        <div class="tour-actions-right">
          ${stepIndex > 0 ? '<button type="button" class="btn btn-ghost" id="tourBackBtn">Atrás</button>' : ''}
          <button type="button" class="btn btn-primary" id="tourNextBtn">${step.isFinal ? 'Terminar' : 'Siguiente'}</button>
        </div>
      </div>
    `;
    tooltipEl.querySelector('.tour-skip').style.visibility = step.isFinal ? 'hidden' : 'visible';

    const nextBtn = document.getElementById('tourNextBtn');
    const backBtn = document.getElementById('tourBackBtn');
    const skipBtn = document.getElementById('tourSkipBtn');
    nextBtn.addEventListener('click', () => { if(step.isFinal) finish(); else goTo(stepIndex + 1); });
    if(backBtn) backBtn.addEventListener('click', () => goTo(stepIndex - 1));
    skipBtn.addEventListener('click', finish);

    positionAll(null); // posición provisoria mientras carga el prepare()
    if(step.prepare){
      nextBtn.disabled = true; if(backBtn) backBtn.disabled = true;
      try{ await step.prepare(); }catch(e){}
      nextBtn.disabled = false; if(backBtn) backBtn.disabled = false;
    }
    positionAll(getTargetEl(step));
  }

  function goTo(i){
    stepIndex = Math.max(0, Math.min(STEPS.length - 1, i));
    renderStep();
  }

  async function finish(){
    try{ await window.NUVA_API('POST', '/api/setup/complete'); }catch(e){}
    const modalOverlay = document.getElementById('modalOverlay');
    if(modalOverlay) modalOverlay.classList.remove('open');
    if(overlay) overlay.remove();
    overlay = null;
  }

  function maybeStart(state){
    if(started) return;
    if(!state || state.setupCompleted) return;
    started = true;
    buildOverlay();
    stepIndex = 0;
    renderStep();
  }

  window.NUVA_TOUR = { maybeStart };
})();

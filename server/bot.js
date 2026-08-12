'use strict';
/*
 * Bot de Telegram compartido, multiusuario (Fase 4).
 *
 * Ya no hay un "ownerChatId" único: cada chat se vincula a un user_id mediante un
 * código de un solo uso generado desde la web (telegramLink.js). Toda consulta acá
 * usa el cliente `service_role` (supabaseAdmin), que SALTA el RLS de Postgres por
 * completo — por eso dataStore.js filtra `user_id` explícito en cada query, y por
 * eso acá SIEMPRE se resuelve el userId del chat_id ANTES de tocar cualquier dato,
 * nunca se confía en nada que no venga de esa resolución.
 */

const { TelegramBot } = require('node-telegram-bot-api');
const { supabaseAdmin } = require('./auth');
const dataStore = require('./dataStore');
const telegramLink = require('./telegramLink');
const finance = require('./finance');
const { sanitizeString } = require('./sanitize');

/* ---------------- Fase 6: rate limiting por chat ----------------
 * Ventana deslizante en memoria: máx RATE_LIMIT_MAX eventos (mensajes o taps de
 * botón) por chat en RATE_LIMIT_WINDOW_MS. Si un chat se pasa, se ignora en
 * silencio (no se responde nada) — así no amplificamos el spam con más mensajes. */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitHits = new Map(); // chatId → timestamps[]
function isRateLimited(chatId) {
  const now = Date.now();
  const hits = (rateLimitHits.get(chatId) || []).filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(chatId, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function fmt(n) { return finance.formatMoney(n); }

function parseAmount(raw) {
  const cleaned = String(raw).replace(/[^\d.]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? NaN : n;
}

const TX_REGEX = /^\/?(gasto|ingreso)\s+([\d.,]+)\s+(\S+)\s*([\s\S]*)$/i;
const CODE_REGEX = /^\s*(\d{6})\s*$/;

/* ---------------- Menú principal ---------------- */
const MAIN_MENU = {
  reply_markup: {
    inline_keyboard: [
      [{ text: '💸 Registrar gasto',   callback_data: 'menu:gasto'          },
       { text: '💰 Registrar ingreso', callback_data: 'menu:ingreso'        }],
      [{ text: '📊 Resumen del mes',   callback_data: 'menu:resumen'        },
       { text: '👜 Mi billetera',      callback_data: 'menu:billetera'      }],
      [{ text: '📅 Próximos pagos',    callback_data: 'menu:calendario'     },
       { text: '🐷 Chanchitos',        callback_data: 'menu:chanchitos'     }],
      [{ text: '📋 Compromisos',       callback_data: 'menu:compromisos'    },
       { text: '🔔 Notificaciones',    callback_data: 'menu:notificaciones' }]
    ]
  }
};

function start(token) {
  const bot = new TelegramBot(token, { polling: true });
  // chatId → { step, type, amount, category, description }
  const sessions = new Map();

  bot.on('polling_error', (err) => console.error('Telegram polling error:', err.message));

  /* ---- Resolver usuario vinculado a este chat ---- */
  async function resolveUser(chatId) {
    try { return await telegramLink.getLinkedUserId(chatId); }
    catch (e) { console.error('Error resolviendo vínculo de Telegram:', e.message); return null; }
  }

  async function promptLink(chatId) {
    await bot.sendMessage(chatId,
      '🔒 Este chat todavía no está vinculado a ninguna cuenta de NUVA.\n\n' +
      '1. Entra a la app web y ve a Configuración → Vincular Telegram.\n' +
      '2. Copia el código de 6 dígitos que te muestra (vale por 10 minutos).\n' +
      '3. Pégalo acá.'
    );
  }

  async function tryLinkWithCode(chatId, code) {
    try {
      await telegramLink.consumeLinkCode(code, chatId);
      await bot.sendMessage(chatId,
        '✅ ¡Cuenta vinculada! Este chat ya está conectado a tu NUVA.\n\n' +
        'Puedes usar el menú de abajo o escribir directamente:\n' +
        '`gasto 25 comida Almuerzo`\n`ingreso 1500 salario Quincena`',
        { parse_mode: 'Markdown' }
      );
      await sendMenu(chatId);
      return true;
    } catch (e) {
      await bot.sendMessage(chatId, `❌ ${e.message}`);
      return false;
    }
  }

  /* ---- Enviar menú principal ---- */
  async function sendMenu(chatId, text = '¿Qué quieres hacer?') {
    await bot.sendMessage(chatId, text, MAIN_MENU);
  }

  /* ---- Respuestas de menú ---- */
  async function handleMenuResumen(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const t = finance.computeTotals(store);
    const g = finance.getMonthProgress(store);
    const now = new Date();
    const mes = now.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
    const mesLabel = mes.charAt(0).toUpperCase() + mes.slice(1);
    let txt = `📊 *Resumen de ${mesLabel}*\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `💚 Ingresos: ${fmt(t.totalIngresos)}\n`;
    txt += `🔴 Gastos: ${fmt(t.totalGastos)}\n`;
    txt += `📈 Balance: ${t.balance >= 0 ? '+' : ''}${fmt(t.balance)}\n`;
    txt += `━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `💳 Deuda tarjeta: ${fmt(t.totalDeuda)}\n`;
    txt += `🐷 Total ahorrado: ${fmt(t.totalAhorrado)}\n`;
    if (g.goal > 0) {
      txt += `━━━━━━━━━━━━━━━━━━━━\n`;
      txt += `🎯 Meta del mes: ${fmt(g.saved)} / ${fmt(g.goal)} (${g.pct}%)`;
    }
    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    await sendMenu(chatId);
  }

  async function handleMenuBilletera(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const liquid = store.accounts.filter(a => a.type !== 'tarjeta');
    if (liquid.length === 0) {
      await sendMenu(chatId, '👜 No tienes cuentas en tu billetera. Créalas desde la app web.');
      return;
    }
    const total = liquid.reduce((s, a) => s + a.balance, 0);
    const typeIcon = { ahorro: '💰', corriente: '🏦', efectivo: '💵' };
    let txt = `👜 *Mi Billetera*\n━━━━━━━━━━━━━━━━━━━━\n💎 *Total: ${fmt(total)}*\n━━━━━━━━━━━━━━━━━━━━\n`;
    liquid.forEach(a => {
      const icon = typeIcon[a.type] || '💰';
      txt += `${icon} *${a.name}*: ${fmt(a.balance)}`;
      if (a.bank) txt += ` _(${a.bank.toUpperCase()})_`;
      if (a.interestRate) txt += `\n  📈 Tasa: ${a.interestRate}% anual`;
      if (a.monthlyDeposit) txt += ` · Depósito: ${fmt(a.monthlyDeposit)}/mes`;
      txt += '\n';
    });
    const cards = store.accounts.filter(a => a.type === 'tarjeta');
    if (cards.length > 0) {
      txt += `━━━━━━━━━━━━━━━━━━━━\n💳 *Tarjetas de crédito*\n`;
      cards.forEach(c => {
        txt += `💳 ${c.name}: deuda ${fmt(c.balance)}`;
        if (c.creditLimit) txt += ` / límite ${fmt(c.creditLimit)}`;
        if (c.billingDay) txt += ` · Pago: día ${c.billingDay}`;
        txt += '\n';
      });
    }
    await bot.sendMessage(chatId, txt.trim(), { parse_mode: 'Markdown' });
    await sendMenu(chatId);
  }

  async function handleMenuNotificaciones(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const on = !store.settings || store.settings.telegramNotifications !== false;
    const txt = `🔔 *Notificaciones Telegram*\n\nEstado actual: ${on ? '✅ Activadas' : '❌ Desactivadas'}\n\nTe avisaré cuando se acerquen los vencimientos de tus compromisos, deudas y tarjetas.`;
    await bot.sendMessage(chatId, txt, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: on ? '🔕 Desactivar' : '🔔 Activar', callback_data: on ? 'notif:off' : 'notif:on' }],
          [{ text: '← Volver al menú', callback_data: 'menu:back' }]
        ]
      }
    });
  }

  async function handleMenuCuentas(chatId, userId) {
    await handleMenuBilletera(chatId, userId);
  }

  async function handleMenuCalendario(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const today = new Date().getDate();
    const monthKey = finance.currentYYYYMM();

    const events = [];
    store.reminders.forEach(r => {
      const dias = r.dueDay - today;
      const when = dias < 0 ? '(ya venció)' : dias === 0 ? '¡HOY!' : `en ${dias} día(s)`;
      const cuota = r.totalInstallments ? ` [${r.paidInstallments || 0}/${r.totalInstallments}]` : '';
      events.push({ day: r.dueDay, text: `📅 Día ${r.dueDay}: *${r.name}*${cuota}${r.amount ? ' · ' + fmt(r.amount) : ''} ${when}` });
    });

    const paidDeudaIds = new Set((store.deudaPayments || []).filter(p => p.month === monthKey).map(p => p.deudaId));
    (store.deudas || []).forEach(d => {
      const dias = d.dueDay - today;
      const when = dias < 0 ? '(ya venció)' : dias === 0 ? '¡HOY!' : `en ${dias} día(s)`;
      const paid = paidDeudaIds.has(d.id) ? ' ✅' : '';
      events.push({ day: d.dueDay, text: `🟡 Día ${d.dueDay}: *${d.name}*${paid}${d.amount ? ' · ' + fmt(d.amount) : ''} ${when}` });
    });

    store.accounts.filter(a => a.type === 'tarjeta' && a.billingDay).forEach(c => {
      const dias = c.billingDay - today;
      const when = dias < 0 ? '(ya venció)' : dias === 0 ? '¡HOY!' : `en ${dias} día(s)`;
      events.push({ day: c.billingDay, text: `💳 Día ${c.billingDay}: Pago *${c.name}* (deuda: ${fmt(c.balance)}) ${when}` });
    });

    if (events.length === 0) {
      await sendMenu(chatId, '📅 No tienes pagos programados este mes.');
      return;
    }
    events.sort((a, b) => a.day - b.day);
    let txt = '📅 *Pagos de este mes*\n━━━━━━━━━━━━━━━━━━━━\n';
    events.forEach(ev => { txt += ev.text + '\n'; });
    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    await sendMenu(chatId);
  }

  async function handleMenuChanchitos(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    if (store.pockets.length === 0) {
      await sendMenu(chatId, '🐷 No tienes chanchitos de ahorro. Créalos desde la app web → Chanchito.');
      return;
    }
    const monthKey = finance.currentYYYYMM();
    let txt = '🐷 *Chanchitos de ahorro*\n━━━━━━━━━━━━━━━━━━━━\n';
    store.pockets.forEach(p => {
      txt += `🐷 ${p.isPrimary ? '⭐ ' : ''}*${p.name}*: ${fmt(p.balance)}`;
      if (p.target) txt += ` / ${fmt(p.target)}`;
      if (p.rate) txt += ` (+${p.rate}%/mes)`;
      txt += '\n';
      if (p.monthlyTarget) {
        const saved = (p.contributions || []).filter(c => c.date && c.date.slice(0, 7) === monthKey).reduce((s, c) => s + c.amount, 0);
        txt += `   Este mes: ${fmt(saved)} / ${fmt(p.monthlyTarget)}\n`;
      }
    });
    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    await sendMenu(chatId);
  }

  async function handleMenuCompromisos(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const deudas = store.deudas || [];
    if (deudas.length === 0) {
      await sendMenu(chatId, '📋 No tienes compromisos registrados. Créalos desde la app web → Deudas.');
      return;
    }
    const monthKey = new Date().toISOString().slice(0, 7);
    const paidIds = new Set((store.deudaPayments || []).filter(p => p.month === monthKey).map(p => p.deudaId));
    let txt = '📋 *Compromisos de este mes*\n━━━━━━━━━━━━━━━━━━━━\n';
    deudas.forEach(d => {
      const estado = paidIds.has(d.id) ? '✅' : '⏳';
      txt += `${estado} ${d.name}`;
      if (d.amount) txt += ` · ${fmt(d.amount)}`;
      txt += ` (día ${d.dueDay})\n`;
    });
    const total = deudas.reduce((s, d) => s + (d.amount || 0), 0);
    const pagado = deudas.filter(d => paidIds.has(d.id)).reduce((s, d) => s + (d.amount || 0), 0);
    txt += `━━━━━━━━━━━━━━━━━━━━\n`;
    txt += `✅ Pagado: ${fmt(pagado)} · ⏳ Pendiente: ${fmt(total - pagado)}`;
    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
    await sendMenu(chatId);
  }

  /* ---- Completar transacción ---- */
  async function finishTransaction(chatId, userId, accountId) {
    const s = sessions.get(chatId);
    if (!s) return;
    try {
      const tx = await dataStore.addTransaction(supabaseAdmin, userId, {
        type: s.type, amount: s.amount,
        category: s.category, description: s.description, accountId
      });
      const { data: accRow, error } = await supabaseAdmin.from('accounts').select('*').eq('id', accountId).eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      const verbo = s.type === 'ingreso' ? '💰 Ingreso registrado' : '💸 Gasto registrado';
      await bot.sendMessage(chatId,
        `${verbo}: *${fmt(tx.amount)}* · ${tx.category}\n` +
        `Cuenta: ${accRow.name} → ${accRow.type === 'tarjeta' ? 'Deuda' : 'Saldo'}: ${fmt(accRow.balance)}`,
        { parse_mode: 'Markdown' }
      );
    } catch (e) {
      await bot.sendMessage(chatId, `❌ ${e.message}`);
    }
    sessions.delete(chatId);
    await sendMenu(chatId);
  }

  async function chooseAccountOrFinish(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    if (store.accounts.length === 0) {
      await sendMenu(chatId, '❌ No tienes cuentas. Créalas desde la app web.');
      sessions.delete(chatId);
      return;
    }
    if (store.accounts.length === 1) {
      await finishTransaction(chatId, userId, store.accounts[0].id);
      return;
    }
    const s = sessions.get(chatId);
    const keyboard = store.accounts.map(a => ([{
      text: `${a.type === 'ahorro' ? '💰' : '💳'} ${a.name} (${fmt(a.balance)})`,
      callback_data: `acc:${a.id}`
    }]));
    keyboard.push([{ text: '❌ Cancelar', callback_data: 'wiz:cancel' }]);
    await bot.sendMessage(chatId,
      `¿En qué cuenta registro ${s.type === 'gasto' ? 'este gasto' : 'este ingreso'} de *${fmt(s.amount)}*?`,
      { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
    );
  }

  /* ---- Asistente paso a paso ---- */
  async function startWizard(chatId, type) {
    sessions.set(chatId, { step: 'amount', type });
    await bot.sendMessage(chatId,
      type === 'gasto'
        ? '💸 ¿Cuánto gastaste? (ej: 25)'
        : '💰 ¿Cuánto recibiste? (ej: 1500)',
      { reply_markup: { inline_keyboard: [[{ text: '❌ Cancelar', callback_data: 'wiz:cancel' }]] } }
    );
  }

  async function askCategory(chatId, userId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    const s = sessions.get(chatId);
    s.step = 'category';
    s.categoriesShown = store.categories;
    const rows = [];
    store.categories.forEach((c, i) => {
      const last = rows[rows.length - 1];
      if (!last || last.length >= 2) rows.push([]);
      rows[rows.length - 1].push({ text: c, callback_data: `cat:${i}` });
    });
    rows.push([{ text: '✏️ Otra...', callback_data: 'cat:other' }]);
    rows.push([{ text: '❌ Cancelar', callback_data: 'wiz:cancel' }]);
    await bot.sendMessage(chatId, '¿En qué categoría?', { reply_markup: { inline_keyboard: rows } });
  }

  async function askDescription(chatId) {
    const s = sessions.get(chatId);
    s.step = 'description';
    await bot.sendMessage(chatId,
      '¿Alguna descripción? Escribe lo que quieras o toca Omitir.',
      { reply_markup: { inline_keyboard: [[{ text: 'Omitir', callback_data: 'desc:skip' }], [{ text: '❌ Cancelar', callback_data: 'wiz:cancel' }]] } }
    );
  }

  /* ---- Formato rápido (una línea) ---- */
  async function handleQuickTx(chatId, userId, match) {
    const type = match[1].toLowerCase() === 'gasto' ? 'gasto' : 'ingreso';
    const amount = parseAmount(match[2]);
    const category = sanitizeString(match[3]);
    const description = sanitizeString((match[4] || '').trim());
    if (!amount || amount <= 0) {
      await bot.sendMessage(chatId, '❌ No entendí el monto. Ejemplo: `gasto 25 comida Almuerzo`', { parse_mode: 'Markdown' });
      return;
    }
    sessions.set(chatId, { type, amount, category, description, step: 'ready' });
    await chooseAccountOrFinish(chatId, userId);
  }

  /* ---- Callbacks inline ---- */
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data || '';
    if (isRateLimited(chatId)) { await bot.answerCallbackQuery(query.id).catch(() => {}); return; }
    await bot.answerCallbackQuery(query.id);

    const userId = await resolveUser(chatId);
    if (!userId) { await promptLink(chatId); return; }

    // Menú principal
    if (data === 'menu:gasto')          { await startWizard(chatId, 'gasto'); return; }
    if (data === 'menu:ingreso')        { await startWizard(chatId, 'ingreso'); return; }
    if (data === 'menu:resumen')        { await handleMenuResumen(chatId, userId); return; }
    if (data === 'menu:cuentas')        { await handleMenuBilletera(chatId, userId); return; }
    if (data === 'menu:billetera')      { await handleMenuBilletera(chatId, userId); return; }
    if (data === 'menu:calendario')     { await handleMenuCalendario(chatId, userId); return; }
    if (data === 'menu:chanchitos')     { await handleMenuChanchitos(chatId, userId); return; }
    if (data === 'menu:compromisos')    { await handleMenuCompromisos(chatId, userId); return; }
    if (data === 'menu:notificaciones') { await handleMenuNotificaciones(chatId, userId); return; }
    if (data === 'menu:back')           { await sendMenu(chatId); return; }
    if (data === 'notif:on' || data === 'notif:off') {
      await dataStore.updateSettings(supabaseAdmin, userId, { telegramNotifications: data === 'notif:on' });
      await handleMenuNotificaciones(chatId, userId);
      return;
    }

    // Asistente
    if (data === 'wiz:gasto')   { await startWizard(chatId, 'gasto'); return; }
    if (data === 'wiz:ingreso') { await startWizard(chatId, 'ingreso'); return; }
    if (data === 'wiz:cancel') {
      sessions.delete(chatId);
      await sendMenu(chatId, 'Cancelado. ¿Qué más necesitas?');
      return;
    }
    if (data === 'desc:skip') {
      const s = sessions.get(chatId);
      if (!s) return;
      s.description = '';
      s.step = 'ready';
      await chooseAccountOrFinish(chatId, userId);
      return;
    }
    if (data.startsWith('cat:')) {
      const s = sessions.get(chatId);
      if (!s) return;
      const raw = data.slice(4);
      if (raw === 'other') {
        s.step = 'category_custom';
        await bot.sendMessage(chatId, 'Escribe el nombre de la categoría:');
        return;
      }
      s.category = (s.categoriesShown && s.categoriesShown[Number(raw)]) || 'Otros';
      await askDescription(chatId);
      return;
    }
    if (data.startsWith('acc:')) {
      await finishTransaction(chatId, userId, data.slice(4));
      return;
    }
  });

  /* ---- Comandos ---- */
  // Envuelve bot.onText para que todo comando /slash pase por el mismo límite de
  // tasa que ya aplica a mensajes libres y botones (ver isRateLimited arriba).
  function onTextLimited(regex, handler) {
    bot.onText(regex, async (msg, match) => {
      if (isRateLimited(msg.chat.id)) return;
      return handler(msg, match);
    });
  }

  onTextLimited(/^\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = await resolveUser(chatId);
    if (!userId) {
      await bot.sendMessage(chatId,
        '👋 ¡Bienvenido a *NUVA*!\n\nPara empezar, vincula este chat con tu cuenta:',
        { parse_mode: 'Markdown' }
      );
      await promptLink(chatId);
      return;
    }
    await sendMenu(chatId, '👋 ¡Hola! ¿Qué quieres hacer hoy?');
  });

  onTextLimited(/^\/menu/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = await resolveUser(chatId);
    if (!userId) { await promptLink(chatId); return; }
    await sendMenu(chatId);
  });

  onTextLimited(/^\/gasto\s*$/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await startWizard(msg.chat.id, 'gasto');
  });

  onTextLimited(/^\/ingreso\s*$/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await startWizard(msg.chat.id, 'ingreso');
  });

  onTextLimited(/^\/cancelar/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = await resolveUser(chatId);
    if (!userId) { await promptLink(chatId); return; }
    sessions.delete(chatId);
    await sendMenu(chatId, 'Cancelado. ¿Qué más necesitas?');
  });

  onTextLimited(/^\/resumen/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuResumen(msg.chat.id, userId);
  });

  onTextLimited(/^\/cuentas/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuCuentas(msg.chat.id, userId);
  });

  onTextLimited(/^\/calendario/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuCalendario(msg.chat.id, userId);
  });

  onTextLimited(/^\/chanchitos/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuChanchitos(msg.chat.id, userId);
  });

  onTextLimited(/^\/compromisos/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuCompromisos(msg.chat.id, userId);
  });

  onTextLimited(/^\/billetera/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuBilletera(msg.chat.id, userId);
  });

  onTextLimited(/^\/notificaciones/, async (msg) => {
    const userId = await resolveUser(msg.chat.id);
    if (!userId) { await promptLink(msg.chat.id); return; }
    await handleMenuNotificaciones(msg.chat.id, userId);
  });

  /* ---- Mensajes libres ---- */
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    if (isRateLimited(chatId)) return;
    const text = msg.text.trim();
    const userId = await resolveUser(chatId);

    if (!userId) {
      const codeMatch = text.match(CODE_REGEX);
      if (codeMatch) { await tryLinkWithCode(chatId, codeMatch[1]); return; }
      await promptLink(chatId);
      return;
    }

    // Formato rápido en una línea
    const match = text.match(TX_REGEX);
    if (match) { await handleQuickTx(chatId, userId, match); return; }

    const session = sessions.get(chatId);

    if (session && session.step === 'amount') {
      const amount = parseAmount(text);
      if (!amount || amount <= 0) {
        await bot.sendMessage(chatId, '❌ No entendí el monto. Escribe solo el número, ej: `25`', { parse_mode: 'Markdown' });
        return;
      }
      session.amount = amount;
      await askCategory(chatId, userId);
      return;
    }

    if (session && session.step === 'category_custom') {
      session.category = sanitizeString(text);
      await askDescription(chatId);
      return;
    }

    if (session && session.step === 'description') {
      session.description = (text === '-') ? '' : sanitizeString(text);
      session.step = 'ready';
      await chooseAccountOrFinish(chatId, userId);
      return;
    }

    // Atajos de texto
    const bare = text.toLowerCase();
    if (bare === 'gasto' || bare === 'gastos') { await startWizard(chatId, 'gasto'); return; }
    if (bare === 'ingreso' || bare === 'ingresos') { await startWizard(chatId, 'ingreso'); return; }
    if (bare === 'resumen') { await handleMenuResumen(chatId, userId); return; }
    if (bare === 'chanchito' || bare === 'chanchitos') { await handleMenuChanchitos(chatId, userId); return; }
    if (bare === 'compromisos') { await handleMenuCompromisos(chatId, userId); return; }
    if (bare === 'billetera' || bare === 'cuentas') { await handleMenuBilletera(chatId, userId); return; }
    if (bare === 'notificaciones') { await handleMenuNotificaciones(chatId, userId); return; }

    // Cualquier otro texto → mostrar menú
    await sendMenu(chatId, '¿Qué quieres hacer?');
  });

  console.log('  Bot de Telegram conectado y escuchando mensajes (multiusuario).');
  return bot;
}

module.exports = { start };

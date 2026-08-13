'use strict';
require('./env');

const os = require('os');
const fs = require('fs');
const { execFile } = require('child_process');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const db = require('./db');
const finance = require('./finance');
const { isPackaged, PUBLIC_DIR, ENV_FILE } = require('./paths');
const { requireAuth, supabaseAdmin } = require('./auth');
const dataStore = require('./dataStore');
const { userClient } = require('./supabaseClient');
const telegramLink = require('./telegramLink');
const { sanitizeInputMiddleware } = require('./sanitize');

const app = express();
const PORT = process.env.PORT || 4173;

// Railway/Render ponen la app detrás de un proxy inverso que agrega X-Forwarded-For;
// sin esto, express-rate-limit no puede identificar la IP real del cliente y lanza un
// error de validación en cada request. En local no hay proxy, pero confiar en el primer
// hop es inofensivo ahí también (no hay X-Forwarded-For que falsificar sin acceso a la red).
app.set('trust proxy', 1);

let activeBot = null;

// Fase 7: en producción, frontend (Vercel) y backend (Railway/Render) viven en
// dominios distintos, así que las peticiones del navegador son cross-origin. No
// usamos cookies de sesión (el JWT de Supabase va en el header Authorization), así
// que no hace falta `credentials: true` — solo restringir qué origen puede llamar.
// ALLOWED_ORIGIN acepta una o varias URLs separadas por coma; vacío = permitir todo
// (cómodo para desarrollo local, donde de todos modos front y back comparten origen).
const allowedOrigins = (process.env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: allowedOrigins.length ? allowedOrigins : true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(sanitizeInputMiddleware);
app.use(express.static(PUBLIC_DIR));

// Fase 6: límite general sobre toda la API pública — por IP, generoso para uso
// normal de la app (varias pestañas, refresco automático) pero corta un abuso claro.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes, intenta de nuevo en unos minutos.' }
});
app.use('/api', apiLimiter);

// Límite más estricto para generar códigos de vinculación de Telegram: no hay
// motivo legítimo para pedir muchos en poco tiempo, y limitarlo dificulta que
// alguien intente adivinar/forzar códigos ajenos generando volumen.
const linkCodeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId, // esta ruta siempre corre después de requireAuth
  message: { error: 'Demasiados códigos generados, espera unos minutos e intenta de nuevo.' }
});

// Config pública (no lleva secretos: la anon key de Supabase está diseñada
// para ser visible en el cliente, el RLS es la protección real) — el frontend
// la pide antes de poder iniciar sesión.
app.get('/api/config', (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL || null,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY || null,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || null
  });
});

function withStore(res, fn) {
  try {
    const store = db.getStore();
    const result = fn(store);
    db.save();
    res.json(result === undefined ? { ok: true } : result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

// Fase 3: equivalente async de withStore(), para las rutas ya migradas a Postgres.
// req.accessToken lo deja requireAuth — arma un cliente por-request con el JWT del
// usuario, así que además del filtro user_id explícito en dataStore.js, el propio
// RLS de Postgres es una segunda barrera si algo se filtrara sin querer.
async function withUserData(req, res, fn) {
  try {
    const sb = userClient(req.accessToken);
    const result = await fn(sb, req.userId);
    res.json(result === undefined ? { ok: true } : result);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
}

/* ---------------- State ---------------- */
app.get('/api/state', requireAuth, async (req, res) => {
  try {
    const sb = userClient(req.accessToken);
    res.json(await dataStore.loadUserStore(sb, req.userId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

/* ---------------- Settings ---------------- */
app.get('/api/settings', requireAuth, (req, res) => {
  withUserData(req, res, async (sb) => (await dataStore.loadUserStore(sb)).settings);
});
app.put('/api/settings', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateSettings(sb, userId, req.body));
});

app.get('/api/summary', requireAuth, (req, res) => {
  withUserData(req, res, async (sb) => finance.computeTotals(await dataStore.loadUserStore(sb)));
});

/* ---------------- Accounts ---------------- */
app.post('/api/accounts', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addAccount(sb, userId, req.body));
});
app.put('/api/accounts/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateAccount(sb, userId, req.params.id, req.body));
});
app.delete('/api/accounts/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteAccount(sb, userId, req.params.id));
});

/* ---------------- Transactions ---------------- */
app.post('/api/transactions', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addTransaction(sb, userId, req.body));
});
app.put('/api/transactions/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateTransaction(sb, userId, req.params.id, req.body));
});
app.delete('/api/transactions/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteTransaction(sb, userId, req.params.id));
});

/* ---------------- Pockets ---------------- */
app.post('/api/pockets', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addPocket(sb, userId, req.body));
});
app.put('/api/pockets/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updatePocket(sb, userId, req.params.id, req.body));
});
app.delete('/api/pockets/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deletePocket(sb, userId, req.params.id));
});
app.post('/api/pockets/:id/move', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.movePocket(sb, userId, req.params.id, req.body.direction, req.body.amount, { date: req.body.date, note: req.body.note }));
});
app.delete('/api/pockets/:id/contributions/:cid', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deletePocketContribution(sb, userId, req.params.id, req.params.cid));
});

/* ---------------- Credit card payments ---------------- */
app.post('/api/card-payments', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.payCard(sb, userId, req.body));
});
app.delete('/api/card-payments/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteCardPayment(sb, userId, req.params.id));
});

/* ---------------- Categories ---------------- */
app.post('/api/categories', requireAuth, (req, res) => {
  withUserData(req, res, async (sb, userId) => ({ category: await dataStore.addCategory(sb, userId, req.body.name) }));
});

/* ---------------- Monthly savings goal ---------------- */
app.get('/api/goal', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.getMonthProgress(sb, userId));
});
app.put('/api/goal', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.setMonthlyGoal(sb, userId, req.body.amount));
});

/* ---------------- Reminders (calendario de pagos) ---------------- */
app.post('/api/reminders', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addReminder(sb, userId, req.body));
});
app.put('/api/reminders/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateReminder(sb, userId, req.params.id, req.body));
});
app.delete('/api/reminders/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteReminder(sb, userId, req.params.id));
});
app.post('/api/reminders/:id/pay', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.payInstallment(sb, userId, req.params.id, req.body.accountId || null));
});

/* ---------------- Deudas / compromisos ---------------- */
app.post('/api/deudas', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addDeuda(sb, userId, req.body));
});
app.put('/api/deudas/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateDeuda(sb, userId, req.params.id, req.body));
});
app.delete('/api/deudas/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteDeuda(sb, userId, req.params.id));
});
app.post('/api/deudas/:id/pay', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.payDeuda(sb, userId, req.params.id, req.body));
});
app.delete('/api/deuda-payments/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.unPayDeuda(sb, userId, req.params.id));
});

/* ---------------- Préstamos entre personas ---------------- */
app.post('/api/personloans', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addPersonLoan(sb, userId, req.body));
});
app.put('/api/personloans/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updatePersonLoan(sb, userId, req.params.id, req.body));
});
app.delete('/api/personloans/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deletePersonLoan(sb, userId, req.params.id));
});
app.post('/api/personloans/:id/settle', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.settlePersonLoan(sb, userId, req.params.id, req.body));
});

/* ---------------- Compras en cuotas de tarjeta ---------------- */
app.post('/api/cardcharges', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.addCardCharge(sb, userId, req.body));
});
app.delete('/api/cardcharges/:id', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.deleteCardCharge(sb, userId, req.params.id));
});
app.post('/api/cardcharges/:id/mark', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.markCardChargeInstallment(sb, userId, req.params.id));
});

/* ---------------- Asistente de primera configuración ---------------- */
app.put('/api/profile', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.updateProfile(sb, userId, req.body));
});

app.post('/api/setup/complete', requireAuth, (req, res) => {
  withUserData(req, res, (sb, userId) => dataStore.completeSetup(sb, userId));
});

// Reemplaza todo el store por un data.json importado (backup/config de otra instalación).
app.post('/api/setup/import', (req, res) => {
  try {
    const incoming = finance.normalizeStore(req.body || {});
    incoming.setupCompleted = true;
    db.replaceStore(incoming);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

function writeEnvToken(token) {
  let lines = [];
  if (fs.existsSync(ENV_FILE)) {
    lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  }
  let found = false;
  lines = lines.map(line => {
    if (/^\s*TELEGRAM_BOT_TOKEN\s*=/.test(line)) {
      found = true;
      return `TELEGRAM_BOT_TOKEN=${token}`;
    }
    return line;
  });
  if (!found) lines.push(`TELEGRAM_BOT_TOKEN=${token}`);
  fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
}

app.post('/api/setup/telegram', async (req, res) => {
  const token = (req.body && req.body.token || '').trim();
  if (!token) return res.status(400).json({ error: 'Falta el token del bot' });
  try {
    writeEnvToken(token);
    process.env.TELEGRAM_BOT_TOKEN = token;
    if (activeBot) { try { await activeBot.stopPolling(); } catch (e) {} }
    activeBot = require('./bot').start(token);
    startReminderScheduler(activeBot);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'No se pudo iniciar el bot: ' + e.message });
  }
});

app.get('/api/setup/telegram-status', (req, res) => {
  const store = db.getStore();
  res.json({ configured: !!process.env.TELEGRAM_BOT_TOKEN, running: !!activeBot, linked: !!store.ownerChatId });
});

/* ---------------- Fase 4: vinculación del bot compartido con la cuenta del usuario ----------------
 * El bot de Telegram es uno solo para todos los usuarios (no un token por persona). Un
 * usuario logueado en la web pide un código de 6 dígitos, válido 10 minutos y de un solo
 * uso, y lo escribe en el chat del bot para vincular su chat_id a su user_id. */
app.post('/api/telegram/link-code', requireAuth, linkCodeLimiter, async (req, res) => {
  try {
    res.json(await telegramLink.generateLinkCode(req.userId));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.get('/api/telegram/link-status', requireAuth, async (req, res) => {
  try {
    res.json({ linked: await telegramLink.isLinked(req.userId) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
app.delete('/api/telegram/link', requireAuth, async (req, res) => {
  try {
    await telegramLink.unlink(req.userId);
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/network-info', (req, res) => {
  res.json({ port: PORT, ips: localIps() });
});

function localIps() {
  const nets = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  NUVA corriendo');
  console.log('  --------------------------------');
  console.log(`  En este computador: http://localhost:${PORT}`);
  localIps().forEach(ip => console.log(`  Desde tu celular (misma WiFi): http://${ip}:${PORT}`));
  console.log('  --------------------------------');
  console.log(`  Datos guardados en: ${db.DATA_FILE}`);
  console.log('');

  // Solo al correr como .exe instalado: al no haber terminal visible para el usuario,
  // abrir el navegador es la única forma de que "abrir la app" lleve a algo.
  if (isPackaged) {
    execFile('cmd', ['/c', 'start', '', `http://localhost:${PORT}`], () => {});
  }

  if (process.env.TELEGRAM_BOT_TOKEN) {
    try {
      activeBot = require('./bot').start(process.env.TELEGRAM_BOT_TOKEN);
      startReminderScheduler(activeBot);
    } catch (e) {
      console.error('No se pudo iniciar el bot de Telegram:', e.message);
    }
  } else {
    console.log('  (Bot de Telegram desactivado: falta TELEGRAM_BOT_TOKEN en .env, o pendiente del asistente de configuración)');
  }

  // Detener polling limpiamente al cerrar el servidor
  function shutdown() {
    if (activeBot) {
      console.log('  Cerrando bot de Telegram...');
      activeBot.stopPolling().finally(() => process.exit(0));
    } else {
      process.exit(0);
    }
    setTimeout(() => process.exit(0), 3000);
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
});

/* ---------------- Recordatorios de pago: revisión periódica (Fase 4: multiusuario) ----------------
 * Recorre todos los chats vinculados (telegram_links) y revisa cada uno con su propio
 * user_id — nunca un solo store global. Usa supabaseAdmin (service_role), así que
 * dataStore.loadUserStore ya filtra todo por user_id explícito (ver dataStore.js). */
function startReminderScheduler(bot) {
  async function tickForUser(userId, chatId) {
    const store = await dataStore.loadUserStore(supabaseAdmin, userId);
    if (!store.settings || store.settings.telegramNotifications === false) return;

    const now = new Date();
    const today = now.getDate();
    const monthKey = finance.currentYYYYMM();
    const notifyBefore = store.settings.notifyDaysBefore || 2;
    const msgs = [];

    // Reminders (cuotas / pagos programados)
    const due = finance.checkDueReminders(store, now);
    for (const { reminder, kind } of due) {
      const acc = reminder.accountId ? store.accounts.find(a => a.id === reminder.accountId) : null;
      const montoTxt = reminder.amount ? ` de ${finance.formatMoney(reminder.amount)}` : '';
      const cuentaTxt = acc ? ` (${acc.name})` : '';
      msgs.push(kind === 'due'
        ? `🔔 Hoy vence: *${reminder.name}*${montoTxt}${cuentaTxt}`
        : `📅 Recordatorio: *${reminder.name}*${montoTxt}${cuentaTxt} vence en ${reminder.notifyDaysBefore} día(s).`);
      await dataStore.markReminderNotified(supabaseAdmin, userId, reminder.id, {
        notifiedDueFor: reminder.notifiedDueFor, notifiedBeforeFor: reminder.notifiedBeforeFor
      });
    }

    // Deudas mensuales
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const paidDeudaIds = new Set((store.deudaPayments || []).filter(p => p.month === monthKey).map(p => p.deudaId));
    (store.deudas || []).forEach(d => {
      if (paidDeudaIds.has(d.id)) return;
      const effDay = Math.min(d.dueDay, daysInMonth);
      const diff = effDay - today;
      if (diff === 0) msgs.push(`🔔 Hoy vence compromiso: *${d.name}*${d.amount ? ' · ' + finance.formatMoney(d.amount) : ''}`);
      else if (diff === notifyBefore && notifyBefore > 0) msgs.push(`📅 En ${diff} día(s) vence: *${d.name}*${d.amount ? ' · ' + finance.formatMoney(d.amount) : ''}`);
    });

    // Tarjetas: día de pago
    store.accounts.filter(a => a.type === 'tarjeta' && a.billingDay).forEach(card => {
      const effDay = Math.min(card.billingDay, daysInMonth);
      const diff = effDay - today;
      if (diff === 0) msgs.push(`💳 Hoy es el día de pago de tu tarjeta *${card.name}* (deuda: ${finance.formatMoney(card.balance)})`);
      else if (diff === notifyBefore && notifyBefore > 0) msgs.push(`💳 En ${diff} día(s): pago de tarjeta *${card.name}* (deuda: ${finance.formatMoney(card.balance)})`);
    });

    // Préstamos entre personas: por vencer, vencido hoy, o atrasado (reavisa 1x/día)
    const personLoansDue = finance.checkPersonLoansDue(store, notifyBefore, now);
    for (const { loan, kind, daysOverdue } of personLoansDue) {
      const accion = loan.direction === 'debo' ? 'pagarle a' : 'cobrarle a';
      const monto = finance.formatMoney(loan.amount);
      if (kind === 'due') msgs.push(`🤝 Hoy toca ${accion} *${loan.personName}* · ${monto}`);
      else if (kind === 'soon') msgs.push(`🤝 En ${notifyBefore} día(s) toca ${accion} *${loan.personName}* · ${monto}`);
      else msgs.push(`🤝 Se te pasó ${accion} *${loan.personName}* (${daysOverdue} día(s) de atraso) · ${monto}`);
      await dataStore.markPersonLoanNotified(supabaseAdmin, userId, loan.id, {
        notifiedDue: loan.notifiedDue, notifiedSoon: loan.notifiedSoon, lastOverdueNotify: loan.lastOverdueNotify
      });
    }

    // Metas de ahorro (chanchitos) atrasadas este mes
    const behindPockets = finance.checkPocketsBehind(store, now);
    for (const { pocket, saved } of behindPockets) {
      const restante = Math.max(0, pocket.monthlyTarget - saved);
      msgs.push(`🐷 Vas atrasado en tu meta *${pocket.name}* de este mes — llevas ${finance.formatMoney(saved)} de ${finance.formatMoney(pocket.monthlyTarget)}. Te faltan ${finance.formatMoney(restante)}.`);
      await dataStore.markPocketNotified(supabaseAdmin, userId, pocket.id, pocket.lastNotifiedMonth);
    }

    if (msgs.length === 0) return;
    const text = msgs.join('\n');
    try { await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' }); } catch (e) { console.error(`No se pudo enviar recordatorio a chat ${chatId}:`, e.message); }
  }

  async function tick() {
    const links = await telegramLink.getAllLinkedUsers();
    for (const link of links) {
      try { await tickForUser(link.user_id, link.chat_id); }
      catch (e) { console.error(`Error revisando recordatorios de user ${link.user_id}:`, e.message); }
    }
  }
  tick().catch(e => console.error('Error revisando recordatorios:', e.message));
  setInterval(() => tick().catch(e => console.error('Error revisando recordatorios:', e.message)), 60 * 60 * 1000);
}

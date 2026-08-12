'use strict';
/*
 * Vinculación chat de Telegram ↔ usuario (Fase 4).
 *
 * telegram_link_codes y telegram_links no tienen política RLS para el rol
 * "authenticated" (ver supabase/schema.sql) — a propósito, para que ni el propio
 * dueño del código pueda leer/escribir esta tabla directo desde el navegador.
 * Por eso todo acá usa supabaseAdmin (service_role), nunca el cliente por-usuario.
 */
const { supabaseAdmin } = require('./auth');

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutos
const CODE_LEN = 6;

function must(error, msg) { if (error) throw new Error(msg || error.message); }

function randomCode() {
  let s = '';
  for (let i = 0; i < CODE_LEN; i++) s += Math.floor(Math.random() * 10);
  return s;
}

async function generateLinkCode(userId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();

  // Reintenta unas pocas veces por si el código de 6 dígitos ya existe (choque de PK).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    const { error } = await supabaseAdmin.from('telegram_link_codes').insert({
      code, user_id: userId, expires_at: expiresAt
    });
    if (!error) return { code, expiresAt };
    if (error.code !== '23505') must(error); // 23505 = unique_violation, cualquier otro error es real
  }
  throw new Error('No se pudo generar el código, intenta de nuevo.');
}

async function consumeLinkCode(code, chatId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data: row, error: e0 } = await supabaseAdmin
    .from('telegram_link_codes').select('*').eq('code', String(code)).maybeSingle();
  must(e0);
  if (!row) throw new Error('Código inválido.');
  if (row.used_at) throw new Error('Este código ya fue usado. Genera uno nuevo desde la app.');
  if (new Date(row.expires_at).getTime() < Date.now()) throw new Error('Este código venció. Genera uno nuevo desde la app.');

  const { error: e1 } = await supabaseAdmin.from('telegram_link_codes')
    .update({ used_at: new Date().toISOString() }).eq('code', String(code));
  must(e1);

  // Un chat_id solo puede apuntar a un usuario a la vez: si este chat ya estaba
  // vinculado a otra cuenta (ej. se reusa el mismo Telegram), se libera esa fila
  // antes de crear la nueva, porque chat_id es unique en telegram_links.
  const { error: e2 } = await supabaseAdmin.from('telegram_links').delete().eq('chat_id', chatId);
  must(e2);
  const { error: e3 } = await supabaseAdmin.from('telegram_links').upsert({
    user_id: row.user_id, chat_id: chatId, linked_at: new Date().toISOString()
  }, { onConflict: 'user_id' });
  must(e3);

  return row.user_id;
}

async function getLinkedUserId(chatId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data, error } = await supabaseAdmin.from('telegram_links').select('user_id').eq('chat_id', chatId).maybeSingle();
  must(error);
  return data ? data.user_id : null;
}

async function getAllLinkedUsers() {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data, error } = await supabaseAdmin.from('telegram_links').select('user_id, chat_id');
  must(error);
  return data;
}

async function unlink(userId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { error } = await supabaseAdmin.from('telegram_links').delete().eq('user_id', userId);
  must(error);
}

async function isLinked(userId) {
  if (!supabaseAdmin) throw new Error('Supabase no está configurado en el servidor.');
  const { data, error } = await supabaseAdmin.from('telegram_links').select('chat_id').eq('user_id', userId).maybeSingle();
  must(error);
  return !!data;
}

module.exports = { generateLinkCode, consumeLinkCode, getLinkedUserId, getAllLinkedUsers, unlink, isLinked };

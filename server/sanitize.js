'use strict';
/*
 * Fase 6 — saneado básico de texto libre antes de guardarlo.
 *
 * No es validación de negocio (eso lo sigue haciendo finance.js) — es solo una
 * red de seguridad genérica: quita caracteres de control (que no deberían llegar
 * nunca desde un formulario/chat normal, pero sí podrían venir de un cliente
 * hecho a mano) y evita que un campo de texto libre crezca sin límite.
 */
const MAX_LEN = 500;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;

function sanitizeString(s) {
  return s.replace(CONTROL_CHARS, '').slice(0, MAX_LEN);
}

function sanitizeValue(v) {
  if (typeof v === 'string') return sanitizeString(v);
  if (Array.isArray(v)) return v.map(sanitizeValue);
  if (v && typeof v === 'object') return sanitizeBody(v);
  return v;
}

function sanitizeBody(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const key of Object.keys(obj)) out[key] = sanitizeValue(obj[key]);
  return out;
}

// Middleware Express: sanea req.body en el sitio antes de que llegue a cualquier ruta.
function sanitizeInputMiddleware(req, res, next) {
  if (req.body && typeof req.body === 'object') req.body = sanitizeBody(req.body);
  next();
}

module.exports = { sanitizeString, sanitizeValue, sanitizeBody, sanitizeInputMiddleware };

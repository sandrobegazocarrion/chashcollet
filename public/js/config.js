'use strict';
/*
 * Fase 7 — de dónde saca el frontend la URL del backend.
 *
 * En desarrollo local, frontend y backend corren en el mismo origen (mismo puerto
 * de Express sirviendo public/), así que apiBase se deja vacío y las rutas relativas
 * ("/api/...") funcionan solas. En producción, el frontend vive en Vercel y el
 * backend en Railway — dominios distintos — así que ahí se necesita la URL pública
 * del backend. Detectamos el caso local por hostname para no tener que editar este
 * archivo cada vez que se prueba en la PC vs. en Vercel.
 */
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
window.NUVA_CONFIG = {
  apiBase: isLocal ? '' : 'https://chashcollet-production.up.railway.app'
};

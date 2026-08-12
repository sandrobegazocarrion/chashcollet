'use strict';
/*
 * Fase 7 — de dónde saca el frontend la URL del backend.
 *
 * En desarrollo local, frontend y backend corren en el mismo origen (mismo puerto
 * de Express sirviendo public/), así que apiBase se deja vacío y las rutas relativas
 * ("/api/...") funcionan solas. En producción, el frontend vive en Vercel y el
 * backend en Railway/Render — dominios distintos — así que acá se pone la URL
 * pública del backend. Es el único archivo que hay que tocar al desplegar el
 * frontend a un dominio real; no hay paso de build.
 */
window.NUVA_CONFIG = {
  apiBase: '' // ej. en producción: 'https://nuva-api.up.railway.app' (sin / al final)
};

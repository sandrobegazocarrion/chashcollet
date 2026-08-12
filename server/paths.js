'use strict';
/*
 * Resuelve dónde viven los archivos de datos según el modo de ejecución:
 * - Instalado (el instalador copia un archivo marcador "INSTALLED" junto a server/):
 *   los datos van a %APPDATA%\NUVA, fuera de la carpeta de instalación, para que
 *   sobrevivan a una actualización/desinstalación y no requieran admin.
 * - Desarrollo (node server/server.js dentro del repo, sin el marcador): todo sigue
 *   igual que siempre, dentro del proyecto.
 *
 * public/ siempre se resuelve relativo a este archivo: tanto en desarrollo como en la
 * instalación, server/ y public/ viajan juntos como carpetas hermanas (ya no se compila
 * un único .exe con pkg, así que no hace falta ninguna ruta especial para los estáticos).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const APP_ROOT = path.join(__dirname, '..');
const isPackaged = fs.existsSync(path.join(APP_ROOT, 'INSTALLED'));

const DATA_DIR = isPackaged
  ? path.join(process.env.APPDATA || os.homedir(), 'NUVA')
  : APP_ROOT;

module.exports = {
  isPackaged,
  DATA_DIR,
  PUBLIC_DIR: path.join(APP_ROOT, 'public'),
  DATA_FILE: path.join(DATA_DIR, 'data.json'),
  ENV_FILE: path.join(DATA_DIR, '.env'),
  BACKUP_DIR: path.join(DATA_DIR, 'backups')
};

'use strict';
/*
 * Persistencia local en un archivo JSON (data.json) dentro del proyecto.
 * No usa ningún servicio externo: todo vive en el disco de este computador.
 */

const fs = require('fs');
const path = require('path');
const { emptyStore, normalizeStore } = require('./finance');
const { DATA_DIR, DATA_FILE, BACKUP_DIR } = require('./paths');

const TMP_FILE = DATA_FILE + '.tmp';
const BACKUP_RETENTION_DAYS = 30;

let store;

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    try {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      store = normalizeStore(JSON.parse(raw));
      // normalizeStore puede migrar datos (p.ej. la antigua meta de ahorro a un chanchito);
      // se guarda de una vez para que ese cambio no se pierda ni se repita en el próximo arranque.
      save();
    } catch (e) {
      console.error('No se pudo leer data.json, se crea uno nuevo:', e.message);
      store = emptyStore();
    }
  } else {
    store = emptyStore();
  }
  return store;
}

// Respaldo diario (uno por día, se conservan los últimos BACKUP_RETENTION_DAYS) para
// proteger el registro financiero real del usuario ante un archivo corrupto o borrado
// por error — data.json es la única copia y no hay ningún backend externo detrás.
function backupIfNeeded() {
  if (!fs.existsSync(DATA_FILE)) return;
  const today = new Date().toISOString().slice(0, 10);
  const backupFile = path.join(BACKUP_DIR, `data-${today}.json`);
  if (fs.existsSync(backupFile)) return;
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    fs.copyFileSync(DATA_FILE, backupFile);
    const files = fs.readdirSync(BACKUP_DIR).filter(f => /^data-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
    while (files.length > BACKUP_RETENTION_DAYS) {
      fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
    }
  } catch (e) {
    console.error('No se pudo crear el respaldo diario de data.json:', e.message);
  }
}

function save() {
  backupIfNeeded();
  fs.writeFileSync(TMP_FILE, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(TMP_FILE, DATA_FILE);
}

function getStore() {
  return store;
}

function replaceStore(newStore) {
  store = newStore;
  save();
}

load();

module.exports = { getStore, save, replaceStore, DATA_FILE };

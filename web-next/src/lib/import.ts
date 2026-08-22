// Portado de la sección "Importar" en public/js/app.js (handleImportExcel/Pdf,
// importParseAmount/Date, guessFieldForHeader, parseGenericBankLines, etc.) — misma
// lógica de parseo, XLSX y pdf.js cargados globalmente vía CDN (ver index.html) igual
// que en la app vieja, en vez de instalarlos como dependencia del bundle.

declare global {
  interface Window {
    XLSX?: {
      read: (data: unknown, opts: Record<string, unknown>) => { SheetNames: string[]; Sheets: Record<string, unknown> };
      utils: {
        sheet_to_json: (ws: unknown, opts: Record<string, unknown>) => unknown[][];
        book_new: () => unknown;
        aoa_to_sheet: (rows: unknown[][]) => unknown;
        book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
      };
      SSF?: { parse_date_code: (n: number) => { y: number; m: number; d: number } | null };
      writeFile: (wb: unknown, filename: string) => void;
    };
    pdfjsLib?: {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (opts: { data: ArrayBuffer }) => { promise: Promise<PdfDocument> };
    };
  }
}
interface PdfTextItem {
  str: string;
  transform: number[];
}
interface PdfPage {
  getTextContent: () => Promise<{ items: PdfTextItem[] }>;
}
interface PdfDocument {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
}

export type ImportTxField = 'ignore' | 'date' | 'description' | 'amount' | 'type' | 'category';
export const IMPORT_TX_FIELD_OPTIONS: { v: ImportTxField; label: string }[] = [
  { v: 'ignore', label: 'Ignorar' },
  { v: 'date', label: 'Fecha' },
  { v: 'description', label: 'Descripción' },
  { v: 'amount', label: 'Monto' },
  { v: 'type', label: 'Tipo (ingreso/gasto)' },
  { v: 'category', label: 'Categoría' },
];

export function guessFieldForHeader(h: string): ImportTxField {
  const s = String(h || '').toLowerCase();
  if (/fecha|date/.test(s)) return 'date';
  if (/descrip|concepto|detalle|glosa/.test(s)) return 'description';
  if (/monto|importe|amount|valor/.test(s)) return 'amount';
  if (/^tipo$|type/.test(s)) return 'type';
  if (/categor/.test(s)) return 'category';
  return 'ignore';
}

export type ImportAccountField = 'ignore' | 'name' | 'balance' | 'type';
export const IMPORT_ACCOUNT_FIELD_OPTIONS: { v: ImportAccountField; label: string }[] = [
  { v: 'ignore', label: 'Ignorar' },
  { v: 'name', label: 'Nombre de la cuenta' },
  { v: 'balance', label: 'Saldo' },
  { v: 'type', label: 'Tipo de cuenta' },
];

export function guessFieldForAccountHeader(h: string): ImportAccountField {
  const s = String(h || '').toLowerCase();
  if (/nombre|cuenta/.test(s)) return 'name';
  if (/saldo|monto|balance/.test(s)) return 'balance';
  if (/^tipo$|tipo de cuenta/.test(s)) return 'type';
  return 'ignore';
}

export function guessAccountType(text: string): 'ahorro' | 'corriente' | 'efectivo' | 'tarjeta' {
  const s = String(text || '').toLowerCase();
  if (/tarjeta|cr[eé]dito/.test(s)) return 'tarjeta';
  if (/efectivo|cash|caja/.test(s)) return 'efectivo';
  if (/corriente/.test(s)) return 'corriente';
  return 'ahorro';
}

// Perú usa punto decimal y coma de miles — se quitan las comas y símbolos, y se
// detectan negativos con "-" o entre paréntesis (formato contable: "(150.00)" = -150).
export function importParseAmount(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return raw;
  let s = String(raw).trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (/^-/.test(s)) neg = true;
  s = s
    .replace(/[^\d.,-]/g, '')
    .replace(/^-/, '')
    .replace(/,/g, '');
  const n = parseFloat(s);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

export function importParseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const ssf = window.XLSX?.SSF;
    if (!ssf) return null;
    const d = ssf.parse_date_code(raw);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null;
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  // dd/mm/yyyy — Perú usa día primero, no formato estadounidense mm/dd.
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const [, d, mo] = m;
    let y = m[3];
    if (y.length === 2) y = (Number(y) < 50 ? '20' : '19') + y;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return null;
}

function importNormalizeType(raw: string, amount: number | null): 'ingreso' | 'gasto' {
  const s = String(raw || '').toLowerCase();
  if (/ingreso|abono|cr[eé]dito|dep[oó]sito|\bdep\b/.test(s)) return 'ingreso';
  if (/gasto|cargo|d[eé]bito|retiro|compra/.test(s)) return 'gasto';
  if (amount != null) return amount < 0 ? 'gasto' : 'ingreso';
  return 'gasto';
}

export interface RawTxCandidate {
  date: string;
  description: string;
  amount: number | null;
  type: string;
  category: string;
}
export interface TxCandidate {
  date: string;
  description: string;
  amount: number | null;
  type: 'ingreso' | 'gasto';
  category: string;
}

export function importNormalizeCandidate(raw: RawTxCandidate): TxCandidate {
  return {
    date: raw.date || '',
    description: String(raw.description || '').trim().slice(0, 300),
    amount: raw.amount == null ? null : Math.abs(raw.amount),
    type: importNormalizeType(raw.type, raw.amount),
    category: raw.category || 'Otros',
  };
}

const IMPORT_DATE_RE = /(\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/;
const IMPORT_AMOUNT_RE = /-?\(?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})\)?/g;

// Extracción genérica (sin reglas por banco): busca en cada línea una fecha y un
// monto; lo que sobra de la línea es la descripción. Best-effort a propósito — por
// eso el paso siguiente siempre es una tabla editable, nunca un import directo.
export function parseGenericBankLines(lines: string[]): RawTxCandidate[] {
  const out: RawTxCandidate[] = [];
  lines.forEach((line) => {
    const dateMatch = line.match(IMPORT_DATE_RE);
    if (!dateMatch) return;
    const withoutDate = line.replace(dateMatch[0], ' ');
    const amounts = withoutDate.match(IMPORT_AMOUNT_RE);
    if (!amounts || !amounts.length) return;
    let desc = withoutDate;
    amounts.forEach((a) => {
      desc = desc.replace(a, ' ');
    });
    desc = desc.replace(/\s+/g, ' ').trim();
    const amount = importParseAmount(amounts[0]);
    if (amount === null || amount === 0) return;
    out.push({ date: importParseDate(dateMatch[0]) || '', description: desc, amount, type: '', category: '' });
  });
  return out;
}

export interface ParsedSheet {
  headers: string[];
  rows: unknown[][];
}

export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  if (!window.XLSX) throw new Error('Librería Excel no disponible (revisa tu conexión).');
  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const wb = isCsv
    ? window.XLSX.read(await file.text(), { type: 'string' })
    : window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }) as unknown[][];
  if (!rows.length) throw new Error('El archivo está vacío.');
  const headerRow = rows[0].map((h) => String(h == null ? '' : h).trim());
  const dataRows = rows.slice(1).filter((r) => r.some((c) => c !== '' && c !== null && c !== undefined));
  if (!dataRows.length) throw new Error('No se encontraron filas de datos debajo del encabezado.');
  return { headers: headerRow, rows: dataRows };
}

export async function parsePdfFile(file: File): Promise<RawTxCandidate[]> {
  if (!window.pdfjsLib) throw new Error('No se pudo cargar el lector de PDF (revisa tu conexión).');
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/legacy/build/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
  const lines: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const byY = new Map<number, PdfTextItem[]>();
    content.items.forEach((it) => {
      const y = Math.round(it.transform[5]);
      if (!byY.has(y)) byY.set(y, []);
      byY.get(y)!.push(it);
    });
    Array.from(byY.entries())
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => {
        const line = items
          .sort((a, b) => a.transform[4] - b.transform[4])
          .map((it) => it.str)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (line) lines.push(line);
      });
  }
  const candidates = parseGenericBankLines(lines);
  if (!candidates.length) {
    throw new Error('No se detectaron movimientos en el PDF. Prueba con un Excel/CSV, o revisa que el PDF tenga texto seleccionable (no una imagen escaneada).');
  }
  return candidates;
}

export interface RawAccountCandidate {
  name: string;
  balance: number | null;
  type: string;
}

export function normalizeAccountCandidate(raw: RawAccountCandidate): RawAccountCandidate & { type: ReturnType<typeof guessAccountType> } {
  return { ...raw, type: guessAccountType(raw.type || raw.name) };
}

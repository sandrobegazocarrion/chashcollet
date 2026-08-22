import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Modal } from '../../components/ui/Modal';
import { Select } from '../../components/ui/Select';
import { GradientButton } from '../../components/ui/GradientButton';
import { IconButton } from '../../components/ui/IconButton';
import { useApiMutation } from '../../hooks/useApiMutation';
import { apiCall } from '../../lib/api';
import {
  IMPORT_ACCOUNT_FIELD_OPTIONS,
  IMPORT_TX_FIELD_OPTIONS,
  guessFieldForAccountHeader,
  guessFieldForHeader,
  importNormalizeCandidate,
  importParseAmount,
  importParseDate,
  normalizeAccountCandidate,
  parseExcelFile,
  parsePdfFile,
  type ImportAccountField,
  type ImportTxField,
  type ParsedSheet,
  type RawAccountCandidate,
  type RawTxCandidate,
  type TxCandidate,
} from '../../lib/import';
import type { AccountType, AppState } from '../../lib/types';

type ImportMode = 'accounts' | 'transactions';
type Step = 'pick' | 'upload' | 'mapping' | 'staging';

const ACC_TYPE_LABEL: Record<AccountType, string> = { ahorro: 'Ahorro', corriente: 'Corriente', efectivo: 'Efectivo', tarjeta: 'Tarjeta' };

interface StagedTxRow extends TxCandidate {
  included: boolean;
}
interface StagedAccountRow {
  name: string;
  type: AccountType;
  balance: number | null;
  included: boolean;
}

// Espeja openImportModal() y el resto del flujo de importación en public/js/app.js:
// elegir qué importar → subir archivo (todo se procesa en el navegador, nunca se
// sube a un servidor) → mapear columnas (Excel/CSV) → revisar en una tabla editable
// → confirmar. El PDF salta el mapeo (extracción genérica por líneas).
export function ImportWizard({ open, onClose, data }: { open: boolean; onClose: () => void; data: AppState }) {
  const [mode, setMode] = useState<ImportMode>('transactions');
  const [step, setStep] = useState<Step>('pick');
  const [accountId, setAccountId] = useState(data.accounts[0]?.id || '');
  const [parsedSheet, setParsedSheet] = useState<ParsedSheet | null>(null);
  const [txMapping, setTxMapping] = useState<Record<number, ImportTxField>>({});
  const [accMapping, setAccMapping] = useState<Record<number, ImportAccountField>>({});
  const [txRows, setTxRows] = useState<StagedTxRow[]>([]);
  const [accRows, setAccRows] = useState<StagedAccountRow[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bulkImport = useApiMutation<{ items: unknown[] }, { imported: number; failed: { index: number; error: string }[] }>('POST', '/api/transactions/bulk');
  const queryClient = useQueryClient();

  function reset() {
    setMode('transactions');
    setStep('pick');
    setParsedSheet(null);
    setTxMapping({});
    setAccMapping({});
    setTxRows([]);
    setAccRows([]);
    setUploadError(null);
    setStageError(null);
    setResult(null);
  }
  function handleClose() {
    reset();
    onClose();
  }

  function pickMode(m: ImportMode) {
    setMode(m);
    setAccountId(data.accounts.find((a) => a.type !== 'tarjeta')?.id || data.accounts[0]?.id || '');
    setStep('upload');
  }

  async function handleFile(file: File) {
    setUploadError(null);
    const name = file.name.toLowerCase();
    try {
      if (name.endsWith('.pdf')) {
        if (mode === 'accounts') throw new Error('Para cuentas y saldos usa un Excel/CSV, no un PDF.');
        const candidates = await parsePdfFile(file);
        setTxRows(candidates.map((c) => ({ ...importNormalizeCandidate(c), included: true })));
        setStep('staging');
      } else if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
        const sheet = await parseExcelFile(file);
        setParsedSheet(sheet);
        if (mode === 'accounts') {
          const guess: Record<number, ImportAccountField> = {};
          sheet.headers.forEach((h, i) => (guess[i] = guessFieldForAccountHeader(h)));
          setAccMapping(guess);
        } else {
          const guess: Record<number, ImportTxField> = {};
          sheet.headers.forEach((h, i) => (guess[i] = guessFieldForHeader(h)));
          setTxMapping(guess);
        }
        setStep('mapping');
      } else {
        throw new Error('Formato no soportado. Usa Excel (.xlsx/.xls), CSV o PDF.');
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'No se pudo leer el archivo.');
    }
  }

  function confirmTxMapping() {
    if (!parsedSheet) return;
    const mapped = Object.values(txMapping);
    if (!mapped.includes('date') || !mapped.includes('amount')) {
      setStageError('Tienes que mapear al menos una columna de Fecha y una de Monto.');
      return;
    }
    setStageError(null);
    const candidates: RawTxCandidate[] = parsedSheet.rows.map((r) => {
      const item: RawTxCandidate = { date: '', description: '', amount: null, type: '', category: '' };
      Object.entries(txMapping).forEach(([colIdx, field]) => {
        if (field === 'ignore') return;
        const raw = r[Number(colIdx)];
        if (field === 'amount') item.amount = importParseAmount(raw);
        else if (field === 'date') item.date = importParseDate(raw) || '';
        else (item as unknown as Record<string, string>)[field] = String(raw == null ? '' : raw).trim();
      });
      return item;
    });
    setTxRows(candidates.map((c) => ({ ...importNormalizeCandidate(c), included: true })));
    setStep('staging');
  }

  function confirmAccMapping() {
    if (!parsedSheet) return;
    const mapped = Object.values(accMapping);
    if (!mapped.includes('name') || !mapped.includes('balance')) {
      setStageError('Tienes que mapear al menos una columna de Nombre y una de Saldo.');
      return;
    }
    setStageError(null);
    const candidates: RawAccountCandidate[] = parsedSheet.rows
      .map((r) => {
        const item: RawAccountCandidate = { name: '', balance: null, type: '' };
        Object.entries(accMapping).forEach(([colIdx, field]) => {
          if (field === 'ignore') return;
          const raw = r[Number(colIdx)];
          if (field === 'balance') item.balance = importParseAmount(raw);
          else (item as unknown as Record<string, string>)[field] = String(raw == null ? '' : raw).trim();
        });
        return item;
      })
      .filter((item) => item.name || item.balance != null);
    setAccRows(candidates.map((c) => ({ ...normalizeAccountCandidate(c), included: true })));
    setStep('staging');
  }

  async function confirmTxImport() {
    setStageError(null);
    let invalidCount = 0;
    const items = txRows
      .filter((r) => r.included)
      .filter((r) => {
        const valid = r.date && r.amount && r.amount > 0;
        if (!valid) invalidCount++;
        return valid;
      })
      .map((r) => ({ type: r.type, amount: r.amount, date: r.date, description: r.description, category: r.category, accountId }));
    if (invalidCount) {
      setStageError(`${invalidCount} fila(s) tienen fecha o monto inválido — corrígelas o desmárcalas.`);
      return;
    }
    if (!items.length) {
      setStageError('No hay movimientos marcados para importar.');
      return;
    }
    try {
      const res = await bulkImport.mutateAsync({ items });
      setResult(res.failed.length ? `${res.imported} importados, ${res.failed.length} con error.` : `${res.imported} movimiento${res.imported === 1 ? '' : 's'} importado${res.imported === 1 ? '' : 's'} ✅`);
    } catch (err) {
      setStageError(err instanceof Error ? err.message : 'No se pudo importar.');
    }
  }

  async function confirmAccImport() {
    setStageError(null);
    const included = accRows.filter((r) => r.included);
    let invalidCount = 0;
    const items = included.filter((r) => {
      const valid = r.name.trim() && r.balance != null && !isNaN(r.balance) && !(r.type === 'efectivo' && r.balance < 0);
      if (!valid) invalidCount++;
      return valid;
    });
    if (invalidCount) {
      setStageError(`${invalidCount} fila(s) tienen nombre o saldo inválido — corrígelas o desmárcalas.`);
      return;
    }
    if (!items.length) {
      setStageError('No hay cuentas marcadas para crear.');
      return;
    }
    let created = 0;
    const failed: string[] = [];
    for (const item of items) {
      try {
        await apiCall('POST', '/api/accounts', { type: item.type, name: item.name.trim(), balance: item.balance });
        created++;
      } catch (err) {
        failed.push(err instanceof Error ? err.message : 'error');
      }
    }
    if (created > 0) queryClient.invalidateQueries({ queryKey: ['state'] });
    if (failed.length && created === 0) {
      setStageError(`No se pudo crear ninguna cuenta: ${failed[0]}`);
      return;
    }
    setResult(failed.length ? `${created} cuenta(s) creada(s), ${failed.length} con error.` : `${created} cuenta${created === 1 ? '' : 's'} creada${created === 1 ? '' : 's'} ✅`);
  }

  const includedTx = txRows.filter((r) => r.included).length;
  const includedAcc = accRows.filter((r) => r.included).length;

  return (
    <Modal open={open} onClose={handleClose} title={result ? '¡Listo!' : titleFor(step, mode)}>
      <div className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto">
        {result ? (
          <>
            <p className="text-sm text-[var(--text)]">{result}</p>
            <GradientButton onClick={handleClose} className="w-full">
              Cerrar
            </GradientButton>
          </>
        ) : step === 'pick' ? (
          <>
            <p className="text-sm text-[var(--text-muted)]">¿Qué quieres traer a NUVA?</p>
            <button
              type="button"
              onClick={() => pickMode('accounts')}
              className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-4 text-left hover:bg-[var(--surface-raised)]"
            >
              <i className="ph ph-bank mt-0.5 text-xl text-[var(--text-muted)]" aria-hidden="true" />
              <span>
                <span className="block text-sm font-bold text-[var(--text)]">Mis cuentas y saldos actuales</span>
                <span className="text-xs text-[var(--text-muted)]">Para arrancar en NUVA sin partir de cero — crea cuentas con el saldo de hoy.</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => pickMode('transactions')}
              className="flex items-start gap-3 rounded-[var(--radius-control)] border border-[var(--border)] p-4 text-left hover:bg-[var(--surface-raised)]"
            >
              <i className="ph ph-receipt mt-0.5 text-xl text-[var(--text-muted)]" aria-hidden="true" />
              <span>
                <span className="block text-sm font-bold text-[var(--text)]">Historial de movimientos</span>
                <span className="text-xs text-[var(--text-muted)]">Ingresos/gastos con fecha, de un Excel/CSV o un PDF de estado de cuenta.</span>
              </span>
            </button>
          </>
        ) : step === 'upload' ? (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              Sube el archivo — vas a poder revisar y corregir todo antes de guardar nada. El archivo nunca se sube a ningún servidor, se procesa en tu navegador.
            </p>
            {mode === 'transactions' && (
              <Select label="Cuenta destino" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ACC_TYPE_LABEL[a.type]})
                  </option>
                ))}
              </Select>
            )}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
              }}
              className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[var(--radius-card)] border-2 border-dashed p-8 text-center transition-colors ${
                dragOver ? 'border-[var(--brand)] bg-[var(--brand)]/[0.06]' : 'border-[var(--border)] hover:border-[var(--text-muted)]'
              }`}
            >
              <i className="ph ph-upload-simple text-2xl text-[var(--text-faint)]" aria-hidden="true" />
              <p className="text-sm font-semibold text-[var(--text)]">Haz clic para elegir un archivo o arrástralo aquí</p>
              <p className="text-xs text-[var(--text-faint)]">{mode === 'accounts' ? 'Excel (.xlsx, .xls) o CSV' : 'Excel (.xlsx, .xls), CSV o PDF'}</p>
              <input
                ref={fileInputRef}
                type="file"
                accept={mode === 'accounts' ? '.xlsx,.xls,.csv' : '.xlsx,.xls,.csv,.pdf'}
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
            {uploadError && (
              <p className="text-sm text-[var(--red)]" role="alert">
                {uploadError}
              </p>
            )}
            <button type="button" onClick={() => setStep('pick')} className="self-start text-sm text-[var(--text-muted)] hover:text-[var(--text)]">
              ← Atrás
            </button>
          </>
        ) : step === 'mapping' && parsedSheet ? (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              Dile a NUVA qué es cada columna de tu archivo (<b className="text-[var(--text)]">{parsedSheet.rows.length}</b> fila{parsedSheet.rows.length === 1 ? '' : 's'} detectada
              {parsedSheet.rows.length === 1 ? '' : 's'}).
            </p>
            <div className="flex flex-col gap-2">
              {parsedSheet.headers.map((h, i) => (
                <div key={i} className="flex items-center gap-3">
                  <select
                    value={mode === 'accounts' ? accMapping[i] : txMapping[i]}
                    onChange={(e) =>
                      mode === 'accounts'
                        ? setAccMapping({ ...accMapping, [i]: e.target.value as ImportAccountField })
                        : setTxMapping({ ...txMapping, [i]: e.target.value as ImportTxField })
                    }
                    className="w-44 shrink-0 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-sm text-[var(--text)]"
                  >
                    {(mode === 'accounts' ? IMPORT_ACCOUNT_FIELD_OPTIONS : IMPORT_TX_FIELD_OPTIONS).map((o) => (
                      <option key={o.v} value={o.v}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                  <span className="truncate text-xs text-[var(--text-muted)]" title={h}>
                    {h || `Columna ${i + 1}`} — ej: &quot;{String(parsedSheet.rows[0][i] ?? '')}&quot;
                  </span>
                </div>
              ))}
            </div>
            {stageError && (
              <p className="text-sm text-[var(--red)]" role="alert">
                {stageError}
              </p>
            )}
            <div className="flex gap-2">
              <GradientButton variant="ghost" onClick={() => setStep('upload')}>
                Atrás
              </GradientButton>
              <GradientButton onClick={mode === 'accounts' ? confirmAccMapping : confirmTxMapping}>Continuar</GradientButton>
            </div>
          </>
        ) : step === 'staging' && mode === 'transactions' ? (
          <>
            <div className="flex items-center justify-between text-sm text-[var(--text-muted)]">
              <span>
                <b className="text-[var(--text)]">{includedTx}</b> de <b className="text-[var(--text)]">{txRows.length}</b> incluidos
              </span>
              <span>
                Cuenta destino: <b className="text-[var(--text)]">{data.accounts.find((a) => a.id === accountId)?.name}</b>
              </span>
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-raised)] text-[var(--text-muted)]">
                  <tr>
                    <th className="p-2"></th>
                    <th className="p-2 text-left">Fecha</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Descripción</th>
                    <th className="p-2 text-left">Monto</th>
                    <th className="p-2 text-left">Categoría</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {txRows.map((r, i) => (
                    <tr key={i} className={`border-t border-[var(--border)] ${!r.included ? 'opacity-40' : !r.date || !r.amount ? 'bg-[var(--red)]/[0.06]' : ''}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={r.included} onChange={(e) => updateTxRow(i, { included: e.target.checked })} />
                      </td>
                      <td className="p-2">
                        <input
                          type="date"
                          value={r.date}
                          onChange={(e) => updateTxRow(i, { date: e.target.value })}
                          className="w-32 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex overflow-hidden rounded-full border border-[var(--border)]">
                          {(['ingreso', 'gasto'] as const).map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => updateTxRow(i, { type: t })}
                              className={`px-2 py-1 font-semibold ${r.type === t ? (t === 'ingreso' ? 'bg-[var(--green)] text-white' : 'bg-[var(--red)] text-white') : 'text-[var(--text-muted)]'}`}
                            >
                              {t === 'ingreso' ? 'Ing.' : 'Gas.'}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={r.description}
                          maxLength={300}
                          onChange={(e) => updateTxRow(i, { description: e.target.value })}
                          className="w-36 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={r.amount ?? ''}
                          onChange={(e) => updateTxRow(i, { amount: e.target.value ? Number(e.target.value) : null })}
                          className="w-20 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <select value={r.category} onChange={(e) => updateTxRow(i, { category: e.target.value })} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1">
                          {(data.categories.length ? data.categories : ['Otros']).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <IconButton icon="ph-x" label="Quitar fila" onClick={() => setTxRows(txRows.filter((_, idx) => idx !== i))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stageError && (
              <p className="text-sm text-[var(--red)]" role="alert">
                {stageError}
              </p>
            )}
            <div className="flex gap-2">
              <GradientButton variant="ghost" onClick={() => setStep(parsedSheet ? 'mapping' : 'upload')}>
                Atrás
              </GradientButton>
              <GradientButton onClick={confirmTxImport} loading={bulkImport.isPending}>
                Importar movimientos
              </GradientButton>
            </div>
          </>
        ) : step === 'staging' && mode === 'accounts' ? (
          <>
            <p className="text-sm text-[var(--text-muted)]">
              <b className="text-[var(--text)]">{includedAcc}</b> de <b className="text-[var(--text)]">{accRows.length}</b> incluidas
            </p>
            <div className="overflow-x-auto rounded-[var(--radius-control)] border border-[var(--border)]">
              <table className="w-full text-xs">
                <thead className="bg-[var(--surface-raised)] text-[var(--text-muted)]">
                  <tr>
                    <th className="p-2"></th>
                    <th className="p-2 text-left">Nombre</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Saldo</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {accRows.map((r, i) => (
                    <tr key={i} className={`border-t border-[var(--border)] ${!r.included ? 'opacity-40' : !r.name || r.balance == null ? 'bg-[var(--red)]/[0.06]' : ''}`}>
                      <td className="p-2">
                        <input type="checkbox" checked={r.included} onChange={(e) => updateAccRow(i, { included: e.target.checked })} />
                      </td>
                      <td className="p-2">
                        <input
                          type="text"
                          value={r.name}
                          maxLength={80}
                          onChange={(e) => updateAccRow(i, { name: e.target.value })}
                          className="w-40 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <select value={r.type} onChange={(e) => updateAccRow(i, { type: e.target.value as AccountType })} className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1">
                          {(Object.keys(ACC_TYPE_LABEL) as AccountType[]).map((t) => (
                            <option key={t} value={t}>
                              {ACC_TYPE_LABEL[t]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="p-2">
                        <input
                          type="number"
                          step="0.01"
                          value={r.balance ?? ''}
                          onChange={(e) => updateAccRow(i, { balance: e.target.value ? Number(e.target.value) : null })}
                          className="w-24 rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1"
                        />
                      </td>
                      <td className="p-2">
                        <IconButton icon="ph-x" label="Quitar fila" onClick={() => setAccRows(accRows.filter((_, idx) => idx !== i))} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stageError && (
              <p className="text-sm text-[var(--red)]" role="alert">
                {stageError}
              </p>
            )}
            <div className="flex gap-2">
              <GradientButton variant="ghost" onClick={() => setStep('mapping')}>
                Atrás
              </GradientButton>
              <GradientButton onClick={confirmAccImport}>Crear cuentas</GradientButton>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );

  function updateTxRow(i: number, patch: Partial<StagedTxRow>) {
    setTxRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function updateAccRow(i: number, patch: Partial<StagedAccountRow>) {
    setAccRows((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
}

function titleFor(step: Step, mode: ImportMode): string {
  if (step === 'pick') return 'Importar desde Excel/PDF';
  if (mode === 'accounts') {
    if (step === 'upload') return 'Importar cuentas y saldos';
    if (step === 'mapping') return 'Importar cuentas — mapear columnas';
    return 'Importar cuentas — revisa antes de crear';
  }
  if (step === 'upload') return 'Importar movimientos';
  if (step === 'mapping') return 'Importar movimientos — mapear columnas';
  return 'Importar movimientos — revisa antes de guardar';
}

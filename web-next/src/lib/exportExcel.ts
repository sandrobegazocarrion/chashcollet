import type { AppState } from './types';

// Portado de downloadExcel() en public/js/app.js — mismas 4 hojas (Resumen,
// Transacciones, Compromisos, Calendario pagos), usando window.XLSX ya cargado
// vía CDN en index.html (ver lib/import.ts, que declara Window.XLSX).

const ACC_LABELS: Record<string, string> = {
  ahorro: 'Cuenta de ahorros',
  corriente: 'Cuenta corriente',
  efectivo: 'Efectivo en mano',
  tarjeta: 'Tarjeta de crédito',
};

const DEUDA_TYPE_LABELS: Record<string, string> = {
  agua: 'Agua',
  luz: 'Luz / Electricidad',
  gas: 'Gas',
  internet: 'Internet / TV',
  prestamo: 'Préstamo personal',
  alquiler: 'Alquiler',
  suscripcion: 'Suscripción',
  otro: 'Otro',
};

// Window.XLSX ya está declarado (con book_new/aoa_to_sheet/book_append_sheet/writeFile
// incluidos) en lib/import.ts — no se redeclara acá para no chocar con esa interfaz.

export function exportExcel(data: AppState): void {
  if (!window.XLSX) throw new Error('Librería Excel no disponible (requiere internet).');
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const hoy = new Date().toLocaleDateString('es-PE');

  const resRows: unknown[][] = [
    ['NUVA — Resumen financiero', ''],
    [`Generado el: ${hoy}`, ''],
    [''],
    ['== CUENTAS =='],
    ['Nombre', 'Tipo', 'Saldo (S/)'],
    ...data.accounts.map((a) => [a.name, ACC_LABELS[a.type] || a.type, a.balance]),
    [''],
    ['== CHANCHITOS =='],
    ['Nombre', 'Saldo (S/)', 'Meta mensual (S/)'],
    ...(data.pockets.length ? data.pockets.map((p) => [p.name, p.balance, p.monthlyTarget || '']) : [['(sin chanchitos)', '', '']]),
    [''],
    ['== COMPROMISOS MENSUALES =='],
    ['Nombre', 'Tipo', 'Monto (S/)', 'Día de pago'],
    ...(data.deudas.length
      ? data.deudas.map((d) => [d.name, DEUDA_TYPE_LABELS[d.type] || d.type, d.amount || '', d.dueDay])
      : [['(sin compromisos)', '', '', '']]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resRows), 'Resumen');

  const txSorted = [...data.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const txRows: unknown[][] = [
    ['Fecha', 'Tipo', 'Descripción', 'Categoría', 'Cuenta', 'Monto (S/)'],
    ...txSorted.map((tx) => {
      const acc = data.accounts.find((a) => a.id === tx.accountId);
      return [
        tx.date,
        tx.type === 'ingreso' ? 'Ingreso' : 'Gasto',
        tx.description || '',
        tx.category,
        acc ? acc.name : '(eliminada)',
        tx.type === 'ingreso' ? tx.amount : -tx.amount,
      ];
    }),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(txRows), 'Transacciones');

  if (data.deudas.length > 0) {
    const dRows: unknown[][] = [
      ['Nombre', 'Tipo', 'Monto mensual (S/)', 'Día de pago', 'Cuenta', 'Notas'],
      ...data.deudas.map((d) => {
        const acc = data.accounts.find((a) => a.id === d.accountId);
        return [d.name, DEUDA_TYPE_LABELS[d.type] || d.type, d.amount || '', d.dueDay, acc ? acc.name : '', d.description || ''];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dRows), 'Compromisos');
  }

  if (data.reminders.length > 0) {
    const rRows: unknown[][] = [
      ['Nombre', 'Monto (S/)', 'Día', 'Cuotas totales', 'Cuotas pagadas', 'Cuenta'],
      ...data.reminders.map((r) => {
        const acc = data.accounts.find((a) => a.id === r.accountId);
        return [r.name, r.amount || '', r.dueDay, r.totalInstallments || '', r.paidInstallments || '', acc ? acc.name : ''];
      }),
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rRows), 'Calendario pagos');
  }

  const now = new Date();
  const fname = `nuva_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.xlsx`;
  XLSX.writeFile(wb, fname);
}

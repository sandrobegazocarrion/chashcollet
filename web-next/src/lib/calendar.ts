import { deudaTypeColorVar, deudaUrgencyInfo, personLoanCollectionStatus, RELATION_COLOR_VARS, DEUDA_TYPE_ICONS } from './deudaTypes';
import { deudaReferenceAmount as computeDeudaReferenceAmount } from './finance';
import type { AppState, Deuda, PersonLoan, PersonLoanPayment, Reminder, Account } from './types';

export type CalEventType = 'reminder' | 'deuda' | 'card' | 'personloan';
export interface CalEvent {
  type: CalEventType;
  item: Reminder | (Deuda & { paid: boolean }) | Account | PersonLoan;
}

// Portado de getCalEvents() en app.js: recordatorios, deudas (con su estado "pagado
// este mes" ya resuelto) y días de corte de tarjeta, todos proyectados sobre el mes
// que se está viendo — nunca "próximos desde hoy" como el widget del Panel. Los
// préstamos personales que me deben se suman acá (Fase 3, rediseño de Préstamos):
// antes solo vivían en el widget "Vence pronto" de Inicio, no en el calendario real.
export function getMonthEvents(data: AppState, year: number, month: number): Record<number, CalEvent[]> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const paidDeudaIds = new Set(data.deudaPayments.filter((p) => p.month === monthKey).map((p) => p.deudaId));

  const byDay: Record<number, CalEvent[]> = {};
  function add(day: number, ev: CalEvent) {
    const d = Math.min(day, daysInMonth);
    (byDay[d] ||= []).push(ev);
  }
  data.reminders.forEach((r) => add(r.dueDay, { type: 'reminder', item: r }));
  data.deudas.forEach((d) => add(d.dueDay, { type: 'deuda', item: { ...d, paid: paidDeudaIds.has(d.id) } }));
  data.accounts.filter((a) => a.type === 'tarjeta' && a.billingDay).forEach((c) => add(c.billingDay!, { type: 'card', item: c }));
  (data.personLoans || [])
    .filter((p) => p.direction === 'me_deben' && !p.paid && p.dueDate)
    .forEach((p) => {
      const day = Number(p.dueDate!.slice(8, 10));
      if (p.reminderFrequency === 'monthly') {
        // Ancla recurrente: cae en este mismo día de CADA mes que se esté viendo.
        add(day, { type: 'personloan', item: p });
      } else {
        // Fecha fija: solo aparece en el mes/año real de dueDate.
        const [py, pm] = p.dueDate!.split('-').map(Number);
        if (py === year && pm === month + 1) add(day, { type: 'personloan', item: p });
      }
    });
  return byDay;
}

export interface CalEventDesc {
  etype: CalEventType;
  eid: string;
  icon: string;
  colorVar: string;
  name: string;
  tag: string | null;
  amount: number;
  approx: boolean;
  status: { text: string; kind: 'success' | 'warning' | 'info' | 'danger' };
  isPayable: boolean;
  payLabel: string;
  progress: { paid: number; total: number } | null;
  urgent: boolean;
}

function reminderUrgencyInfo(dueDay: number) {
  return deudaUrgencyInfo(dueDay, false);
}

const STATUS_KIND_BY_TONE = { green: 'success', amber: 'warning', red: 'danger', muted: 'info' } as const;

// Portado de describeCalEvent() en app.js. `personLoanPayments` es opcional para no
// romper las llamadas existentes que solo pasaban deudaPayments — se necesita para
// calcular el pendiente y el semáforo de un evento tipo 'personloan'.
export function describeCalEvent(ev: CalEvent, payments: AppState['deudaPayments'] = [], personLoanPayments: PersonLoanPayment[] = []): CalEventDesc {
  if (ev.type === 'personloan') {
    const p = ev.item as PersonLoan;
    const paidSoFar = personLoanPayments.filter((pay) => pay.personLoanId === p.id).reduce((s, pay) => s + pay.amount, 0);
    const pending = Math.max(0, Math.round((p.amount - paidSoFar) * 100) / 100);
    const status = personLoanCollectionStatus(p, personLoanPayments);
    const colorVar = p.relationType ? RELATION_COLOR_VARS[p.relationType] : '--accent2';
    const myPayments = personLoanPayments.filter((pay) => pay.personLoanId === p.id);
    return {
      etype: 'personloan', eid: p.id, icon: 'ph-hand-coins', colorVar, name: p.personName, tag: null,
      amount: pending, approx: false,
      status: { text: status.label, kind: STATUS_KIND_BY_TONE[status.tone] },
      isPayable: true, payLabel: 'Cobrar abono',
      progress: p.returnMode === 'cuotas' && p.totalInstallments ? { paid: myPayments.length, total: p.totalInstallments } : null,
      urgent: status.tone === 'red',
    };
  }
  if (ev.type === 'card') {
    const c = ev.item as Account;
    return {
      etype: 'card', eid: c.id, icon: 'ph-credit-card', colorVar: '--red', name: c.name, tag: null,
      amount: c.balance, approx: false, status: { text: 'Corte', kind: 'danger' }, isPayable: false, payLabel: '', progress: null, urgent: false,
    };
  }
  if (ev.type === 'reminder') {
    const r = ev.item as Reminder;
    const isCuota = !!(r.totalInstallments && r.totalInstallments > 0);
    const paidN = r.paidInstallments || 0;
    const allPaid = isCuota && paidN >= r.totalInstallments!;
    const urgency = reminderUrgencyInfo(r.dueDay);
    return {
      etype: 'reminder', eid: r.id, icon: isCuota ? 'ph-package' : 'ph-calendar-blank', colorVar: '--accent2', name: r.name,
      tag: isCuota ? `Cuota ${paidN}/${r.totalInstallments}` : null,
      amount: r.amount || 0, approx: false,
      status: allPaid ? { text: 'Completado', kind: 'success' } : { text: urgency.text, kind: urgency.urgent ? 'warning' : 'info' },
      isPayable: isCuota && !allPaid, payLabel: `Pagar cuota ${paidN + 1}`,
      progress: isCuota ? { paid: paidN, total: r.totalInstallments! } : null,
      urgent: urgency.urgent && !allPaid,
    };
  }
  const d = ev.item as Deuda & { paid: boolean };
  const urgency = deudaUrgencyInfo(d.dueDay, d.paid);
  const isVariableApprox = !d.paid && d.variableAmount;
  return {
    etype: 'deuda', eid: d.id, icon: DEUDA_TYPE_ICONS[d.type] || 'ph-list', colorVar: deudaTypeColorVar(d.type), name: d.name,
    tag: (d.type === 'prestamo' && d.interestRate ? `${d.interestRate}%` : null) || (d.variableAmount ? 'Variable' : null),
    amount: isVariableApprox ? computeDeudaReferenceAmount(d, payments) : d.amount || 0, approx: isVariableApprox,
    status: d.paid ? { text: 'Pagado', kind: 'success' } : { text: urgency.text, kind: urgency.urgent ? 'warning' : 'info' },
    isPayable: !d.paid, payLabel: 'Pagar',
    progress: d.type === 'prestamo' && d.totalInstallments ? { paid: d.paidInstallments || 0, total: d.totalInstallments } : null,
    urgent: urgency.urgent && !d.paid,
  };
}

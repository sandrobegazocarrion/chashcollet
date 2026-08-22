// Matemática financiera para "Préstamos": todo esto es cálculo puro en el navegador,
// no depende del backend. Dado el monto del préstamo (valor presente), la cuota fija
// y el número de cuotas, resolvemos la tasa de interés mensual implícita por
// amortización francesa (cuota fija):
//
//   cuota = monto × [ i × (1+i)^n ] / [ (1+i)^n − 1 ]
//
// "i" no se puede despejar algebraicamente, así que se resuelve por bisección: la
// cuota es estrictamente creciente en i (para monto y n fijos), así que el método
// converge siempre que exista una tasa que explique la cuota dada.

function paymentForRate(principal: number, i: number, n: number): number {
  if (i <= 0) return principal / n;
  const factor = Math.pow(1 + i, n);
  return (principal * i * factor) / (factor - 1);
}

/** Tasa mensual implícita (como decimal, ej. 0.03 = 3%/mes), o null si los datos no alcanzan para calcularla. */
export function solveMonthlyRate(principal: number, installment: number, n: number): number | null {
  if (!principal || principal <= 0 || !installment || installment <= 0 || !n || n <= 0) return null;
  // Si la cuota ni siquiera cubre el capital dividido en n partes, no hay una tasa
  // positiva que lo explique — se asume 0% (dato probablemente aproximado por el usuario).
  if (installment * n <= principal) return 0;

  let lo = 0;
  let hi = 1; // 100%/mes como techo inicial, generoso para cualquier préstamo real
  let hiPayment = paymentForRate(principal, hi, n);
  let guard = 0;
  while (hiPayment < installment && guard < 50) {
    hi *= 2;
    hiPayment = paymentForRate(principal, hi, n);
    guard++;
  }
  for (let k = 0; k < 100; k++) {
    const mid = (lo + hi) / 2;
    const p = paymentForRate(principal, mid, n);
    if (Math.abs(p - installment) < 1e-7) return mid;
    if (p < installment) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function monthlyRateToTEA(monthlyRate: number): number {
  return Math.pow(1 + monthlyRate, 12) - 1;
}

export interface LoanSummary {
  monthlyRate: number | null;
  teaPct: number | null;
  totalPaid: number;
  totalInterest: number;
}

export function summarizeLoan(principal: number, installment: number, n: number): LoanSummary {
  const monthlyRate = solveMonthlyRate(principal, installment, n);
  const totalPaid = installment * n;
  return {
    monthlyRate,
    teaPct: monthlyRate != null ? monthlyRateToTEA(monthlyRate) * 100 : null,
    totalPaid,
    totalInterest: Math.max(0, totalPaid - principal),
  };
}

export interface EarlyPayoffResult {
  baseMonths: number;
  baseInterest: number;
  newMonths: number;
  newInterest: number;
  monthsSaved: number;
  interestSaved: number;
  possible: boolean;
}

// Simula pagar `extra` de una sola vez, hoy, por encima de la cuota — amortiza el
// resto del préstamo (saldo pendiente actual) con la misma cuota fija y tasa ya
// calculada, y compara meses/intereses restantes con y sin el adelanto.
export function simulateExtraPayment(remainingBalance: number, monthlyRate: number, installment: number, extra: number): EarlyPayoffResult {
  function amortize(balance: number, extraOnce: number) {
    let bal = Math.max(0, balance - extraOnce);
    let months = 0;
    let interestPaid = 0;
    while (bal > 0.5 && months < 600) {
      const interest = bal * monthlyRate;
      if (installment <= interest) return { months: Infinity, interestPaid: Infinity };
      let principalPortion = installment - interest;
      if (principalPortion > bal) principalPortion = bal;
      bal -= principalPortion;
      interestPaid += Math.min(interest, installment);
      months++;
    }
    return { months, interestPaid };
  }

  const base = amortize(remainingBalance, 0);
  const withExtra = amortize(remainingBalance, extra);
  const possible = Number.isFinite(base.months) && Number.isFinite(withExtra.months);
  return {
    baseMonths: base.months,
    baseInterest: base.interestPaid,
    newMonths: withExtra.months,
    newInterest: withExtra.interestPaid,
    monthsSaved: possible ? base.months - withExtra.months : 0,
    interestSaved: possible ? Math.max(0, base.interestPaid - withExtra.interestPaid) : 0,
    possible,
  };
}

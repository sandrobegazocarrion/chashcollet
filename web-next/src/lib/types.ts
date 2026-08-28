// Espeja la forma de GET /api/state (server/dataStore.js#loadUserStore) y los
// bodies que espera cada endpoint mutador (ver server/finance.js para validaciones).

export type AccountType = 'ahorro' | 'corriente' | 'efectivo' | 'tarjeta';
export type CardNetwork = 'visa' | 'mastercard' | 'amex' | 'diners' | 'otra';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  bank?: string | null;
  color?: string | null;
  network?: CardNetwork;
  creditLimit?: number | null;
  billingDay?: number | null;
  closingDay?: number | null;
  interestRate?: number | null;
  monthlyDeposit?: number | null;
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'ingreso' | 'gasto';
  amount: number;
  category: string;
  description?: string | null;
  accountId?: string | null;
}

export interface PocketContribution {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  note?: string | null;
}

export interface Pocket {
  id: string;
  name: string;
  balance: number;
  color?: string | null;
  target?: number | null;
  targetDate?: string | null;
  monthlyTarget?: number | null;
  linkedAccountId?: string | null;
  notifyBehind: boolean;
  isPrimary: boolean;
  contributions: PocketContribution[];
}

export interface Reminder {
  id: string;
  name: string;
  amount: number | null;
  dueDay: number;
  accountId?: string | null;
  notifyDaysBefore: number;
  totalInstallments?: number | null;
  paidInstallments?: number | null;
}

export type DeudaType = 'agua' | 'luz' | 'gas' | 'internet' | 'prestamo' | 'alquiler' | 'suscripcion' | 'otro';
export type LenderType = 'banco' | 'financiera' | 'app' | 'persona';

export interface Deuda {
  id: string;
  name: string;
  type: DeudaType;
  amount: number | null;
  dueDay: number;
  accountId?: string | null;
  description?: string | null;
  variableAmount: boolean;
  autoDebit: boolean;
  lenderType?: LenderType;
  lenderName?: string | null;
  interestRate?: number | null;
  principal?: number | null;
  remainingBalance?: number | null;
  totalInstallments?: number | null;
  paidInstallments?: number | null;
  startDate?: string | null;
}

export interface DeudaPayment {
  id: string;
  deudaId: string;
  month: string; // YYYY-MM
  paidDate: string | null;
  accountId: string | null;
  amount: number | null;
}

export type PersonLoanReturnMode = 'unico' | 'cuotas';
export type PersonLoanReminderFrequency = 'monthly' | 'once';
export type PersonLoanRelation = 'amigo' | 'familiar' | 'conocido';

export interface PersonLoan {
  id: string;
  personName: string;
  amount: number;
  date: string | null;
  dueDate: string | null;
  note?: string | null;
  phone?: string | null;
  paid: boolean;
  paidDate: string | null;
  direction: 'debo' | 'me_deben';
  returnMode: PersonLoanReturnMode;
  installmentAmount: number | null;
  totalInstallments: number | null;
  reminderFrequency: PersonLoanReminderFrequency | null;
  relationType?: PersonLoanRelation | null;
}

export interface PersonLoanPayment {
  id: string;
  personLoanId: string;
  amount: number;
  date: string;
  note: string | null;
}

export interface CardCharge {
  id: string;
  cardId: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  installmentAmount: number | null;
  paidInstallments: number;
  purchaseDate: string;
}

export interface CardPayment {
  id: string;
  cardId: string;
  sourceId: string;
  amount: number;
  date: string;
}

export type BudgetType = 'general' | 'categoria' | 'cuenta';

export interface Budget {
  id: string;
  period: string; // YYYY-MM
  type: BudgetType;
  categoryName?: string | null;
  accountId?: string | null;
  amountLimit: number;
}

export interface Profile {
  ownerName: string | null;
  birthDate: string | null;
  gender: string | null;
  isAdmin: boolean;
}

export interface AppState {
  accounts: Account[];
  transactions: Transaction[];
  categories: string[];
  pockets: Pocket[];
  cardPayments: CardPayment[];
  cardCharges: CardCharge[];
  deudas: Deuda[];
  deudaPayments: DeudaPayment[];
  personLoans: PersonLoan[];
  personLoanPayments: PersonLoanPayment[];
  reminders: Reminder[];
  budgets: Budget[];
  monthlyGoal: number | null;
  profile: Profile;
  settings: {
    telegramNotifications: boolean;
    notifyDaysBefore: number;
    incomeDays: number[];
  };
}

export interface AdminUser {
  id: string;
  email: string;
  createdAt: string;
  lastSignInAt: string | null;
  ownerName: string | null;
  setupCompleted: boolean;
  isAdmin: boolean;
  suspended: boolean;
  subscriptionStatus: string;
  planActiveUntil: string | null;
}

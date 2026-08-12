-- Fase 3, bloque 4 (Servicios/Préstamos): campos que usa server/finance.js
-- (addDeuda/payDeuda/addPersonLoan/settlePersonLoan/checkPersonLoansDue) y que
-- no incluí en el esquema original. Aditivo, no toca filas existentes.

alter table deudas add column if not exists description text;
alter table deudas add column if not exists variable_amount boolean default false;
alter table deudas add column if not exists total_installments int;
alter table deudas add column if not exists paid_installments int;

alter table deuda_payments add column if not exists paid_date date;
alter table deuda_payments add column if not exists account_id text references accounts(id) on delete set null;
alter table deuda_payments add column if not exists tx_id text references transactions(id) on delete set null;

alter table person_loans add column if not exists date date;
alter table person_loans add column if not exists note text;
alter table person_loans add column if not exists paid_date date;
alter table person_loans add column if not exists settle_tx_id text references transactions(id) on delete set null;
alter table person_loans add column if not exists notified_due boolean default false;
alter table person_loans add column if not exists last_overdue_notify text;

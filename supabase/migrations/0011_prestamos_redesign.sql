-- Rediseño de "Préstamos": unifica banco/financiera/app/persona en `deudas`
-- (lender_type ya soportaba 'persona') y agrega fecha de inicio para mostrar
-- cuotas transcurridas. `person_loans` pasa a usarse solo para "me deben"
-- (dinero que el usuario prestó), con abonos parciales y recordatorio de cobro.

alter table deudas add column if not exists start_date date;

alter table person_loans add column if not exists return_mode text default 'unico' check (return_mode in ('unico', 'cuotas'));
alter table person_loans add column if not exists installment_amount numeric;
alter table person_loans add column if not exists total_installments int;
alter table person_loans add column if not exists reminder_frequency text check (reminder_frequency in ('monthly', 'once'));

-- Abonos parciales contra un préstamo entre personas. El saldo pendiente se
-- calcula como amount - sum(person_loan_payments.amount), igual que deuda_payments
-- hace con el saldo de un préstamo bancario.
create table if not exists person_loan_payments (
  id text primary key,
  person_loan_id text not null references person_loans(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  date date not null,
  note text,
  tx_id text references transactions(id) on delete set null
);

alter table person_loan_payments enable row level security;
create policy "own rows" on person_loan_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on person_loan_payments (person_loan_id);

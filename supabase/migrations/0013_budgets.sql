-- Fase 5: Presupuestos — tope mensual general, por categoría y por cuenta/tarjeta.
-- monto_gastado NO se guarda acá: se computa siempre desde transactions (nunca
-- queda desincronizado, no hace falta un job que lo recalcule).

create table budgets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null,
  type text not null,
  category_name text,
  account_id text references accounts(id) on delete cascade,
  amount_limit numeric not null,
  created_at timestamptz not null default now()
);

alter table budgets enable row level security;
create policy "own rows" on budgets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

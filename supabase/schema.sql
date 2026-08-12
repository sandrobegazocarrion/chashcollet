-- ============================================================
-- NUVA — esquema multiusuario (Fase 1 del plan de migración)
-- ============================================================
-- Este archivo NO se ha ejecutado todavía contra ningún proyecto
-- de Supabase. Es el borrador para que Sandro lo revise antes de
-- correrlo (SQL Editor de Supabase, o `supabase db push` con la
-- CLI). Una vez aprobado, se aplica una sola vez.
--
-- Los IDs son `text` (no `uuid`) porque la app ya genera sus
-- propios IDs cortos (`Date.now().toString(36) + random`, ver
-- server/finance.js:genId()) — así la migración de datos (Fase 8)
-- no tiene que remapear ninguna relación existente.
-- ============================================================

-- 1. Cuentas (bancos, efectivo, tarjetas de crédito)
create table accounts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  bank text,
  balance numeric not null default 0,
  interest_rate numeric,
  monthly_deposit numeric,
  color text,
  created_at timestamptz not null default now()
);

-- 2. Metas de ahorro ("chanchitos")
create table pockets (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric,
  monthly_target numeric,
  is_primary boolean not null default false,
  color text,
  account_id text references accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3. Aportes/retiros de una meta
create table pocket_contributions (
  id text primary key,
  pocket_id text not null references pockets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  date date not null,
  type text not null,
  created_at timestamptz not null default now()
);

-- 4. Transacciones (ingresos/gastos)
create table transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('ingreso','gasto')),
  amount numeric not null,
  date date not null,
  description text,
  category text,
  account_id text references accounts(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 5. Categorías personalizadas por usuario
create table user_categories (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null
);

-- 6. Pagos hechos a una tarjeta de crédito
create table card_payments (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_account_id text references accounts(id) on delete cascade,
  amount numeric not null,
  date date not null
);

-- 7. Recordatorios / pagos programados (calendario)
create table reminders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric,
  due_day int,
  account_id text references accounts(id) on delete set null,
  notify_days_before int default 1,
  total_installments int,
  paid_installments int default 0,
  notified_before_for text,
  created_at timestamptz not null default now()
);

-- 8. Deudas / compromisos recurrentes (servicios y préstamos bancarios)
create table deudas (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null,
  amount numeric,
  due_day int,
  account_id text references accounts(id) on delete set null,
  lender_type text,
  lender_name text,
  interest_rate numeric,
  principal numeric,
  remaining_balance numeric,
  auto_debit boolean default false,
  created_at timestamptz not null default now()
);

-- 9. Pagos registrados contra una deuda
create table deuda_payments (
  id text primary key,
  deuda_id text not null references deudas(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount numeric not null,
  date date not null,
  month_key text
);

-- 10. Préstamos entre personas (bidireccional)
create table person_loans (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  person_name text not null,
  direction text not null check (direction in ('debo','me_deben')),
  amount numeric not null,
  phone text,
  due_date date,
  paid boolean default false,
  notified_soon boolean default false,
  created_at timestamptz not null default now()
);

-- 11. Compras en cuotas de tarjeta de crédito
create table card_charges (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  card_account_id text references accounts(id) on delete cascade,
  description text,
  amount numeric not null,
  date date not null,
  total_installments int,
  paid_installments int default 0
);

-- 12. Perfil y configuración (una fila por usuario)
create table user_profile (
  user_id uuid primary key references auth.users(id) on delete cascade,
  owner_name text,
  monthly_goal numeric,
  telegram_notifications boolean not null default true,
  notify_days_before int not null default 2,
  income_days jsonb not null default '[]',
  setup_completed boolean not null default false
);

-- 13. Vínculo chat de Telegram ↔ usuario
create table telegram_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  chat_id bigint not null unique,
  linked_at timestamptz not null default now()
);

-- 14. Códigos de vinculación de un solo uso (Fase 4)
create table telegram_link_codes (
  code text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- 15. Estado de suscripción / pago (Fase 5)
create table subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_active_until timestamptz,
  status text not null default 'inactive',
  culqi_customer_id text,
  culqi_subscription_id text,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- Row Level Security — un usuario JAMÁS puede leer/escribir
-- filas de otro usuario, ni manipulando la API directamente.
-- ============================================================
alter table accounts enable row level security;
alter table pockets enable row level security;
alter table pocket_contributions enable row level security;
alter table transactions enable row level security;
alter table user_categories enable row level security;
alter table card_payments enable row level security;
alter table reminders enable row level security;
alter table deudas enable row level security;
alter table deuda_payments enable row level security;
alter table person_loans enable row level security;
alter table card_charges enable row level security;
alter table user_profile enable row level security;
alter table telegram_links enable row level security;
alter table telegram_link_codes enable row level security;
alter table subscriptions enable row level security;

-- Tablas de datos de negocio: el dueño puede hacer de todo con sus propias filas.
create policy "own rows" on accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on pockets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on pocket_contributions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on user_categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on card_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on deudas for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on deuda_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on person_loans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on card_charges for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows" on user_profile for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- telegram_links: el usuario puede ver si está vinculado, pero solo el backend
-- (con la service_role key, que igual salta RLS) crea/borra el vínculo — nunca
-- el cliente directo, para que nadie pueda "robarse" un chat_id ajeno.
create policy "read own link" on telegram_links for select using (auth.uid() = user_id);

-- telegram_link_codes: no lleva política de "auth.uid() = user_id" para el rol
-- autenticado normal porque el bot (service_role, sin sesión de usuario) es
-- quien necesita buscar un código por su valor al vincular. Con RLS habilitado
-- y sin ninguna policy para el rol "authenticated", el cliente web no puede
-- leer NINGÚN código ajeno (ni siquiera el propio) directo por API — solo se
-- generan/consumen desde el backend. Esto es intencional.

-- subscriptions: el usuario puede VER su propio estado, pero no puede escribirlo
-- él mismo (si pudiera, cualquiera se auto-otorgaría premium gratis). Solo el
-- backend, vía el webhook de Culqi con service_role, actualiza esta tabla.
create policy "read own subscription" on subscriptions for select using (auth.uid() = user_id);

-- Índices para las consultas más frecuentes
create index on transactions (user_id, date);
create index on pocket_contributions (pocket_id);
create index on deuda_payments (deuda_id);
create index on telegram_link_codes (user_id);

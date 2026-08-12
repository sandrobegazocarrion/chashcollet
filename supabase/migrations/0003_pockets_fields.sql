-- Fase 3, bloque 2 (Metas/pockets): campos que usa server/finance.js y que no
-- incluí en el esquema original. Aditivo, no toca filas existentes.
alter table pockets add column if not exists balance numeric not null default 0;
alter table pockets add column if not exists rate numeric;
alter table pockets add column if not exists last_month text;
alter table pockets add column if not exists notify_behind boolean not null default false;
alter table pockets add column if not exists last_notified_month text;
alter table pockets add column if not exists target_date date;

alter table pocket_contributions add column if not exists note text;

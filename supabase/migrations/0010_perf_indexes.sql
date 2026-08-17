-- Índices de rendimiento para que las consultas no se degraden a medida que crece
-- la cantidad de usuarios conectados a la vez. Toda la app filtra SIEMPRE por
-- user_id (RLS + el filtro explícito en dataStore.js) — sin índice en esa columna,
-- Postgres tiene que recorrer la tabla entera en cada consulta, y ese costo crece
-- con el total de filas de TODOS los usuarios, no solo las del que está pidiendo
-- sus datos. `transactions`, `pocket_contributions` y `deuda_payments` ya tenían
-- índice (ver schema.sql) — acá se completan las tablas que quedaron sin uno.
create index if not exists idx_accounts_user on accounts (user_id);
create index if not exists idx_pockets_user on pockets (user_id);
create index if not exists idx_pocket_contributions_user on pocket_contributions (user_id);
create index if not exists idx_user_categories_user on user_categories (user_id);
create index if not exists idx_card_payments_user on card_payments (user_id);
create index if not exists idx_card_charges_user on card_charges (user_id);
create index if not exists idx_reminders_user on reminders (user_id);
create index if not exists idx_deudas_user on deudas (user_id);
create index if not exists idx_deuda_payments_user on deuda_payments (user_id);
create index if not exists idx_person_loans_user on person_loans (user_id);

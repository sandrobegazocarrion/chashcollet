-- Fase 3: accounts necesita estos campos (los usa server/finance.js:addAccount
-- para tarjetas de crédito y cuentas con interés) que no incluí en el esquema
-- original de la Fase 1. Es aditivo — no borra ni toca ninguna fila existente.
alter table accounts add column if not exists network text;
alter table accounts add column if not exists credit_limit numeric;
alter table accounts add column if not exists billing_day int;
alter table accounts add column if not exists closing_day int;
alter table accounts add column if not exists last_interest_month text;

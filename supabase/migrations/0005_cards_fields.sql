-- Fase 3, bloque 3 (Tarjetas): campos que usa server/finance.js y que no incluí
-- en el esquema original. Aditivo, no toca filas existentes.
alter table card_charges add column if not exists installment_amount numeric;
alter table card_charges add column if not exists tx_id text references transactions(id) on delete set null;

alter table card_payments add column if not exists source_id text references accounts(id) on delete set null;

-- Fase 3, bloque 5 (Pagos/Calendario): campo que usa server/finance.js
-- (payInstallment/checkDueReminders) y que no incluí en el esquema original.
-- Aditivo, no toca filas existentes.
alter table reminders add column if not exists notified_due_for text;

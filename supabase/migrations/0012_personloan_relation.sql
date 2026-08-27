-- Fase 3 (Préstamos, rediseño): categoría de relación para "me deben"
-- (Amigo/Familiar/Conocido) — decorativa, para que el copy y el tono de cobro
-- reflejen que cobrarle a un familiar no es lo mismo que a un conocido.

alter table person_loans add column if not exists relation_type text;

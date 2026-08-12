-- pocket_contributions.type quedó NOT NULL desde el esquema original de la Fase 1,
-- pero la lógica real (finance.js:movePocket) nunca la usa — usa "note", no "type".
-- La hacemos opcional en vez de forzar un valor que la app nunca envía.
alter table pocket_contributions alter column type drop not null;

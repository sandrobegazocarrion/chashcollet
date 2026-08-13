-- Rol de administrador (por ahora un solo flag booleano, sin tabla de roles
-- separada — no hace falta más granularidad todavía). Aditivo.
alter table user_profile add column if not exists is_admin boolean not null default false;

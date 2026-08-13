-- Datos de perfil obligatorios tras el primer login (registro por correo o Google):
-- fecha de nacimiento y género. Aditivo, no toca filas existentes.
alter table user_profile add column if not exists birth_date date;
alter table user_profile add column if not exists gender text;

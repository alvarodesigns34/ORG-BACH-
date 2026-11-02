-- Uso diario del asistente por usuario. Solo lo lee y escribe la función
-- `assistant` (rol postgres); el esquema `private` no está expuesto.
create table if not exists private.assistant_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  requests int not null default 0,
  primary key (user_id, day)
);
revoke all on private.assistant_usage from public, anon, authenticated;

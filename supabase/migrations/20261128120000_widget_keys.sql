-- Llave del widget de la pantalla de inicio (Scriptable).
--
-- Una llave por cuenta, solo de lectura y revocable. Se guarda SOLO su huella
-- SHA-256: la llave en claro se enseña una vez al crearla y no se puede
-- recuperar. La función `widget` (edge) busca la huella y devuelve un resumen
-- de las tareas de hoy de esa cuenta; nada más.
--
-- No toca ninguna tabla existente ni la sincronización.

create schema if not exists private;

create table if not exists private.widget_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_hash text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

revoke all on private.widget_keys from public, anon, authenticated;

-- Crea (o sustituye) la llave de la cuenta y la devuelve en claro una sola vez.
create or replace function public.create_widget_key()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  token text;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  -- 244 bits de azar (dos UUID v4 sin guiones).
  token := 'orb_' || replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.widget_keys (user_id, key_hash)
  values (uid, encode(sha256(convert_to(token, 'UTF8')), 'hex'))
  on conflict (user_id) do update
    set key_hash = excluded.key_hash, created_at = now(), last_used_at = null;
  return token;
end;
$$;

create or replace function public.revoke_widget_key()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  delete from private.widget_keys where user_id = auth.uid();
end;
$$;

-- ¿Hay llave? Fecha de creación y último uso (para Ajustes).
create or replace function public.widget_key_status()
returns table (created_at timestamptz, last_used_at timestamptz)
language sql
security definer
stable
set search_path = ''
as $$
  select k.created_at, k.last_used_at from private.widget_keys k where k.user_id = auth.uid();
$$;

revoke all on function public.create_widget_key() from public, anon;
revoke all on function public.revoke_widget_key() from public, anon;
revoke all on function public.widget_key_status() from public, anon;
grant execute on function public.create_widget_key() to authenticated;
grant execute on function public.revoke_widget_key() to authenticated;
grant execute on function public.widget_key_status() to authenticated;

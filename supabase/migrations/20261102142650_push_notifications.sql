-- Notificaciones push del resumen diario.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Secretos generados y guardados dentro de la base: no salen nunca del
-- servidor. El esquema `private` no está expuesto por la API.
create table private.config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
revoke all on private.config from public, anon, authenticated;

insert into private.config (key, value)
values ('cron_secret', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) < 2048),
  p256dh text not null check (char_length(p256dh) < 256),
  auth text not null check (char_length(auth) < 128),
  timezone text not null default 'Europe/Madrid',
  hour smallint not null default 17 check (hour between 0 and 23),
  enabled boolean not null default true,
  last_sent_on date,
  user_agent text check (char_length(user_agent) < 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "Ver mis suscripciones"
  on public.push_subscriptions for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Borrar mis suscripciones"
  on public.push_subscriptions for delete to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Alta o actualización de la suscripción de ESTE dispositivo. Quien tiene el
-- endpoint es el dispositivo: si estaba ligado a otra cuenta (otra persona
-- usó este navegador), pasa a la cuenta actual.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_timezone text default 'Europe/Madrid',
  p_hour int default 17,
  p_enabled boolean default true,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result uuid;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  -- Zona horaria válida para Postgres o error.
  perform now() at time zone p_timezone;

  insert into public.push_subscriptions as s
    (user_id, endpoint, p256dh, auth, timezone, hour, enabled, user_agent)
  values (uid, p_endpoint, p_p256dh, p_auth, p_timezone, p_hour, p_enabled, left(p_user_agent, 500))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        timezone = excluded.timezone,
        hour = excluded.hour,
        enabled = excluded.enabled,
        user_agent = excluded.user_agent,
        -- Cambiar la hora a una posterior el mismo día debe poder avisar hoy.
        last_sent_on = case when s.hour <> excluded.hour then null else s.last_sent_on end,
        updated_at = now()
  returning id into result;
  return result;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, int, boolean, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, int, boolean, text) to authenticated;

create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.unregister_push_subscription(text) to authenticated;

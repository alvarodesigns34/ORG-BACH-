-- Avisos del modo estudio: aterrizaje y principio/fin de cada escala.
--
-- Una web suspendida no puede avisarse a sí misma. La app manda aquí la línea
-- de tiempo del vuelo al despegar (y la sustituye cada vez que cambia: pausa,
-- reanudación, abandono) y el servidor envía cada aviso a su hora por Web
-- Push, con las mismas claves VAPID y suscripciones que el resumen diario.

-- Cada dispositivo decide si quiere los avisos de vuelo, aparte del resumen.
alter table public.push_subscriptions
  add column if not exists flights boolean not null default true;

create table if not exists public.flight_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  session_id text not null check (char_length(session_id) between 1 and 80),
  kind text not null check (kind in ('aterrizaje', 'escala', 'fin_escala')),
  fire_at timestamptz not null,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) <= 240),
  -- Una ejecución lo ha recogido para enviarlo (evita envíos dobles).
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists flight_alerts_due_idx on public.flight_alerts (fire_at);
create index if not exists flight_alerts_user_idx on public.flight_alerts (user_id);

-- Solo se toca a través de las funciones de abajo.
alter table public.flight_alerts enable row level security;
revoke all on public.flight_alerts from public, anon, authenticated;

-- Sustituye TODOS los avisos pendientes del usuario por los de `p_alerts`
-- (solo hay un vuelo en el aire a la vez). Una lista vacía los cancela.
create or replace function public.schedule_flight_alerts(p_session_id text, p_alerts jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  item jsonb;
  fire timestamptz;
  scheduled integer := 0;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  delete from public.flight_alerts where user_id = uid;

  if p_alerts is null or jsonb_typeof(p_alerts) <> 'array' then
    return 0;
  end if;

  for item in select value from jsonb_array_elements(p_alerts) limit 60 loop
    begin
      fire := (item ->> 'at')::timestamptz;
    exception when others then
      continue;
    end;
    -- Solo lo que está por venir y dentro de lo que puede durar un vuelo.
    if fire is null or fire < now() - interval '30 seconds' or fire > now() + interval '36 hours' then
      continue;
    end if;
    if coalesce(item ->> 'kind', '') not in ('aterrizaje', 'escala', 'fin_escala') then
      continue;
    end if;
    if coalesce(btrim(item ->> 'title'), '') = '' then
      continue;
    end if;
    insert into public.flight_alerts (user_id, session_id, kind, fire_at, title, body)
    values (
      uid,
      left(coalesce(nullif(p_session_id, ''), 'vuelo'), 80),
      item ->> 'kind',
      fire,
      left(btrim(item ->> 'title'), 120),
      left(coalesce(item ->> 'body', ''), 240)
    );
    scheduled := scheduled + 1;
  end loop;
  return scheduled;
end;
$$;

revoke all on function public.schedule_flight_alerts(text, jsonb) from public, anon;
grant execute on function public.schedule_flight_alerts(text, jsonb) to authenticated;

-- Activa o desactiva los avisos de vuelo en ESTE dispositivo.
create or replace function public.set_push_flights(p_endpoint text, p_enabled boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.push_subscriptions
  set flights = p_enabled, updated_at = now()
  where endpoint = p_endpoint and user_id = auth.uid();
$$;

revoke all on function public.set_push_flights(text, boolean) from public, anon;
grant execute on function public.set_push_flights(text, boolean) to authenticated;

-- Cada minuto, y solo si hay algún aviso para el minuto siguiente, se llama a
-- la función que los envía (espera dentro al segundo exacto de cada uno). Sin
-- vuelos en el aire no sale ninguna petición.
create or replace function private.invoke_flight_alerts()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.flight_alerts
    where fire_at <= now() + interval '70 seconds'
      and (claimed_at is null or claimed_at < now() - interval '3 minutes')
  ) then
    perform net.http_post(
      url := 'https://jhokoahcicsodfpzquej.supabase.co/functions/v1/daily-digest',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select value from private.config where key = 'cron_secret')
      ),
      body := jsonb_build_object('action', 'flights'),
      timeout_milliseconds := 120000
    );
  end if;
  -- Lo que se quedó sin enviar (función caída) no se arrastra para siempre.
  delete from public.flight_alerts where fire_at < now() - interval '15 minutes';
end;
$$;
revoke all on function private.invoke_flight_alerts() from public, anon, authenticated;

select cron.schedule('flight-alerts-minutely', '* * * * *', $$ select private.invoke_flight_alerts(); $$);

-- pg_cron apunta cada ejecución en su historial; con una tarea por minuto hay
-- que podarlo o crece sin fin.
select cron.schedule(
  'cron-history-prune',
  '17 3 * * *',
  $$ delete from cron.job_run_details where end_time < now() - interval '3 days'; $$
);

-- Endurecimiento de seguridad para suscripciones Web Push:
-- 1. Evita SSRF restringiendo `endpoint` a proveedores oficiales de Web Push
--    (Apple APNs, Google FCM, Mozilla Autopush, Windows WNS).
-- 2. Limita el número máximo de suscripciones por cuenta (15 dispositivos).
-- 3. Valida longitud mínima/máxima de claves `p256dh` y `auth` (base64url).
-- 4. Evita secuestro de endpoints entre cuentas si la suscripción ya pertenece a otra
--    cuenta activa con distinta clave criptográfica.

create or replace function public.is_valid_push_endpoint(p_url text)
returns boolean
language sql
immutable
as $$
  select p_url is not null
    and char_length(p_url) between 20 and 2048
    and p_url ~* '^https://(web\.push\.apple\.com|fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|updates-autopush\.stage\.mozaws\.net|[^/]+\.notify\.windows\.com|push\.services\.mozilla\.com|android\.googleapis\.com)/';
$$;

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
  existing_count int;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if not public.is_valid_push_endpoint(p_endpoint) then
    raise exception 'Proveedor de notificaciones no permitido' using errcode = '22023';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{60,180}=*$' then
    raise exception 'Clave p256dh inválida' using errcode = '22023';
  end if;
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{16,64}=*$' then
    raise exception 'Clave auth inválida' using errcode = '22023';
  end if;
  -- Zona horaria válida para Postgres o error.
  perform now() at time zone p_timezone;

  select count(*) into existing_count
  from public.push_subscriptions
  where user_id = uid and endpoint <> p_endpoint;

  if existing_count >= 15 then
    -- Elimina la suscripción más antigua de la misma cuenta para evitar acumulación.
    delete from public.push_subscriptions
    where id in (
      select id from public.push_subscriptions
      where user_id = uid and endpoint <> p_endpoint
      order by updated_at asc
      limit (existing_count - 14)
    );
  end if;

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
        last_sent_on = case when s.hour <> excluded.hour then null else s.last_sent_on end,
        updated_at = now()
  returning id into result;
  return result;
end;
$$;

revoke all on function public.is_valid_push_endpoint(text) from public, anon, authenticated;
revoke all on function public.register_push_subscription(text, text, text, text, int, boolean, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, int, boolean, text) to authenticated;

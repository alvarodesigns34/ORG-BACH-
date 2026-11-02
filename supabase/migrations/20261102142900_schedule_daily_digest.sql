-- Cada hora en punto. La función decide, con la zona horaria de cada
-- suscripción, si ha llegado su hora local (17:00 Europe/Madrid por defecto):
-- así el cambio de hora de marzo y octubre no necesita tocar nada.
create or replace function private.invoke_daily_digest()
returns bigint
language sql
security definer
set search_path = ''
as $$
  select net.http_post(
    url := 'https://jhokoahcicsodfpzquej.supabase.co/functions/v1/daily-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from private.config where key = 'cron_secret')
    ),
    body := jsonb_build_object('action', 'cron'),
    timeout_milliseconds := 60000
  );
$$;
revoke all on function private.invoke_daily_digest() from public, anon, authenticated;

select cron.schedule('daily-digest-hourly', '0 * * * *', $$ select private.invoke_daily_digest(); $$);

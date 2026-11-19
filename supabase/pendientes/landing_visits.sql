-- Contador de visitas de la web de presentación por fuente (?ref=).
-- PENDIENTE: no aplicado. Aplicar con el visto bueno de Álvaro y después
-- poner VISITS_ENABLED = true en src/landing/visits.ts.
--
-- Solo guarda día, fuente y número: ni IP, ni navegador, ni identificador.

create table if not exists public.landing_visits (
  day    date    not null default (now() at time zone 'Europe/Madrid')::date,
  ref    text    not null check (ref ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  visits integer not null default 0,
  primary key (day, ref)
);

alter table public.landing_visits enable row level security;
-- Sin políticas: nadie lee ni escribe la tabla directamente con la clave
-- pública. Solo la función de abajo suma; se consulta desde el panel.

create or replace function public.count_visit(p_ref text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_ref is null or p_ref !~ '^[a-z0-9][a-z0-9-]{0,39}$' then
    return;
  end if;
  insert into public.landing_visits as v (ref, visits)
  values (p_ref, 1)
  on conflict (day, ref) do update set visits = v.visits + 1;
end;
$$;

revoke all on function public.count_visit(text) from public;
grant execute on function public.count_visit(text) to anon, authenticated;

-- Consulta: select ref, sum(visits) from public.landing_visits
--           where day >= current_date - 30 group by ref order by 2 desc;

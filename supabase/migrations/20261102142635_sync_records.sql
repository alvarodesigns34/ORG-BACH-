-- Sincronización offline-first de Bachillerato OS.
-- Una fila por entidad (tarea, nota, asignatura...). `data` es el registro y
-- `clocks` el reloj lógico híbrido (HLC) de cada campo: la fusión es campo a
-- campo, de modo que dos dispositivos que editan campos distintos sin conexión
-- conservan ambos cambios.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create sequence if not exists public.sync_seq as bigint;
revoke all on sequence public.sync_seq from public, anon, authenticated;

create table public.sync_records (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  collection text not null check (collection in (
    'settings', 'subjects', 'tasks', 'grades', 'exams', 'events', 'sessions', 'goals', 'activity'
  )),
  id text not null check (char_length(id) between 1 and 200),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  clocks jsonb not null default '{}'::jsonb check (jsonb_typeof(clocks) = 'object'),
  -- Orden global de cambios: el cursor de descarga de cada dispositivo.
  seq bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, collection, id)
);

create index sync_records_user_seq_idx on public.sync_records (user_id, seq);

alter table public.sync_records enable row level security;

-- Solo lectura directa, y solo de lo propio. Las escrituras pasan por
-- sync_push(), que es quien sabe fusionar sin perder datos.
create policy "Leer mis registros"
  on public.sync_records for select
  to authenticated
  using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.sync_records from anon, authenticated;
grant select on public.sync_records to authenticated;

-- ---------------------------------------------------------------------------
-- Subida con fusión campo a campo
-- ---------------------------------------------------------------------------
create or replace function public.sync_push(p_records jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  rec jsonb;
  cur record;
  k text;
  v text;
  new_data jsonb;
  new_clocks jsonb;
  changed boolean;
  applied int := 0;
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  if p_records is null or jsonb_typeof(p_records) <> 'array' then
    raise exception 'Lote inválido' using errcode = '22023';
  end if;
  if jsonb_array_length(p_records) > 500 then
    raise exception 'Lote demasiado grande' using errcode = '22023';
  end if;

  -- Serializa las subidas de un mismo usuario: el número de secuencia se toma
  -- con el cerrojo en la mano, así que el orden de confirmación coincide con
  -- el de `seq` y ningún dispositivo puede saltarse un cambio al descargar.
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  for rec in select value from jsonb_array_elements(p_records) loop
    if jsonb_typeof(rec) <> 'object'
       or jsonb_typeof(rec -> 'data') <> 'object'
       or jsonb_typeof(rec -> 'clocks') <> 'object'
       or coalesce(rec ->> 'collection', '') = ''
       or coalesce(rec ->> 'id', '') = '' then
      raise exception 'Registro inválido' using errcode = '22023';
    end if;
    if pg_column_size(rec) > 65536 then
      raise exception 'Registro demasiado grande' using errcode = '22023';
    end if;
    -- Los relojes deben tener la forma HLC fija para que se comparen bien.
    if exists (
      select 1 from jsonb_each(rec -> 'clocks') c
      where jsonb_typeof(c.value) <> 'string'
         or (c.value #>> '{}') !~ '^[0-9]{15}:[0-9]{5}:[0-9a-z]{1,16}$'
    ) then
      raise exception 'Reloj inválido' using errcode = '22023';
    end if;

    select r.data, r.clocks into cur
    from public.sync_records r
    where r.user_id = uid and r.collection = rec ->> 'collection' and r.id = rec ->> 'id'
    for update;

    if not found then
      insert into public.sync_records (user_id, collection, id, data, clocks, seq)
      values (uid, rec ->> 'collection', rec ->> 'id', rec -> 'data', rec -> 'clocks',
              nextval('public.sync_seq'));
      applied := applied + 1;
    else
      new_data := cur.data;
      new_clocks := cur.clocks;
      changed := false;
      for k, v in select c.key, c.value #>> '{}' from jsonb_each(rec -> 'clocks') c loop
        -- Gana el reloj mayor; comparación byte a byte (collate "C").
        if v collate "C" > coalesce(new_clocks ->> k, '') collate "C" then
          new_clocks := new_clocks || jsonb_build_object(k, v);
          if (rec -> 'data') ? k then
            new_data := new_data || jsonb_build_object(k, rec -> 'data' -> k);
          else
            new_data := new_data - k;
          end if;
          changed := true;
        end if;
      end loop;
      if changed then
        update public.sync_records r
        set data = new_data, clocks = new_clocks, seq = nextval('public.sync_seq'), updated_at = now()
        where r.user_id = uid and r.collection = rec ->> 'collection' and r.id = rec ->> 'id';
        applied := applied + 1;
      end if;
    end if;
  end loop;

  return jsonb_build_object('applied', applied);
end;
$$;

revoke all on function public.sync_push(jsonb) from public, anon;
grant execute on function public.sync_push(jsonb) to authenticated;

-- Avisos en tiempo real: el cliente los usa solo como señal para descargar.
alter publication supabase_realtime add table public.sync_records;

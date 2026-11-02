-- PENDIENTE DE APLICAR: el conector pidió confirmación (borra filas de
-- auth.users) y no hubo respuesta. Hasta que se aplique, «Eliminar cuenta» en
-- Ajustes muestra un error y no borra nada.
--
-- Derecho a borrar: elimina la cuenta del usuario autenticado. Las tablas con
-- `on delete cascade` (sync_records, push_subscriptions) se vacían con ella.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;
  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

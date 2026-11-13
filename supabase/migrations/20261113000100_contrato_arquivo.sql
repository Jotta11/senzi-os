-- Contrato assinado digitalizado (PDF ou foto), anexado na confirmação da reserva.
-- Bucket privado `contratos`, arquivo em `<reserva>/<uuid>.<ext>`; o caminho fica em reservation_contract.pdf_path
-- (contrato vigente). Leitura por URL assinada para quem vê reservas; envio por quem confirma reservas.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos', 'contratos', false, 10485760,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Envio: pasta = id de reserva existente, e quem envia confirma reservas.
create function public.contratos_folder_ok(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_perm('reserva.confirm')
     and exists (select 1 from public.reservation r where r.id = public.try_uuid(p_folder))
$$;

-- Exclusão: só arquivo que não está registrado em nenhum contrato (limpeza de envio recusado).
create function public.contratos_unregistered(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_perm('reserva.confirm')
     and not exists (select 1 from public.reservation_contract c where c.pdf_path = p_name)
$$;

revoke all on function public.contratos_folder_ok(text) from public, anon;
revoke all on function public.contratos_unregistered(text) from public, anon;
grant execute on function public.contratos_folder_ok(text) to authenticated;
grant execute on function public.contratos_unregistered(text) to authenticated;

create policy contratos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'contratos' and (select public.has_perm('reserva.view')));

create policy contratos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'contratos'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 1
    and (select public.contratos_folder_ok((storage.foldername(name))[1]))
  );

create policy contratos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'contratos' and public.contratos_unregistered(name));

-- Registra no contrato vigente o arquivo já enviado ao bucket `contratos` em `<p_id>/<arquivo>`.
-- Substitui o anterior (o arquivo antigo fica no bucket como histórico). Gera o contrato antes, se faltar. → Reservation
create function public.attach_reservation_contract_file(p_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_path text := btrim(coalesce(p_path, ''));
begin
  perform public.require_perm('reserva.confirm');
  r := public.reservation_lock(p_id);
  if r.state in ('cancelada', 'no_show') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if v_path !~ ('^' || r.id::text || '/[^/.][^/]*$')
     or not exists (select 1 from storage.objects o where o.bucket_id = 'contratos' and o.name = v_path) then
    raise exception 'ARQUIVO_INVALIDO' using detail = 'file';
  end if;
  if not exists (select 1 from public.reservation_contract c where c.reservation_id = r.id) then
    perform public.reservation_write_contract(r.id);
  end if;
  update public.reservation_contract c
     set pdf_path = v_path
   where c.reservation_id = r.id
     and c.version = (select max(x.version) from public.reservation_contract x where x.reservation_id = r.id);
  return public.reservation_json(r.id);
end
$$;

revoke all on function public.attach_reservation_contract_file(uuid, text) from public, anon;
grant execute on function public.attach_reservation_contract_file(uuid, text) to authenticated;

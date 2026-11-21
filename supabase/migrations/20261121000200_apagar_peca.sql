-- Apagar peça do acervo (só Administrador, permissão nova `acervo.delete`).
-- Pensado para cadastro errado ou duplicado: só apaga peça que NUNCA entrou em reserva nem em prova
-- (senão o histórico, os contratos e os números dessas reservas perderiam a peça) → PECA_COM_HISTORICO.
-- Vai junto: fotos, medidas, histórico de estados, bloqueios, inspeções, ordens da Operação e favoritos
-- (cascata), e as despesas automáticas da peça (compra da peça e custos da Operação). Despesas lançadas
-- à mão ficam, só deixam de apontar para a peça. Compromissos e medidas de cliente que citavam a peça também
-- ficam, sem a peça. O audit_log registra a exclusão (trigger em garment).
-- Devolve os caminhos dos arquivos no bucket `pecas-fotos`, que o app apaga em seguida.

insert into public.permission (key, label) values ('acervo.delete', 'Apagar peça do acervo');
insert into public.role_permission (role, permission_key) values ('admin', 'acervo.delete');

create function public.delete_garment(p_garment uuid)
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paths text[];
begin
  perform public.require_perm('acervo.delete');
  perform 1 from public.garment where id = p_garment for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if exists (select 1 from public.reservation_item where garment_id = p_garment)
     or exists (select 1 from public.fitting_item where garment_id = p_garment) then
    raise exception 'PECA_COM_HISTORICO';
  end if;

  select coalesce(array_agg(p.path), '{}') into v_paths
  from (
    select ph.storage_path as path from public.garment_photo ph where ph.garment_id = p_garment
    union
    select ip.storage_path from public.inspection_photo ip
      join public.inspection i on i.id = ip.inspection_id
     where i.garment_id = p_garment and ip.storage_path is not null
  ) p;

  -- Despesas automáticas da peça (compra e custos da Operação) somem com ela; as manuais só se desligam.
  delete from public.payable
   where source in ('aquisicao', 'operacao')
     and (garment_id = p_garment or maintenance_id in (select m.id from public.maintenance m where m.garment_id = p_garment));
  update public.payable set garment_id = null where garment_id = p_garment;
  update public.payable set maintenance_id = null
   where maintenance_id in (select m.id from public.maintenance m where m.garment_id = p_garment);
  update public.appointment set garment_id = null where garment_id = p_garment;

  delete from public.garment where id = p_garment;
  return v_paths;
end
$$;

revoke all on function public.delete_garment(uuid) from public, anon;
grant execute on function public.delete_garment(uuid) to authenticated;

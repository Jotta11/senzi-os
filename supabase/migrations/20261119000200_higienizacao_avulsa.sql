-- =====================================================================
-- Senzi OS · Operação: higienização avulsa (19/11/2026).
--
-- Lançar uma peça para a lavanderia sem ter sido devolvida (sendToCleaning de
-- src/data/mock/operacao.ts). Só peça na loja: estado `disponivel` ou `reservado`
-- (com o próximo compromisso no futuro). Abre a ordem `higienizacao` em andamento,
-- o bloco no calendário a partir de hoje (termina antes do próximo bloco ativo,
-- via operacao_block) e passa a peça para `higienizacao`. A conclusão segue o
-- fluxo normal (close_maintenance: custo, fornecedor e liberação).
--
-- Erros: PECA_NAO_ENCONTRADA, ESTADO_INVALIDO, CONFLITO_AGENDA (hoje já ocupado
-- no calendário da peça), PARAMETRO_INVALIDO (days fora de 1–60).
-- =====================================================================

create function public.send_to_cleaning(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_garment uuid;
  v_state public.garment_state;
  v_days int;
  v_note text;
  v_provider text;
  v_m uuid;
begin
  perform public.require_perm('operacao.maintenance');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_garment := public.try_uuid(p ->> 'garmentId');
  select state into v_state from public.garment where id = v_garment for update;
  if not found then
    raise exception 'PECA_NAO_ENCONTRADA';
  end if;
  if v_state not in ('disponivel', 'reservado') then
    raise exception 'ESTADO_INVALIDO';
  end if;

  if jsonb_typeof(p -> 'days') = 'number' then
    v_days := (p ->> 'days')::numeric;
    if v_days::numeric <> (p ->> 'days')::numeric or v_days < 1 or v_days > 60 then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'days';
    end if;
  elsif coalesce(jsonb_typeof(p -> 'days'), 'null') <> 'null' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'days';
  else
    v_days := greatest(1, coalesce(public.garment_cleaning_days(v_garment), 0));
  end if;
  v_note := nullif(public.jtext(p, 'note'), '');
  v_provider := nullif(public.jtext(p, 'provider'), '');

  insert into public.maintenance (garment_id, kind, state, due_at, description, provider, blocks_garment, created_by)
  values (v_garment, 'higienizacao', 'em_andamento', v_today + v_days,
          coalesce('Higienização avulsa · ' || v_note, 'Higienização avulsa'), v_provider, true, public.current_app_user_id())
  returning id into v_m;

  if public.operacao_block(v_garment, 'higienizacao', v_today, v_today + v_days, 'Higienização avulsa', v_m) is null then
    raise exception 'CONFLITO_AGENDA';
  end if;
  perform public.garment_log_state(v_garment, 'higienizacao', 'Enviada para higienização avulsa');

  return public.garment_json(v_garment);
end
$$;

revoke all on function public.send_to_cleaning(jsonb) from public, anon;
grant execute on function public.send_to_cleaning(jsonb) to authenticated;

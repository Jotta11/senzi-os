-- Devolução com data livre e multa opcional.
-- p_returned_on: dia em que a cliente devolveu (padrão hoje). Não pode ser futuro nem antes da retirada da peça;
--   atraso, realinhamento da agenda da peça e horário do compromisso de devolução usam esse dia.
-- p_charge_late_fee: false dispensa a multa por atraso (late_fee = 0, sem cobrança pendente de multa).
drop function if exists public.return_reservation_items(uuid, jsonb);

create function public.return_reservation_items(p_id uuid, p_decisions jsonb, p_returned_on date default null, p_charge_late_fee boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_today date := public.store_today();
  v_on date := coalesce(p_returned_on, public.store_today());
  v_at timestamptz;
  v_still int;
  v_complete boolean;
  v_ref date;
  v_late int;
  v_received int;
  v_notes text;
  v_ids uuid[];
  v_garments uuid[];
  v_item_notes text[];
  k int;
  g uuid;
begin
  perform public.require_perm('reserva.return');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, public.reservation_states('out'));
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'items';
  end if;

  select array_agg(q.id order by q.id), array_agg(q.garment_id order by q.id), array_agg(q.note order by q.id)
    into v_ids, v_garments, v_item_notes
    from (
      select distinct on (i.id) i.id, i.garment_id, nullif(btrim(coalesce(x.d ->> 'note', '')), '') as note
        from jsonb_array_elements(p_decisions) with ordinality as x (d, ord)
        join public.reservation_item i on i.id = public.try_uuid(case when jsonb_typeof(x.d) = 'object' then x.d ->> 'itemId' end)
       where i.reservation_id = r.id and i.item_state = 'retirado'
         and coalesce((case when jsonb_typeof(x.d) = 'object' then x.d ->> 'returned' end)::boolean, false)
       order by i.id, x.ord
    ) q;
  if v_ids is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'items';
  end if;
  if v_on > v_today then
    raise exception 'DATA_FUTURA' using detail = 'returnedOn';
  end if;
  if exists (select 1 from public.reservation_item i
              where i.id = any (v_ids) and (i.picked_up_at at time zone 'America/Araguaina')::date > v_on) then
    raise exception 'DEVOLUCAO_ANTES_RETIRADA' using detail = 'returnedOn';
  end if;
  v_at := case when v_on = v_today then now()
               else public.store_at(v_on, date_trunc('second', now() at time zone 'America/Araguaina')::time) end;

  perform public.reservation_lock_garments(r.id);
  for k in 1 .. array_length(v_ids, 1) loop
    update public.reservation_item set item_state = 'devolvido', returned_at = v_at, return_note = v_item_notes[k] where id = v_ids[k];
    perform public.reservation_realign_on_return(v_garments[k], r.id, v_on);
    perform public.garment_log_state(v_garments[k], 'inspecao', 'Devolução — ' || r.code);
  end loop;

  select count(*) into v_still from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'retirado';
  v_complete := v_still = 0;
  if v_complete then
    select coalesce(max((i.returned_at at time zone 'America/Araguaina')::date), v_today) into v_ref
      from public.reservation_item i where i.reservation_id = r.id;
  else
    v_ref := v_today;
  end if;
  v_late := greatest(0, v_ref - r.return_due_date);
  update public.reservation
     set late_fee = case when v_late > 0 and coalesce(p_charge_late_fee, true)
                         then round(total_net * public.reservation_late_fee_percent(r.id) * v_late / 100, 2) else 0 end
   where id = r.id;
  v_notes := v_late || ' dia(s) de atraso' || case when v_still > 0 then ' · ' || v_still || ' peça(s) ainda na rua' else '' end;
  perform public.reservation_sync_pending(r.id, v_notes, v_today);
  update public.reservation set returned_at = case when v_complete then v_at end where id = r.id;

  if v_complete then
    update public.reservation_item
       set item_state = 'nao_entregue', pickup_note = coalesce(nullif(pickup_note, ''), 'Não entregue na retirada')
     where reservation_id = r.id and item_state = 'pendente';
    for g in select i.garment_id from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'nao_entregue' order by 1 loop
      perform public.reservation_release_blocks(r.id, g);
    end loop;
    perform public.reservation_transition(r.id, 'em_inspecao',
      case when v_late > 0 then 'Devolvida com ' || v_late || ' dia(s) de atraso'
           || case when coalesce(p_charge_late_fee, true) then '' else ' — multa dispensada' end
           else 'Devolvida no prazo' end);
    update public.appointment a set state = 'concluido', starts_at = v_at
     where a.reservation_id = r.id and a.kind = 'devolucao' and a.state = 'agendado';
    for g in select i.garment_id from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'nao_entregue' order by 1 loop
      perform public.garment_rederive(g, 'Reserva ' || r.code || ' encerrada sem a peça');
    end loop;
  else
    select count(*) into v_received from public.reservation_item i
     where i.reservation_id = r.id and i.item_state in ('devolvido', 'inspecionado');
    if r.state <> 'aguardando_devolucao' then
      perform public.reservation_transition(r.id, 'aguardando_devolucao',
        'Devolução parcial — ' || v_received || ' peça(s) recebida(s), ' || v_still || ' pendente(s)');
    end if;
    for g in select i.garment_id from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'retirado' order by 1 loop
      perform public.garment_rederive(g, 'Devolução parcial — ' || r.code);
    end loop;
  end if;
  return public.reservation_json(r.id);
end
$$;

revoke all on function public.return_reservation_items(uuid, jsonb, date, boolean) from public, anon;
grant execute on function public.return_reservation_items(uuid, jsonb, date, boolean) to authenticated;

-- Decisão do João (13/11/2026): sem PIN de administrador para nada.
-- As três travas que pediam "Autorizar exceção" deixam de bloquear:
--   • desconto acima do limite (rascunho) — qualquer desconto até o valor bruto passa;
--   • sinal abaixo do mínimo (confirmar reserva) — qualquer sinal > 0 confirma;
--   • retirada com saldo em aberto — a peça sai e o saldo segue em aberto na reserva.
-- O parâmetro p_exception continua na assinatura (o app antigo ainda manda null) e é ignorado.

create or replace function public.reservation_discount_exception(p_reservation uuid, p_gross numeric, p_discount numeric, p_exc uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return null;
end
$$;

create or replace function public.confirm_reservation(p_id uuid, p jsonb, p_exception uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  s public.app_settings;
  v_amount numeric;
  v_method text := public.jtext(p, 'method');
  v_min numeric;
  v_waiver uuid;
  v_conflicts jsonb;
  v_rest numeric;
  v_me uuid := public.current_app_user_id();
  v_single uuid;
  v_before int;
  it record;
  g uuid;
begin
  perform public.require_perm('reserva.confirm');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['rascunho']::public.reservation_state[]);
  if not exists (
    select 1 from public.reservation_contract c
     where c.reservation_id = r.id and c.signed_at is not null
       and c.version = (select max(x.version) from public.reservation_contract x where x.reservation_id = r.id)
  ) then
    raise exception 'CONTRATO_NAO_ASSINADO';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_amount := case when jsonb_typeof(p -> 'amount') = 'number' then (p ->> 'amount')::numeric end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'amount';
  end if;
  if v_amount > r.total_net + 0.005 then
    raise exception 'VALOR_EXCEDE_SALDO' using detail = 'amount', hint = public.brl(r.total_net);
  end if;
  select * into s from public.app_settings where id;
  v_min := round(r.total_net * s.min_signal_percent / 100, 2);
  perform public.jenum_check(coalesce(v_method, '') in ('pix', 'credito', 'debito', 'dinheiro', 'link', 'transferencia', 'outro'), 'method');

  perform public.reservation_lock_garments(r.id);
  select coalesce(jsonb_agg(a.j order by a.position), '[]'::jsonb) into v_conflicts
    from (
      select i.position, public.garment_availability(i.garment_id, r.pickup_date, r.return_due_date, r.id) as j
        from public.reservation_item i where i.reservation_id = r.id
    ) a
   where public.availability_blocking(a.j);
  if jsonb_array_length(v_conflicts) > 0 then
    return jsonb_build_object('ok', false, 'conflicts', v_conflicts);
  end if;

  -- Daqui para baixo nada falha por regra: tudo foi verificado acima.
  for it in select i.garment_id from public.reservation_item i where i.reservation_id = r.id order by i.position loop
    if s.default_prep_days > 0 then
      insert into public.garment_calendar_block (garment_id, reservation_id, kind, period, note, created_by)
      values (it.garment_id, r.id, 'inspecao', daterange(r.pickup_date - s.default_prep_days, r.pickup_date - 1, '[]'), 'Preparação', v_me);
    end if;
    insert into public.garment_calendar_block (garment_id, reservation_id, kind, period, note, created_by)
    values (it.garment_id, r.id, 'locacao', daterange(r.pickup_date, r.return_due_date, '[]'), 'Locação', v_me);
    if public.garment_cleaning_days(it.garment_id) > 0 then
      insert into public.garment_calendar_block (garment_id, reservation_id, kind, period, note, created_by)
      values (it.garment_id, r.id, 'higienizacao',
              daterange(r.return_due_date + 1, r.return_due_date + public.garment_cleaning_days(it.garment_id), '[]'),
              'Higienização pós-uso', v_me);
    end if;
  end loop;
  perform public.reservation_transition(r.id, 'confirmada', 'Confirmação da reserva');
  for g in select distinct i.garment_id from public.reservation_item i where i.reservation_id = r.id order by 1 loop
    select count(*) into v_before from public.garment_state_history h where h.garment_id = g;
    -- Peça já reservada por outra locação também ganha a linha "Reserva … confirmada" no histórico.
    if public.garment_rederive(g, 'Reserva ' || r.code || ' confirmada') = 'reservado'
       and (select count(*) from public.garment_state_history h where h.garment_id = g) = v_before then
      perform public.garment_log_state(g, 'reservado', 'Reserva ' || r.code || ' confirmada');
    end if;
  end loop;

  insert into public.reservation_payment (reservation_id, kind, method, amount, state, paid_at, reference, notes, created_by)
  values (r.id, case when v_amount >= r.total_net - 0.005 then 'integral' else 'sinal' end::public.payment_kind,
          v_method::public.payment_method, round(v_amount, 2), 'pago', now(),
          nullif(public.jtext(p, 'reference'), ''), nullif(public.jtext(p, 'notes'), ''), v_me);
  v_rest := round(r.total_net - v_amount, 2);
  if v_rest > 0 then
    insert into public.reservation_payment (reservation_id, kind, method, amount, state, due_at, created_by)
    values (r.id, 'saldo', v_method::public.payment_method, v_rest, 'pendente', r.pickup_date, v_me);
  end if;

  if (select count(*) from public.reservation_item i where i.reservation_id = r.id) = 1 then
    select i.garment_id into v_single from public.reservation_item i where i.reservation_id = r.id;
  end if;
  perform public.appointment_insert('retirada', public.store_at(r.pickup_date, '10:00'), 'Retirada', null, r.customer_id, r.id, null, v_single, v_me);
  if r.event_date is not null then
    perform public.appointment_insert('evento', public.store_at(r.event_date, '19:00'), coalesce(r.event_type, 'Evento'), null,
                                      r.customer_id, r.id, null, v_single, v_me);
  end if;
  perform public.appointment_insert('devolucao', public.store_at(r.return_due_date, '11:00'), 'Devolução', null, r.customer_id, r.id, null, v_single, v_me);

  if v_waiver is not null then
    perform public.reservation_exception_consume(v_waiver, r.id, round(v_min - v_amount, 2));
  end if;
  return jsonb_build_object('ok', true, 'reservation', public.reservation_json(r.id));
end
$$;

create or replace function public.pickup_reservation_items(p_id uuid, p_decisions jsonb, p_exception uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_today date := public.store_today();
  v_due numeric;
  v_exc uuid;
  v_live int;
  v_out int;
  v_all boolean;
  v_next public.reservation_state;
  v_loc public.garment_calendar_block;
  v_ids uuid[];
  v_garments uuid[];
  v_delivered boolean[];
  v_notes text[];
  v_n int;
  k int;
begin
  perform public.require_perm('reserva.pickup');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['confirmada', 'pronta_retirada', 'retirada']::public.reservation_state[]);
  if p_decisions is null or jsonb_typeof(p_decisions) <> 'array' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'items';
  end if;

  select array_agg(q.id order by q.id), array_agg(q.garment_id order by q.id),
         array_agg(q.delivered order by q.id), array_agg(q.note order by q.id)
    into v_ids, v_garments, v_delivered, v_notes
    from (
      select distinct on (i.id) i.id, i.garment_id, coalesce((x.d ->> 'delivered')::boolean, false) as delivered,
             nullif(btrim(coalesce(x.d ->> 'note', '')), '') as note
        from jsonb_array_elements(p_decisions) with ordinality as x (d, ord)
        join public.reservation_item i on i.id = public.try_uuid(case when jsonb_typeof(x.d) = 'object' then x.d ->> 'itemId' end)
       where i.reservation_id = r.id and i.item_state in ('pendente', 'nao_entregue')
       order by i.id, x.ord
    ) q;
  v_n := coalesce(array_length(v_ids, 1), 0);
  if not (true = any (coalesce(v_delivered, '{}'))) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'items';
  end if;

  select m.due into v_due from public.reservation_money(r.id) m;

  perform public.reservation_lock_garments(r.id);
  -- Retirada antecipada: se outro compromisso ocupa a peça antes da data combinada, ela não pode sair antes.
  for k in 1 .. v_n loop
    continue when not v_delivered[k];
    select * into v_loc from public.garment_calendar_block b
     where b.garment_id = v_garments[k] and b.reservation_id = r.id and b.kind = 'locacao' and b.released_at is null limit 1;
    if v_loc.id is not null and lower(v_loc.period) > v_today and exists (
      select 1 from public.garment_calendar_block b
       where b.garment_id = v_garments[k] and b.released_at is null and b.reservation_id is distinct from r.id
         and lower(b.period) < lower(v_loc.period) and upper(b.period) - 1 >= v_today
    ) then
      raise exception 'CONFLITO_AGENDA' using detail = 'items';
    end if;
  end loop;
  for k in 1 .. v_n loop
    continue when not v_delivered[k];
    select * into v_loc from public.garment_calendar_block b
     where b.garment_id = v_garments[k] and b.reservation_id = r.id and b.kind = 'locacao' and b.released_at is null limit 1;
    if v_loc.id is not null and lower(v_loc.period) > v_today then
      -- A preparação da própria reserva perde o sentido com a peça já saindo.
      update public.garment_calendar_block b set released_at = now()
       where b.garment_id = v_garments[k] and b.reservation_id = r.id and b.kind <> 'locacao' and b.released_at is null
         and b.period && daterange(v_today, lower(v_loc.period), '[)');
      update public.garment_calendar_block set period = daterange(v_today, upper(v_loc.period), '[)') where id = v_loc.id;
    end if;
  end loop;

  for k in 1 .. v_n loop
    if v_delivered[k] then
      update public.reservation_item set item_state = 'retirado', picked_up_at = now(), pickup_note = v_notes[k] where id = v_ids[k];
      perform public.garment_log_state(v_garments[k], 'em_uso', 'Retirada — ' || r.code);
    else
      update public.reservation_item set item_state = 'nao_entregue', pickup_note = coalesce(v_notes[k], 'Não entregue na retirada') where id = v_ids[k];
    end if;
  end loop;
  update public.reservation set picked_up_at = coalesce(picked_up_at, now()) where id = r.id;

  select count(*) filter (where i.item_state <> 'cancelado'),
         count(*) filter (where i.item_state in ('retirado', 'devolvido', 'inspecionado'))
    into v_live, v_out
    from public.reservation_item i where i.reservation_id = r.id;
  v_all := v_out = v_live;
  if v_exc is not null then
    perform public.reservation_exception_consume(v_exc, r.id, v_due);
  end if;
  v_next := case when v_all then 'em_uso' else 'retirada' end;
  if v_next <> r.state then
    perform public.reservation_transition(r.id, v_next,
      case when v_all then 'Todas as peças retiradas pela cliente'
           else 'Retirada parcial — ' || v_out || ' de ' || v_live || ' peça(s)' end);
  end if;
  -- Na agenda, a retirada concluída fica no dia e hora em que a cliente de fato levou as peças.
  if v_all then
    update public.appointment a
       set state = 'concluido', starts_at = (select x.picked_up_at from public.reservation x where x.id = r.id)
     where a.reservation_id = r.id and a.kind = 'retirada' and a.state = 'agendado';
  end if;
  return public.reservation_json(r.id);
end
$$;

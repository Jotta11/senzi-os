-- =====================================================================
-- Senzi OS · Reservas (2/2): RPCs, integração com Clientes, Acervo e Agenda.
--
-- Permissões (catálogo de 20261023000100_acesso.sql):
--   leitura (lista, ficha, disponibilidade, alternativas, configurações) → reserva.view
--   rascunho (criar, editar, peças)                                       → reserva.create
--     · desconto novo > 0 exige também reserva.discount (o formulário só libera o campo com ela)
--   assinar contrato e confirmar                                          → reserva.confirm
--   pronta para retirada e retirada                                       → reserva.pickup
--   devolução                                                             → reserva.return
--   cancelamento e no-show                                                → reserva.cancel
--   pagamentos e devolução/retenção da caução                             → financeiro.payment
-- Os valores da reserva saem para quem tem reserva.view (a tela esconde o dinheiro sem
-- financeiro.view); o gasto consolidado da cliente segue null sem financeiro.view (customer_json).
--
-- Exceções (exception_authorization, criadas por authorize_exception): valem uma vez, para o tipo
-- certo, pedidas pelo mesmo usuário, e para a reserva (`reserva`, ref_id = id) ou para um rascunho
-- ainda sem id (`reserva_rascunho`, só no rascunho). O uso grava reservation_id, amount e consumed_at.
--
-- Substitui com create or replace (mesma assinatura) os pontos de extensão das áreas 1 e 2:
-- customer_stats, appointment_reservation_json, fitting_reservation_json, reservation_has_garment.
-- garment_costs ganha locações, receita e última locação (drop + create: mudou o retorno).
-- =====================================================================

-- Entrada do rascunho ------------------------------------------------------------

-- Valida ReservationInput (mesma ordem e campos de reservationIssues em src/data/validation.ts) e
-- levanta o primeiro problema; DESCONTO_MAIOR_QUE_BRUTO leva o texto do desconto em HINT.
create function public.reservation_input_check(p jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_codes text[] := '{}';
  v_fields text[] := '{}';
  v_items jsonb := p -> 'items';
  v_n int := 0;
  v_bad boolean := false;
  v_gross numeric := 0;
  v_item_disc numeric := 0;
  v_ev date := public.try_iso_date(public.jtext(p, 'eventDate'));
  v_pk date := public.try_iso_date(public.jtext(p, 'pickupDate'));
  v_rt date := public.try_iso_date(public.jtext(p, 'returnDueDate'));
  v_disc numeric;
  v_hint text;
  it jsonb;
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if v_items is not null and jsonb_typeof(v_items) not in ('array', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'items';
  end if;
  if jsonb_typeof(v_items) = 'array' then
    v_n := jsonb_array_length(v_items);
    for it in select x from jsonb_array_elements(v_items) x loop
      if jsonb_typeof(it) <> 'object' then
        v_bad := true;
        continue;
      end if;
      if jsonb_typeof(it -> 'unitPrice') = 'number' then
        v_gross := v_gross + (it ->> 'unitPrice')::numeric;
        if (it ->> 'unitPrice')::numeric < 0 then
          v_bad := true;
        end if;
      else
        v_bad := true;
      end if;
      if jsonb_typeof(it -> 'itemDiscount') = 'number' then
        v_item_disc := v_item_disc + (it ->> 'itemDiscount')::numeric;
        if (it ->> 'itemDiscount')::numeric < 0 then
          v_bad := true;
        end if;
      elsif coalesce(jsonb_typeof(it -> 'itemDiscount'), 'null') <> 'null' then
        v_bad := true;
      end if;
      if jsonb_typeof(it -> 'garmentId') is distinct from 'string' then
        v_bad := true;
      end if;
    end loop;
    if (select count(distinct x ->> 'garmentId') from jsonb_array_elements(v_items) x) <> v_n then
      v_bad := true;
    end if;
  end if;
  v_gross := round(v_gross, 2);

  if coalesce(public.jtext(p, 'customerId'), '') = '' then
    v_codes := array_append(v_codes, 'RESERVA_SEM_CLIENTE'); v_fields := array_append(v_fields, 'customerId');
  end if;
  if v_n = 0 then
    v_codes := array_append(v_codes, 'RESERVA_SEM_PECAS'); v_fields := array_append(v_fields, 'items');
  elsif v_bad then
    v_codes := array_append(v_codes, 'PARAMETRO_INVALIDO'); v_fields := array_append(v_fields, 'items');
  end if;
  if v_ev is null then
    v_codes := array_append(v_codes, 'DATA_EVENTO_OBRIGATORIA'); v_fields := array_append(v_fields, 'eventDate');
  end if;
  if v_pk is null then
    v_codes := array_append(v_codes, 'DATA_OBRIGATORIA'); v_fields := array_append(v_fields, 'pickupDate');
  end if;
  if v_rt is null then
    v_codes := array_append(v_codes, 'DATA_OBRIGATORIA'); v_fields := array_append(v_fields, 'returnDueDate');
  end if;
  if v_pk is not null and v_rt is not null and v_rt < v_pk then
    v_codes := array_append(v_codes, 'DEVOLUCAO_ANTES_RETIRADA'); v_fields := array_append(v_fields, 'returnDueDate');
  end if;
  if v_ev is not null and v_pk is not null and v_ev < v_pk then
    v_codes := array_append(v_codes, 'EVENTO_ANTES_RETIRADA'); v_fields := array_append(v_fields, 'eventDate');
  end if;
  if v_ev is not null and v_rt is not null and v_ev > v_rt then
    v_codes := array_append(v_codes, 'EVENTO_DEPOIS_DEVOLUCAO'); v_fields := array_append(v_fields, 'eventDate');
  end if;
  if v_pk is not null and v_pk < public.store_today() - 1 then
    v_codes := array_append(v_codes, 'RETIRADA_NO_PASSADO'); v_fields := array_append(v_fields, 'pickupDate');
  end if;
  v_disc := case when jsonb_typeof(p -> 'discount') = 'number' then (p ->> 'discount')::numeric end;
  if v_disc is null or v_disc < 0 then
    v_codes := array_append(v_codes, 'DESCONTO_NEGATIVO'); v_fields := array_append(v_fields, 'discount');
  else
    if v_n > 0 and v_disc + v_item_disc > v_gross + 0.001 then
      v_codes := array_append(v_codes, 'DESCONTO_MAIOR_QUE_BRUTO'); v_fields := array_append(v_fields, 'discount');
      v_hint := 'O desconto (' || public.brl(v_disc) || ') é maior que o valor das peças (' || public.brl(v_gross) || ').';
    end if;
  end if;

  if array_length(v_codes, 1) > 0 then
    raise exception '%', v_codes[1] using detail = v_fields[1], hint = coalesce(v_hint, '');
  end if;
end
$$;

-- Linhas de preço da entrada (já validada), na ordem pedida.
create function public.reservation_input_lines(p jsonb)
returns table (pos int, garment_id uuid, unit_price numeric, item_discount numeric, alteration_notes text)
language sql
immutable
set search_path = public, pg_temp
as $$
  select x.ord::int, public.try_uuid(x.it ->> 'garmentId'), (x.it ->> 'unitPrice')::numeric,
         coalesce((x.it ->> 'itemDiscount')::numeric, 0), nullif(btrim(coalesce(x.it ->> 'alterationNotes', '')), '')
    from jsonb_array_elements(p -> 'items') with ordinality as x (it, ord)
$$;

-- Cliente e peças da entrada existem (NAO_ENCONTRADO); devolve a cliente.
create function public.reservation_input_refs(p jsonb)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid := public.try_uuid(public.jtext(p, 'customerId'));
  l record;
begin
  perform public.customer_must_exist(v_customer);
  for l in select * from public.reservation_input_lines(p) loop
    perform public.garment_must_exist(l.garment_id);
  end loop;
  return v_customer;
end
$$;

-- Prova a converter (fittingToConvert): null quando não há prova ou já é a prova ligada.
-- Inexistente → NAO_ENCONTRADO; encerrada ou rascunho já ligado a outra prova → PROVA_ENCERRADA;
-- de outra cliente → PARAMETRO_INVALIDO (customerId).
create function public.reservation_fitting_to_convert(p jsonb, p_current uuid, p_customer uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_text text := nullif(public.jtext(p, 'fittingId'), '');
  v_id uuid;
  f public.fitting_session;
begin
  if v_text is null then
    return null;
  end if;
  v_id := public.try_uuid(v_text);
  if v_id is not null and v_id is not distinct from p_current then
    return null;
  end if;
  if v_id is null or not exists (select 1 from public.fitting_session where id = v_id) then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if p_current is not null then
    raise exception 'PROVA_ENCERRADA';
  end if;
  f := public.fitting_open_lock(v_id);
  if f.customer_id is distinct from p_customer then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'customerId';
  end if;
  return v_id;
end
$$;

-- Desconto acima do limite: autorização já gravada que cubra o valor, ou exceção nova utilizável;
-- senão DESCONTO_ACIMA_LIMITE (campo discount). Devolve a exceção a consumir (ou null).
create function public.reservation_discount_exception(p_reservation uuid, p_gross numeric, p_discount numeric, p_exc uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_limit numeric := (select s.discount_limit_percent from public.app_settings s where s.id);
  v_exc uuid;
begin
  if not (p_gross > 0 and p_discount * 100 > p_gross * v_limit) then
    return null;
  end if;
  if p_reservation is not null and exists (
    select 1 from public.exception_authorization e
     where e.reservation_id = p_reservation and e.kind = 'desconto_acima_limite' and e.amount >= p_discount - 0.005
  ) then
    return null;
  end if;
  v_exc := public.reservation_exception_usable(p_exc, 'desconto_acima_limite', p_reservation, true);
  if v_exc is null then
    raise exception 'DESCONTO_ACIMA_LIMITE' using detail = 'discount';
  end if;
  return v_exc;
end
$$;

-- Aplica a entrada validada à reserva: campos, itens (mantém o id do item de cada peça que já estava) e preços.
create function public.reservation_apply_input(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_channel text := public.jtext(p, 'channel');
begin
  perform public.jenum_check(v_channel is null or v_channel in ('loja', 'whatsapp', 'instagram'), 'channel');
  update public.reservation set
    customer_id = public.try_uuid(public.jtext(p, 'customerId')),
    event_date = public.try_iso_date(public.jtext(p, 'eventDate')),
    event_type = nullif(public.jtext(p, 'eventType'), ''),
    event_venue = nullif(public.jtext(p, 'eventVenue'), ''),
    pickup_date = public.try_iso_date(public.jtext(p, 'pickupDate')),
    return_due_date = public.try_iso_date(public.jtext(p, 'returnDueDate')),
    channel = coalesce(v_channel::public.reservation_channel, channel),
    notes = nullif(public.jtext(p, 'notes'), '')
  where id = p_id;

  delete from public.reservation_item i
   where i.reservation_id = p_id
     and i.garment_id not in (select l.garment_id from public.reservation_input_lines(p) l);
  -- Posições provisórias fora da faixa, para não colidir com a ordem nova.
  update public.reservation_item set position = position + 100000 where reservation_id = p_id;
  update public.reservation_item i
     set position = l.pos, unit_price = l.unit_price, gross_amount = l.unit_price, item_discount = l.item_discount,
         alteration_notes = l.alteration_notes
    from public.reservation_input_lines(p) l
   where i.reservation_id = p_id and i.garment_id = l.garment_id;
  insert into public.reservation_item (reservation_id, garment_id, position, unit_price, gross_amount, item_discount, alteration_notes)
  select p_id, l.garment_id, l.pos, l.unit_price, l.unit_price, l.item_discount, l.alteration_notes
    from public.reservation_input_lines(p) l
   where not exists (select 1 from public.reservation_item i where i.reservation_id = p_id and i.garment_id = l.garment_id);
  perform public.reservation_reprice(p_id, round((p ->> 'discount')::numeric, 2));
end
$$;

-- Desconto do pedido (desconto total − descontos das peças).
create function public.reservation_order_discount(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select round(r.discount - coalesce((select sum(i.item_discount) from public.reservation_item i where i.reservation_id = r.id), 0), 2)
    from public.reservation r where r.id = p_id
$$;

-- Desconto novo exige reserva.discount (o formulário só libera o campo com ela).
create function public.reservation_discount_perm(p_new numeric, p_current numeric)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_new > 0 and p_new is distinct from p_current and not public.has_perm('reserva.discount') then
    raise exception 'SEM_PERMISSAO';
  end if;
end
$$;

-- Cancelamento e no-show: libera os blocos, recalcula as peças, encerra compromissos agendados e
-- cancela as parcelas pendentes (o que já foi pago fica; estorno é manual).
create function public.reservation_release(p_id uuid, p_to public.reservation_state, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  g uuid;
begin
  update public.reservation set cancel_reason = p_reason where id = p_id returning code into v_code;
  perform public.reservation_transition(p_id, p_to, p_reason);
  update public.appointment
     set state = case when p_to = 'no_show' and kind = 'retirada' then 'no_show' else 'cancelado' end::public.appointment_state
   where reservation_id = p_id and state = 'agendado';
  update public.reservation_payment set state = 'cancelado' where reservation_id = p_id and state = 'pendente';
  for g in select distinct i.garment_id from public.reservation_item i where i.reservation_id = p_id order by 1 loop
    perform public.reservation_release_blocks(p_id, g);
    perform public.garment_rederive(g, 'Reserva ' || v_code || ' ' || case when p_to = 'no_show' then 'no-show' else 'cancelada' end);
  end loop;
end
$$;

-- Trava as peças da reserva (ordem fixa, evita deadlock entre confirmações simultâneas).
create function public.reservation_lock_garments(p_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select 1 from public.garment g
   where g.id in (select i.garment_id from public.reservation_item i where i.reservation_id = p_id)
   order by g.id
   for update
$$;

-- =====================================================================
-- Pontos de extensão das áreas anteriores (create or replace)
-- =====================================================================

-- Estatísticas da cliente (customerStats de src/domain/customers.ts): locações realizadas,
-- Σ líquido delas e o próximo evento de reserva ativa a partir de hoje.
create or replace function public.customer_stats(p_id uuid)
returns table (rentals int, spent numeric, next_event date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select (count(*) filter (where r.state = any (public.reservation_states('realized'))))::int,
         round(coalesce(sum(r.total_net) filter (where r.state = any (public.reservation_states('realized'))), 0), 2),
         min(r.event_date) filter (where r.state = any (public.reservation_states('active')) and r.event_date >= public.store_today())
    from public.reservation r
   where r.customer_id = p_id
$$;

-- Parte da reserva no item da agenda: reserva, peças e contadores do compromisso.
create or replace function public.appointment_reservation_json(p_reservation uuid, p_kind public.appointment_kind)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select jsonb_build_object(
             'reservation', jsonb_build_object('id', r.id, 'code', r.code),
             'garments', coalesce((
               select jsonb_agg(jsonb_build_object('id', g.id, 'code', g.code, 'name', g.name) order by i.position)
                 from public.reservation_item i join public.garment g on g.id = i.garment_id
                where i.reservation_id = r.id
             ), '[]'::jsonb)
           )
           || case p_kind
                when 'retirada' then jsonb_build_object('pendingPickupItems',
                  (select count(*) from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'pendente'))
                when 'devolucao' then jsonb_build_object('itemsOut',
                  (select count(*) from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'retirado'))
                else '{}'::jsonb
              end
      from public.reservation r
     where r.id = p_reservation
  ), '{}'::jsonb)
$$;

-- Bloco `reservation` do detalhe da prova.
create or replace function public.fitting_reservation_json(p_reservation uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object('id', r.id, 'code', r.code, 'customerName', c.full_name, 'eventDate', r.event_date)
    from public.reservation r
    join public.customer c on c.id = r.customer_id
   where r.id = p_reservation
$$;

create or replace function public.reservation_has_garment(p_reservation uuid, p_garment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.reservation_item i where i.reservation_id = p_reservation and i.garment_id = p_garment)
$$;

-- Economia da peça (garmentEconomics de src/domain/economics.ts): custo de aquisição, locações realizadas
-- (itens não cancelados nem "não entregues"), receita (Σ líquido rateado) e última locação (evento ou retirada).
-- Higienização e manutenção entram com a Operação. Só com acervo.cost.
drop function public.garment_costs(uuid[]);
create function public.garment_costs(p_ids uuid[])
returns table (garment_id uuid, acquisition_cost numeric, rentals int, revenue numeric, last_rental date)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.cost');
  return query
    select g.id, g.acquisition_cost, count(u.net_revenue)::int, round(coalesce(sum(u.net_revenue), 0), 2), max(u.d)
      from public.garment g
      left join lateral (
        select i.net_revenue, coalesce(r.event_date, r.pickup_date) as d
          from public.reservation_item i
          join public.reservation r on r.id = i.reservation_id
         where i.garment_id = g.id
           and r.state = any (public.reservation_states('realized'))
           and i.item_state not in ('cancelado', 'nao_entregue')
      ) u on true
     where g.id = any (p_ids)
     group by g.id, g.acquisition_cost;
end
$$;

-- =====================================================================
-- Leitura
-- =====================================================================

create function public.get_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  return public.settings_json();
end
$$;

-- Lista por filtro (spec §2.1). Ordem: retirada, criação, código; `encerradas` ao contrário.
-- Filtro desconhecido = todas (como a fonte em memória). → {"items": [ReservationRow…], "total": n}
create function public.list_reservations(p_filter text, p_limit int, p_offset int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_desc boolean := p_filter = 'encerradas';
  v_total bigint;
  v_items jsonb;
begin
  perform public.require_perm('reserva.view');
  if coalesce(p_limit, 0) < 1 or p_limit > 1000 or coalesce(p_offset, -1) < 0 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;

  with hits as (
    select r.id,
           row_number() over (order by r.pickup_date, r.created_at, r.code) as asc_rn
      from public.reservation r
     where case p_filter
             when 'ativas' then r.state = any (public.reservation_states('list_active'))
             when 'hoje' then r.pickup_date = v_today or r.return_due_date = v_today or coalesce(r.event_date = v_today, false)
             when 'rascunhos' then r.state = 'rascunho'
             when 'com_saldo' then r.state = any (public.reservation_states('list_active')) and public.reservation_open_due(r.id) > 0
             when 'rua' then r.state = any (public.reservation_states('out'))
             when 'inspecao' then r.state in ('devolvida', 'em_inspecao')
             when 'futuras' then (r.state = 'rascunho' or r.state = any (public.reservation_states('active'))) and r.pickup_date > v_today
             when 'encerradas' then r.state = any (public.reservation_states('closed'))
             else true
           end
  ),
  ranked as (
    select h.id, row_number() over (order by case when v_desc then -h.asc_rn else h.asc_rn end) as rn from hits h
  )
  select (select count(*) from hits),
         coalesce((
           select jsonb_agg(public.reservation_row_json(k.id) order by k.rn)
             from ranked k
            where k.rn > p_offset and k.rn <= p_offset + p_limit
         ), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total);
end
$$;

-- Reservas ativas e Σ do que falta receber delas (parcelas pendentes de reservas com conta a receber).
create function public.reservation_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  return jsonb_build_object(
    'active', (select count(*) from public.reservation r where r.state = any (public.reservation_states('active'))),
    'toReceive', (
      select round(coalesce(sum(p.amount), 0), 2)
        from public.reservation_payment p
        join public.reservation r on r.id = p.reservation_id
       where p.state = 'pendente' and p.kind <> 'caucao'
         and not (r.state = any (public.reservation_states('no_receivable')))
    )
  );
end
$$;

-- Ficha da reserva (ReservationDetail); null quando não existe.
create function public.get_reservation(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  return public.reservation_detail_json(p_id);
end
$$;

-- Uma AvailabilityResult por peça, na ordem pedida.
create function public.check_availability(p_garments uuid[], p_pickup date, p_return date, p_ignore uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  if p_pickup is null or p_return is null then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  return coalesce((
    select jsonb_agg(public.garment_availability(x.id, p_pickup, p_return, p_ignore) order by x.ord)
      from unnest(p_garments) with ordinality as x (id, ord)
  ), '[]'::jsonb);
end
$$;

-- Até 4 peças livres semelhantes (alternatives de src/domain/calendar.ts): mesma categoria, não baixadas;
-- +4 etiqueta, +3 tamanho, +2 comprimento, +2 cor, +1 preço a menos de R$ 150. → [Garment…]
create function public.reservation_alternatives(p_garment uuid, p_pickup date, p_return date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  t public.garment;
begin
  perform public.require_perm('reserva.view');
  select * into t from public.garment where id = p_garment;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if p_pickup is null or p_return is null then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  return coalesce((
    select jsonb_agg(public.garment_json(a.id) order by a.score desc, a.code)
      from (
        select g.id, g.code,
               (case when g.label_size = t.label_size then 4 else 0 end)
               + (case when g.size_equiv = t.size_equiv then 3 else 0 end)
               + (case when g.length = t.length then 2 else 0 end)
               + (case when g.color_primary = t.color_primary then 2 else 0 end)
               + (case when abs(g.rental_price - t.rental_price) < 150 then 1 else 0 end) as score
          from public.garment g
         where g.id <> t.id and g.category_id = t.category_id and g.state <> 'baixado'
           and (public.garment_availability(g.id, p_pickup, p_return, null) ->> 'ok')::boolean
         order by 3 desc, g.code
         limit 4
      ) a
  ), '[]'::jsonb);
end
$$;

-- Reservas da cliente / da peça, retirada decrescente. → [ReservationRow…]
create function public.reservations_of_customer(p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  return coalesce((
    select jsonb_agg(public.reservation_row_json(r.id) order by r.pickup_date desc, r.created_at desc, r.code desc)
      from public.reservation r where r.customer_id = p_customer
  ), '[]'::jsonb);
end
$$;

create function public.reservations_of_garment(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('reserva.view');
  return coalesce((
    select jsonb_agg(public.reservation_row_json(r.id) order by r.pickup_date desc, r.created_at desc, r.code desc)
      from public.reservation r
     where exists (select 1 from public.reservation_item i where i.reservation_id = r.id and i.garment_id = p_garment)
  ), '[]'::jsonb);
end
$$;

-- =====================================================================
-- Rascunho
-- =====================================================================

-- Cria o rascunho (conflitos de agenda não bloqueiam; rascunho não cria bloco). Gera o código
-- RS-<ano>-NNNN e o contrato v1; com fittingId, converte a prova. → Reservation
create function public.create_reservation_draft(p jsonb, p_exception uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid;
  v_fit uuid;
  v_exc uuid;
  v_gross numeric;
  v_disc numeric;
  v_prefix text := 'RS-' || to_char(public.store_today(), 'YYYY') || '-';
  v_code text;
  v_id uuid;
begin
  perform public.require_perm('reserva.create');
  perform public.reservation_input_check(p);
  v_customer := public.reservation_input_refs(p);
  v_fit := public.reservation_fitting_to_convert(p, null, v_customer);
  select round(sum(l.unit_price), 2), round((p ->> 'discount')::numeric + sum(l.item_discount), 2)
    into v_gross, v_disc
    from public.reservation_input_lines(p) l;
  perform public.reservation_discount_perm(v_disc, 0);
  v_exc := public.reservation_discount_exception(null, v_gross, v_disc, p_exception);

  perform pg_advisory_xact_lock(hashtext('reservation_code'));
  select v_prefix || lpad((coalesce(max(substr(code, length(v_prefix) + 1)::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.reservation
   where code like v_prefix || '%' and substr(code, length(v_prefix) + 1) ~ '^\d+$';

  insert into public.reservation (code, customer_id, pickup_date, return_due_date, created_by)
  values (v_code, v_customer, public.try_iso_date(public.jtext(p, 'pickupDate')),
          public.try_iso_date(public.jtext(p, 'returnDueDate')), public.current_app_user_id())
  returning id into v_id;
  perform public.reservation_apply_input(v_id, p);
  perform public.reservation_log(v_id, null, 'rascunho', 'Reserva criada');
  perform public.reservation_write_contract(v_id);
  if v_fit is not null then
    perform public.fitting_convert(v_fit, v_id, v_customer);
    update public.reservation set fitting_id = v_fit where id = v_id;
  end if;
  if v_exc is not null then
    perform public.reservation_exception_consume(v_exc, v_id, (select discount from public.reservation where id = v_id));
  end if;
  return public.reservation_json(v_id);
end
$$;

-- Edita o rascunho (só `rascunho`) e regera o contrato (versão + 1). → Reservation
create function public.update_reservation_draft(p_id uuid, p jsonb, p_exception uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_customer uuid;
  v_fit uuid;
  v_exc uuid;
  v_gross numeric;
  v_disc numeric;
begin
  perform public.require_perm('reserva.create');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['rascunho']::public.reservation_state[]);
  perform public.reservation_input_check(p);
  v_customer := public.reservation_input_refs(p);
  v_fit := public.reservation_fitting_to_convert(p, r.fitting_id, v_customer);
  select round(sum(l.unit_price), 2), round((p ->> 'discount')::numeric + sum(l.item_discount), 2)
    into v_gross, v_disc
    from public.reservation_input_lines(p) l;
  perform public.reservation_discount_perm(v_disc, r.discount);
  v_exc := public.reservation_discount_exception(r.id, v_gross, v_disc, p_exception);

  perform public.reservation_apply_input(r.id, p);
  perform public.reservation_write_contract(r.id);
  if v_fit is not null then
    perform public.fitting_convert(v_fit, r.id, v_customer);
    update public.reservation set fitting_id = v_fit where id = r.id;
  end if;
  if v_exc is not null then
    perform public.reservation_exception_consume(v_exc, r.id, (select discount from public.reservation where id = r.id));
  end if;
  return public.reservation_json(r.id);
end
$$;

-- Acrescenta uma peça ao rascunho pelo preço de locação dela (já presente: nada muda). → Reservation
create function public.add_reservation_draft_item(p_id uuid, p_garment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_order numeric;
begin
  perform public.require_perm('reserva.create');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['rascunho']::public.reservation_state[]);
  perform public.garment_must_exist(p_garment);
  if exists (select 1 from public.reservation_item i where i.reservation_id = r.id and i.garment_id = p_garment) then
    return public.reservation_json(r.id);
  end if;
  v_order := public.reservation_order_discount(r.id);
  insert into public.reservation_item (reservation_id, garment_id, position, unit_price, gross_amount)
  select r.id, g.id, coalesce((select max(i.position) from public.reservation_item i where i.reservation_id = r.id), 0) + 1,
         g.rental_price, g.rental_price
    from public.garment g where g.id = p_garment;
  perform public.reservation_reprice(r.id, v_order);
  perform public.reservation_write_contract(r.id);
  return public.reservation_json(r.id);
end
$$;

-- Tira uma peça do rascunho; a última → RESERVA_SEM_PECAS. → Reservation
create function public.remove_reservation_draft_item(p_id uuid, p_item uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_order numeric;
  v_gross numeric;
  v_disc numeric;
begin
  perform public.require_perm('reserva.create');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['rascunho']::public.reservation_state[]);
  if not exists (select 1 from public.reservation_item i where i.id = p_item and i.reservation_id = r.id) then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if (select count(*) from public.reservation_item i where i.reservation_id = r.id) = 1 then
    raise exception 'RESERVA_SEM_PECAS' using detail = 'items';
  end if;
  v_order := public.reservation_order_discount(r.id);
  select round(sum(i.unit_price), 2), round(v_order + sum(i.item_discount), 2)
    into v_gross, v_disc
    from public.reservation_item i
   where i.reservation_id = r.id and i.id <> p_item;
  if v_disc > v_gross + 0.001 then
    raise exception 'DESCONTO_MAIOR_QUE_BRUTO' using detail = 'discount';
  end if;
  perform public.reservation_discount_exception(r.id, v_gross, v_disc, null);
  delete from public.reservation_item where id = p_item;
  perform public.reservation_reprice(r.id, v_order);
  perform public.reservation_write_contract(r.id);
  return public.reservation_json(r.id);
end
$$;

-- Marca o contrato vigente como assinado (presencial): `signedAt` = data informada + hora de agora.
-- Congela o corpo. Gera o contrato antes, se faltar. → Reservation
create function public.sign_reservation_contract(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_date date := public.try_iso_date(public.jtext(p, 'signedAt'));
  v_name text := public.jtext(p, 'signerName');
begin
  perform public.require_perm('reserva.confirm');
  r := public.reservation_lock(p_id);
  if r.state in ('cancelada', 'no_show') or exists (
    select 1 from public.reservation_contract c
     where c.reservation_id = r.id and c.signed_at is not null
       and c.version = (select max(x.version) from public.reservation_contract x where x.reservation_id = r.id)
  ) then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if v_date is null then
    raise exception 'DATA_OBRIGATORIA' using detail = 'signedAt';
  end if;
  if v_date > public.store_today() then
    raise exception 'DATA_FUTURA' using detail = 'signedAt';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'NOME_CLIENTE_OBRIGATORIO' using detail = 'signerName';
  end if;
  if not exists (select 1 from public.reservation_contract c where c.reservation_id = r.id) then
    perform public.reservation_write_contract(r.id);
  end if;
  update public.reservation_contract c
     set signed_at = public.store_at(v_date, date_trunc('second', now() at time zone 'America/Araguaina')::time),
         signed_by = public.current_app_user_id(),
         signer_name = v_name,
         signature_kind = 'presencial',
         signature_notes = nullif(public.jtext(p, 'notes'), '')
   where c.reservation_id = r.id
     and c.version = (select max(x.version) from public.reservation_contract x where x.reservation_id = r.id);
  return public.reservation_json(r.id);
end
$$;

-- =====================================================================
-- Ciclo
-- =====================================================================

-- Confirmação atômica: contrato assinado, sinal ≥ mínimo (ou dispensa autorizada), sem conflito de agenda.
-- Conflito → {"ok": false, "conflicts": [...]} e nada muda. Senão blocos, peças, sinal/saldo e os três
-- compromissos (retirada 10:00, evento 19:00, devolução 11:00). → ConfirmResult
create function public.confirm_reservation(p_id uuid, p jsonb, p_exception uuid)
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
  if v_amount < v_min - 0.005 then
    v_waiver := public.reservation_exception_usable(p_exception, 'dispensa_sinal_minimo', r.id, false);
    if v_waiver is null then
      raise exception 'SINAL_INSUFICIENTE' using detail = 'amount', hint = public.brl(v_min);
    end if;
  end if;
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

-- `confirmada → pronta_retirada`. → Reservation
create function public.mark_reservation_ready(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
begin
  perform public.require_perm('reserva.pickup');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['confirmada']::public.reservation_state[]);
  perform public.reservation_transition(r.id, 'pronta_retirada', 'Peça pronta para retirada');
  return public.reservation_json(r.id);
end
$$;

-- Retirada por item (`p_decisions` = [{itemId, delivered, note}]). Saldo em aberto exige exceção
-- `retirada_com_saldo`. Retirada antecipada: a locação passa a começar hoje, salvo se outro bloco da peça
-- ocupa o intervalo (CONFLITO_AGENDA, campo items). Todas fora → em_uso; senão retirada. → Reservation
create function public.pickup_reservation_items(p_id uuid, p_decisions jsonb, p_exception uuid)
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
  if v_due > 0.005 then
    v_exc := public.reservation_exception_usable(p_exception, 'retirada_com_saldo', r.id, false);
    if v_exc is null then
      raise exception 'SALDO_EM_ABERTO' using hint = public.brl(v_due);
    end if;
  end if;

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

-- Devolução por item (`p_decisions` = [{itemId, returned, note}]). Multa única por reserva, recalculada a cada
-- devolução (% diário do contrato × dias × líquido). Peça devolvida → inspecao. Completa → em_inspecao
-- (o que nunca saiu vira "não entregue" e libera a agenda); parcial → aguardando_devolucao. → Reservation
create function public.return_reservation_items(p_id uuid, p_decisions jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_today date := public.store_today();
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

  perform public.reservation_lock_garments(r.id);
  for k in 1 .. array_length(v_ids, 1) loop
    update public.reservation_item set item_state = 'devolvido', returned_at = now(), return_note = v_item_notes[k] where id = v_ids[k];
    perform public.reservation_realign_on_return(v_garments[k], r.id, v_today);
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
     set late_fee = case when v_late > 0
                         then round(total_net * public.reservation_late_fee_percent(r.id) * v_late / 100, 2) else 0 end
   where id = r.id;
  v_notes := v_late || ' dia(s) de atraso' || case when v_still > 0 then ' · ' || v_still || ' peça(s) ainda na rua' else '' end;
  perform public.reservation_sync_pending(r.id, v_notes, v_today);
  update public.reservation set returned_at = case when v_complete then now() end where id = r.id;

  if v_complete then
    update public.reservation_item
       set item_state = 'nao_entregue', pickup_note = coalesce(nullif(pickup_note, ''), 'Não entregue na retirada')
     where reservation_id = r.id and item_state = 'pendente';
    for g in select i.garment_id from public.reservation_item i where i.reservation_id = r.id and i.item_state = 'nao_entregue' order by 1 loop
      perform public.reservation_release_blocks(r.id, g);
    end loop;
    perform public.reservation_transition(r.id, 'em_inspecao',
      case when v_late > 0 then 'Devolvida com ' || v_late || ' dia(s) de atraso' else 'Devolvida no prazo' end);
    update public.appointment a set state = 'concluido', starts_at = now()
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

-- Cancelamento: só sem peça com a cliente (rascunho, confirmada, pronta_retirada); motivo obrigatório. → Reservation
create function public.cancel_reservation(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  perform public.require_perm('reserva.cancel');
  r := public.reservation_lock(p_id);
  if v_reason = '' then
    raise exception 'MOTIVO_OBRIGATORIO' using detail = 'reason';
  end if;
  perform public.reservation_ensure_state(r.state, array['rascunho', 'confirmada', 'pronta_retirada']::public.reservation_state[]);
  perform public.reservation_release(r.id, 'cancelada', v_reason);
  return public.reservation_json(r.id);
end
$$;

-- No-show: confirmada/pronta com retirada no passado. → Reservation
create function public.mark_reservation_no_show(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
begin
  perform public.require_perm('reserva.cancel');
  r := public.reservation_lock(p_id);
  perform public.reservation_ensure_state(r.state, array['confirmada', 'pronta_retirada']::public.reservation_state[]);
  if r.pickup_date >= public.store_today() then
    raise exception 'ESTADO_INVALIDO';
  end if;
  perform public.reservation_release(r.id, 'no_show', 'Não compareceu para a retirada');
  return public.reservation_json(r.id);
end
$$;

-- =====================================================================
-- Pagamentos
-- =====================================================================

-- Lançamento (sinal, saldo, integral, caução, multa, estorno). Parcela pendente do mesmo tipo é quitada em vez
-- de duplicada; estorno da caução (`refersTo: 'caucao'`) não mexe no saldo. → Reservation
create function public.register_reservation_payment(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  m record;
  v_kind text := public.jtext(p, 'kind');
  v_method text := public.jtext(p, 'method');
  v_refers text := nullif(public.jtext(p, 'refersTo'), '');
  v_amount numeric;
  v_limit numeric;
  v_pending public.reservation_payment;
  v_me uuid := public.current_app_user_id();
begin
  perform public.require_perm('financeiro.payment');
  r := public.reservation_lock(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  perform public.jenum_check(coalesce(v_kind, '') in ('sinal', 'saldo', 'integral', 'caucao', 'multa', 'estorno'), 'kind');
  if r.state = 'rascunho' or (r.state in ('cancelada', 'no_show') and v_kind <> 'estorno') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  v_amount := case when jsonb_typeof(p -> 'amount') = 'number' then (p ->> 'amount')::numeric end;
  if v_amount is null or v_amount <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'amount';
  end if;
  if (v_refers is not null and v_refers <> 'caucao') or (v_refers = 'caucao' and v_kind <> 'estorno') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'refersTo';
  end if;
  perform public.jenum_check(coalesce(v_method, '') in ('pix', 'credito', 'debito', 'dinheiro', 'link', 'transferencia', 'outro'), 'method');

  select * into m from public.reservation_money(r.id);
  v_limit := case when v_kind = 'caucao' then null
                  when v_kind <> 'estorno' then m.due
                  when v_refers = 'caucao' then m.caucao
                  else m.pago end;
  if v_limit is not null and v_amount > v_limit + 0.005 then
    raise exception 'VALOR_EXCEDE_SALDO' using detail = 'amount', hint = public.brl(v_limit);
  end if;

  if v_kind in ('saldo', 'multa') then
    select * into v_pending from public.reservation_payment
     where reservation_id = r.id and kind = v_kind::public.payment_kind and state = 'pendente'
     order by seq limit 1 for update;
  end if;
  if v_pending.id is not null and v_amount >= v_pending.amount - 0.005 then
    update public.reservation_payment
       set method = v_method::public.payment_method, amount = round(v_amount, 2), state = 'pago', paid_at = now(),
           reference = nullif(public.jtext(p, 'reference'), ''), notes = nullif(public.jtext(p, 'notes'), ''),
           refers_to = v_refers, created_by = v_me
     where id = v_pending.id;
  else
    insert into public.reservation_payment (reservation_id, kind, method, amount, state, paid_at, reference, notes, refers_to, created_by)
    values (r.id, v_kind::public.payment_kind, v_method::public.payment_method, round(v_amount, 2), 'pago', now(),
            nullif(public.jtext(p, 'reference'), ''), nullif(public.jtext(p, 'notes'), ''), v_refers, v_me);
  end if;
  perform public.reservation_sync_pending(r.id, null, null);
  return public.reservation_json(r.id);
end
$$;

-- Devolve a caução retida (só reserva encerrada). Com `p_retain` = {amount, reason}, essa parte fica com a loja:
-- sai da custódia (estorno `outro`) e vira recebível avulso pago "Retenção de caução · RS-…" na categoria de
-- sistema `locacao`. → Reservation
create function public.return_reservation_deposit(p_id uuid, p_method text, p_retain jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  v_held numeric;
  v_kept numeric := 0;
  v_reason text := '';
  v_back numeric;
  v_me uuid := public.current_app_user_id();
begin
  perform public.require_perm('financeiro.payment');
  r := public.reservation_lock(p_id);
  if not (r.state = any (public.reservation_states('closed'))) then
    raise exception 'ESTADO_INVALIDO';
  end if;
  select m.caucao into v_held from public.reservation_money(r.id) m;
  if v_held <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'amount';
  end if;
  perform public.jenum_check(coalesce(p_method, '') in ('pix', 'credito', 'debito', 'dinheiro', 'link', 'transferencia', 'outro'), 'method');
  if p_retain is not null and jsonb_typeof(p_retain) <> 'null' then
    if jsonb_typeof(p_retain) <> 'object' or jsonb_typeof(p_retain -> 'amount') is distinct from 'number' then
      raise exception 'VALOR_INVALIDO' using detail = 'retainAmount';
    end if;
    v_kept := round((p_retain ->> 'amount')::numeric, 2);
    v_reason := btrim(coalesce(p_retain ->> 'reason', ''));
  end if;
  if v_kept < 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'retainAmount';
  end if;
  if v_kept > v_held + 0.005 then
    raise exception 'VALOR_EXCEDE_SALDO' using detail = 'retainAmount', hint = public.brl(v_held);
  end if;
  if v_kept > 0 and v_reason = '' then
    raise exception 'MOTIVO_OBRIGATORIO' using detail = 'retainReason';
  end if;

  v_back := round(v_held - v_kept, 2);
  if v_back > 0 then
    insert into public.reservation_payment (reservation_id, kind, method, amount, state, paid_at, notes, refers_to, created_by)
    values (r.id, 'estorno', p_method::public.payment_method, v_back, 'pago', now(), 'Devolução da caução', 'caucao', v_me);
  end if;
  if v_kept > 0 then
    -- A parte retida não volta para a cliente: sai da custódia (sem caixa) e entra como receita da loja.
    insert into public.reservation_payment (reservation_id, kind, method, amount, state, paid_at, notes, refers_to, created_by)
    values (r.id, 'estorno', 'outro', v_kept, 'pago', now(), 'Retida pela loja: ' || v_reason, 'caucao', v_me);
    insert into public.receivable (description, category_id, reservation_id, customer_id, amount, paid_amount, due_date,
                                   status, received_at, method, notes, created_by)
    values (
      'Retenção de caução · ' || r.code,
      (select c.id from public.fin_category c where c.system_key = 'locacao'),
      r.id, r.customer_id, v_kept, v_kept, public.store_today(), 'pago', now(),
      coalesce((select p.method from public.reservation_payment p
                 where p.reservation_id = r.id and p.kind = 'caucao' and p.state = 'pago' order by p.seq limit 1),
               p_method::public.payment_method),
      v_reason, v_me
    );
  end if;
  return public.reservation_json(r.id);
end
$$;

-- Privilégios ---------------------------------------------------------------
revoke all on function public.reservation_input_check(jsonb) from public, anon, authenticated;
revoke all on function public.reservation_input_lines(jsonb) from public, anon, authenticated;
revoke all on function public.reservation_input_refs(jsonb) from public, anon, authenticated;
revoke all on function public.reservation_fitting_to_convert(jsonb, uuid, uuid) from public, anon, authenticated;
revoke all on function public.reservation_discount_exception(uuid, numeric, numeric, uuid) from public, anon, authenticated;
revoke all on function public.reservation_apply_input(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.reservation_order_discount(uuid) from public, anon, authenticated;
revoke all on function public.reservation_discount_perm(numeric, numeric) from public, anon, authenticated;
revoke all on function public.reservation_release(uuid, public.reservation_state, text) from public, anon, authenticated;
revoke all on function public.reservation_lock_garments(uuid) from public, anon, authenticated;
revoke all on function public.customer_stats(uuid) from public, anon, authenticated;
revoke all on function public.appointment_reservation_json(uuid, public.appointment_kind) from public, anon, authenticated;
revoke all on function public.fitting_reservation_json(uuid) from public, anon, authenticated;
revoke all on function public.reservation_has_garment(uuid, uuid) from public, anon, authenticated;

revoke all on function public.garment_costs(uuid[]) from public, anon;
revoke all on function public.get_settings() from public, anon;
revoke all on function public.list_reservations(text, int, int) from public, anon;
revoke all on function public.reservation_summary() from public, anon;
revoke all on function public.get_reservation(uuid) from public, anon;
revoke all on function public.check_availability(uuid[], date, date, uuid) from public, anon;
revoke all on function public.reservation_alternatives(uuid, date, date) from public, anon;
revoke all on function public.reservations_of_customer(uuid) from public, anon;
revoke all on function public.reservations_of_garment(uuid) from public, anon;
revoke all on function public.create_reservation_draft(jsonb, uuid) from public, anon;
revoke all on function public.update_reservation_draft(uuid, jsonb, uuid) from public, anon;
revoke all on function public.add_reservation_draft_item(uuid, uuid) from public, anon;
revoke all on function public.remove_reservation_draft_item(uuid, uuid) from public, anon;
revoke all on function public.sign_reservation_contract(uuid, jsonb) from public, anon;
revoke all on function public.confirm_reservation(uuid, jsonb, uuid) from public, anon;
revoke all on function public.mark_reservation_ready(uuid) from public, anon;
revoke all on function public.pickup_reservation_items(uuid, jsonb, uuid) from public, anon;
revoke all on function public.return_reservation_items(uuid, jsonb) from public, anon;
revoke all on function public.cancel_reservation(uuid, text) from public, anon;
revoke all on function public.mark_reservation_no_show(uuid) from public, anon;
revoke all on function public.register_reservation_payment(uuid, jsonb) from public, anon;
revoke all on function public.return_reservation_deposit(uuid, text, jsonb) from public, anon;

grant execute on function public.garment_costs(uuid[]) to authenticated;
grant execute on function public.get_settings() to authenticated;
grant execute on function public.list_reservations(text, int, int) to authenticated;
grant execute on function public.reservation_summary() to authenticated;
grant execute on function public.get_reservation(uuid) to authenticated;
grant execute on function public.check_availability(uuid[], date, date, uuid) to authenticated;
grant execute on function public.reservation_alternatives(uuid, date, date) to authenticated;
grant execute on function public.reservations_of_customer(uuid) to authenticated;
grant execute on function public.reservations_of_garment(uuid) to authenticated;
grant execute on function public.create_reservation_draft(jsonb, uuid) to authenticated;
grant execute on function public.update_reservation_draft(uuid, jsonb, uuid) to authenticated;
grant execute on function public.add_reservation_draft_item(uuid, uuid) to authenticated;
grant execute on function public.remove_reservation_draft_item(uuid, uuid) to authenticated;
grant execute on function public.sign_reservation_contract(uuid, jsonb) to authenticated;
grant execute on function public.confirm_reservation(uuid, jsonb, uuid) to authenticated;
grant execute on function public.mark_reservation_ready(uuid) to authenticated;
grant execute on function public.pickup_reservation_items(uuid, jsonb, uuid) to authenticated;
grant execute on function public.return_reservation_items(uuid, jsonb) to authenticated;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;
grant execute on function public.mark_reservation_no_show(uuid) to authenticated;
grant execute on function public.register_reservation_payment(uuid, jsonb) to authenticated;
grant execute on function public.return_reservation_deposit(uuid, text, jsonb) to authenticated;

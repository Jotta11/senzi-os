-- Contrato editável na tela: enquanto não assinado, o texto do contrato vigente pode ser trocado pelo editado
-- (edited_at marca a edição). Mudar a reserva regera o contrato (versão nova, texto padrão) e a edição se perde.
-- Quem edita precisa ver o CPF completo (cliente.edit): sem isso o texto chega mascarado e a máscara iria para o contrato.

alter table public.reservation_contract add column edited_at timestamptz;

-- Troca o texto do contrato vigente; p_body null volta ao texto padrão do modelo. → Reservation
create function public.edit_reservation_contract(p_id uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  c public.reservation_contract;
  v_body text := replace(replace(p_body, E'\r\n', E'\n'), E'\r', E'\n');
begin
  perform public.require_perm('reserva.create');
  perform public.require_perm('cliente.edit');
  r := public.reservation_lock(p_id);
  if r.state in ('cancelada', 'no_show') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if p_body is not null and (btrim(v_body, E' \n\t') = '' or length(v_body) > 60000) then
    raise exception 'CONTRATO_TEXTO_INVALIDO' using detail = 'body';
  end if;
  select * into c from public.reservation_contract x where x.reservation_id = r.id order by x.version desc limit 1;
  if c.id is null then
    perform public.reservation_write_contract(r.id);
    select * into c from public.reservation_contract x where x.reservation_id = r.id order by x.version desc limit 1;
  end if;
  if c.signed_at is not null then
    raise exception 'ESTADO_INVALIDO' using detail = 'contract';
  end if;
  if p_body is null then
    if c.edited_at is null then
      return public.reservation_json(r.id);
    end if;
    update public.reservation_contract
       set body_rendered = public.reservation_contract_body(r.id), edited_at = null
     where id = c.id;
    perform public.reservation_log(r.id, null, r.state, 'Contrato v' || c.version || ': texto padrão restaurado');
  else
    update public.reservation_contract
       set body_rendered = v_body, edited_at = clock_timestamp()
     where id = c.id;
    perform public.reservation_log(r.id, null, r.state, 'Contrato v' || c.version || ' editado na tela');
  end if;
  return public.reservation_json(r.id);
end
$$;

revoke all on function public.edit_reservation_contract(uuid, text) from public, anon;
grant execute on function public.edit_reservation_contract(uuid, text) to authenticated;

-- Mesma função de 20261113000200_contrato_modelo.sql, com `editedAt` no contrato.
create or replace function public.reservation_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'customerId', r.customer_id,
    'state', r.state,
    'eventDate', r.event_date,
    'eventType', r.event_type,
    'eventVenue', r.event_venue,
    'pickupDate', r.pickup_date,
    'returnDueDate', r.return_due_date,
    'pickedUpAt', public.store_instant(r.picked_up_at),
    'returnedAt', public.store_instant(r.returned_at),
    'channel', r.channel,
    'totalGross', r.total_gross,
    'discount', r.discount,
    'totalNet', r.total_net,
    'depositAmount', r.deposit_amount,
    'lateFee', r.late_fee,
    'notes', r.notes,
    'cancelReason', r.cancel_reason,
    'createdBy', r.created_by,
    'createdAt', public.store_instant(r.created_at),
    'fittingId', r.fitting_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id,
               'reservationId', i.reservation_id,
               'garmentId', i.garment_id,
               'unitPrice', i.unit_price,
               'grossAmount', i.gross_amount,
               'itemDiscount', i.item_discount,
               'allocatedOrderDiscount', i.allocated_order_discount,
               'netRevenue', i.net_revenue,
               'itemState', i.item_state,
               'pickedUpAt', public.store_instant(i.picked_up_at),
               'returnedAt', public.store_instant(i.returned_at),
               'pickupNote', i.pickup_note,
               'returnNote', i.return_note,
               'alterationNotes', i.alteration_notes
             ) order by i.position)
        from public.reservation_item i
       where i.reservation_id = r.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'reservationId', p.reservation_id,
               'kind', p.kind,
               'method', p.method,
               'amount', p.amount,
               'state', p.state,
               'paidAt', public.store_instant(p.paid_at),
               'dueAt', p.due_at,
               'reference', p.reference,
               'notes', p.notes,
               'refersTo', p.refers_to,
               'createdBy', p.created_by,
               'createdAt', public.store_instant(p.created_at)
             ) order by p.seq)
        from public.reservation_payment p
       where p.reservation_id = r.id
    ), '[]'::jsonb),
    'contract', (
      select jsonb_build_object(
               'id', c.id,
               'reservationId', c.reservation_id,
               'number', c.number,
               'version', c.version,
               'bodyRendered', case when public.has_perm('cliente.edit') then c.body_rendered
                                    else regexp_replace(c.body_rendered, '\d{3}\.(\d{3})\.(\d{3})-\d{2}', '***.\1.\2-**', 'g') end,
               'generatedAt', public.store_instant(c.generated_at),
               'templateVersion', c.template_version,
               'terms', jsonb_build_object('lateFeeDailyPercent', c.late_fee_daily_percent, 'deposit', c.deposit),
               'signedAt', public.store_instant(c.signed_at),
               'signedBy', c.signed_by,
               'signerName', c.signer_name,
               'signatureKind', c.signature_kind,
               'signatureNotes', c.signature_notes,
               'pdfPath', c.pdf_path,
               'editedAt', public.store_instant(c.edited_at)
             )
        from public.reservation_contract c
       where c.reservation_id = r.id
       order by c.version desc
       limit 1
    ),
    'authorizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'reservationId', e.reservation_id,
               'kind', e.kind,
               'amount', e.amount,
               'reason', e.reason,
               'authorizedBy', e.authorized_by,
               'authorizedByName', coalesce(u.full_name, '—'),
               'authorizedByRole', 'Administrador',
               'authorizedAt', public.store_instant(e.created_at),
               'refType', e.ref_type
             ) order by e.consumed_at, e.id)
        from public.exception_authorization e
        left join public.app_user u on u.id = e.authorized_by
       where e.reservation_id = r.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id::text,
               'fromState', h.from_state,
               'toState', h.to_state,
               'reason', h.reason,
               'userId', h.user_id,
               'userName', coalesce(u.full_name, 'Sistema'),
               'occurredAt', public.store_instant(h.occurred_at)
             ) order by h.id)
        from public.reservation_history h
        left join public.app_user u on u.id = h.user_id
       where h.reservation_id = r.id
    ), '[]'::jsonb),
    'balance', (
      select jsonb_build_object('devido', m.devido, 'pago', m.pago, 'caucao', m.caucao, 'due', m.due, 'status', m.status)
        from public.reservation_money(r.id) m
    )
  )
  from public.reservation r
  where r.id = p_id
$$;

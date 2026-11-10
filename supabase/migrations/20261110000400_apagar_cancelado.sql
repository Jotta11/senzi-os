-- Apagar também lançamento já `cancelado` (dos que foram cancelados antes do botão virar "Apagar").
-- Cancelado não conta no saldo, então apagá-lo só remove a linha; o recálculo segue igual.
create or replace function public.delete_reservation_payment(p_payment uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay public.reservation_payment;
  r public.reservation;
  m record;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_label text;
begin
  perform public.require_perm('financeiro.payment');
  if v_reason = '' then
    raise exception 'MOTIVO_OBRIGATORIO' using detail = 'reason';
  end if;
  select * into pay from public.reservation_payment where id = p_payment;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  r := public.reservation_lock(pay.reservation_id);
  select * into pay from public.reservation_payment where id = p_payment for update;
  if pay.state not in ('pago', 'cancelado') or r.state = 'rascunho' then
    raise exception 'ESTADO_INVALIDO';
  end if;

  -- Não deixa o valor recebido (ou a caução em custódia) ficar negativo por já haver estorno em cima dele.
  select * into m from public.reservation_money(r.id);
  if pay.state = 'pago' and ((pay.kind = 'caucao' and m.caucao < pay.amount - 0.005)
     or (pay.kind not in ('caucao', 'estorno') and m.pago < pay.amount - 0.005)) then
    raise exception 'LANCAMENTO_COM_ESTORNO';
  end if;

  v_label := case pay.kind when 'sinal' then 'Sinal' when 'saldo' then 'Saldo' when 'integral' then 'Integral'
                           when 'caucao' then 'Caução' when 'multa' then 'Multa' else 'Estorno' end
             || ' de ' || public.brl(pay.amount) || ' (' || public.payment_method_label(pay.method::text) || ')';

  delete from public.reservation_payment where id = pay.id;

  perform public.reservation_sync_pending(r.id, null, null);
  if not (r.state = any (public.reservation_states('no_receivable'))) then
    select * into m from public.reservation_money(r.id);
    if m.target_saldo > 0 and not exists (
      select 1 from public.reservation_payment where reservation_id = r.id and kind = 'saldo' and state = 'pendente'
    ) then
      insert into public.reservation_payment (reservation_id, kind, method, amount, state, due_at, created_by)
      values (r.id, 'saldo', pay.method, m.target_saldo, 'pendente', r.pickup_date, public.current_app_user_id());
    end if;
    if m.target_multa > 0 and not exists (
      select 1 from public.reservation_payment where reservation_id = r.id and kind = 'multa' and state = 'pendente'
    ) then
      insert into public.reservation_payment (reservation_id, kind, method, amount, state, due_at, created_by)
      values (r.id, 'multa', pay.method, m.target_multa, 'pendente', public.store_today(), public.current_app_user_id());
    end if;
  end if;

  perform public.reservation_log(r.id, null, r.state, 'Lançamento apagado: ' || v_label || '. Motivo: ' || v_reason);
  return public.reservation_json(r.id);
end
$$;


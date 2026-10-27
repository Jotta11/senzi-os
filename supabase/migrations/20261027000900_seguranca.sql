-- =====================================================================
-- Senzi OS · Correções da auditoria de segurança
--
-- 1. Preço da peça vem do banco: o rascunho ignora o `unitPrice` recebido e usa o preço já congelado do
--    item (peça que já estava no rascunho) ou o preço de locação da peça (item novo). A tela nunca deixou
--    editar o preço; sem isso, quem cria rascunho baixava o preço sem passar pelo limite de desconto.
-- 2. Exceção com valor: authorize_exception grava `max_amount` (obrigatório para desconto acima do limite,
--    opcional nos outros tipos). Usar a exceção para um valor maior que o autorizado falha com o mesmo
--    erro de quando não há exceção (DESCONTO_ACIMA_LIMITE, SINAL_INSUFICIENTE, SALDO_EM_ABERTO).
-- 3. PIN: além de 5 erros em 15 min, 10 erros em 24 h desde o último acerto bloqueiam o PIN até a
--    administradora trocá-lo (set_my_pin zera as contagens).
-- 4. Storage `pecas-fotos`: envio só para `<id de peça existente>/<arquivo>`; apagar só arquivo que não está
--    registrado como foto (o app apaga o registro antes do arquivo); nome de arquivo não começa com ponto.
-- 5. Clientes: as referências são validadas antes do CPF repetido (fecha o oráculo de CPF); a auditoria
--    guarda o CPF mascarado (`***XXXXXX**`, como customer_json sem cliente.edit).
-- =====================================================================

-- 1. Preço da peça ------------------------------------------------------------------

-- Troca o `unitPrice` de cada item pelo preço do banco: o congelado no item que a peça já tem no rascunho
-- `p_reservation`, ou o preço de locação da peça. Item malformado ou peça inexistente fica como veio
-- (reservation_input_check / reservation_input_refs recusam depois, com os mesmos erros de antes).
create function public.reservation_input_priced(p jsonb, p_reservation uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p) = 'object' and jsonb_typeof(p -> 'items') = 'array' then
      jsonb_set(p, '{items}', coalesce((
        select jsonb_agg(
                 case
                   when jsonb_typeof(x.it -> 'unitPrice') = 'number' and (x.it ->> 'unitPrice')::numeric >= 0
                        and pr.price is not null
                   then jsonb_set(x.it, '{unitPrice}', to_jsonb(pr.price))
                   else x.it
                 end
                 order by x.ord)
          from jsonb_array_elements(p -> 'items') with ordinality as x (it, ord)
          left join lateral (
            select coalesce(
                     (select i.unit_price from public.reservation_item i
                       where i.reservation_id = p_reservation and i.garment_id = g.id),
                     g.rental_price) as price
              from public.garment g
             where jsonb_typeof(x.it) = 'object' and g.id = public.try_uuid(x.it ->> 'garmentId')
          ) pr on true
      ), '[]'::jsonb))
    else p
  end
$$;

-- Cria o rascunho (conflitos de agenda não bloqueiam; rascunho não cria bloco). Gera o código
-- RS-<ano>-NNNN e o contrato v1; com fittingId, converte a prova. Preço de cada peça = preço de locação. → Reservation
create or replace function public.create_reservation_draft(p jsonb, p_exception uuid)
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
  p := public.reservation_input_priced(p, null);
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

-- Edita o rascunho (só `rascunho`) e regera o contrato (versão + 1). Peça que já estava mantém o preço
-- congelado; peça nova entra pelo preço de locação. → Reservation
create or replace function public.update_reservation_draft(p_id uuid, p jsonb, p_exception uuid)
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
  p := public.reservation_input_priced(p, r.id);
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

-- 2. Exceção com valor autorizado ---------------------------------------------------

alter table public.exception_authorization
  add column max_amount numeric(12, 2) check (max_amount is null or max_amount >= 0);

-- 3. PIN: teto de 24 h ----------------------------------------------------------------

-- `p_max_amount`: valor máximo que a exceção cobre (o desconto pedido, o sinal dispensado, o saldo em aberto).
-- Obrigatório e > 0 para `desconto_acima_limite`; opcional (null) nos outros tipos. Inválido → PARAMETRO_INVALIDO (maxAmount).
drop function public.authorize_exception(text, text, text, text, text, uuid);

create function public.authorize_exception(
  p_admin_email text,
  p_pin text,
  p_kind text,
  p_reason text,
  p_ref_type text,
  p_ref_id uuid,
  p_max_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Hash bcrypt de um valor qualquer: comparar contra ele quando o admin não existe
  -- iguala o tempo de resposta e não revela quais e-mails são de admins.
  c_dummy_hash constant text := '$2a$06$Y2wwxQQm0v6SM0YUGgzI1enYPcaDin7DzNnYY5QNLKuZnJphfQzTS';
  v_me uuid := public.current_app_user_id();
  v_user public.app_user%rowtype;
  v_eligible boolean;
  v_last_ok bigint;
  v_failures int;
  v_locked boolean;
  v_ok boolean;
  v_id uuid;
begin
  if v_me is null then
    raise exception 'SEM_PERMISSAO';
  end if;

  if p_kind is null
     or p_kind not in ('retirada_com_saldo', 'desconto_acima_limite', 'dispensa_sinal_minimo') then
    raise exception 'PARAMETRO_INVALIDO';
  end if;

  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'MOTIVO_OBRIGATORIO';
  end if;

  if (p_max_amount is not null and p_max_amount < 0)
     or (p_kind = 'desconto_acima_limite' and (p_max_amount is null or p_max_amount <= 0)) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'maxAmount';
  end if;

  select * into v_user from public.app_user where email = p_admin_email;

  if v_user.id is null then
    perform extensions.crypt(coalesce(p_pin, ''), c_dummy_hash);
    return jsonb_build_object('ok', false, 'error', 'AUTORIZACAO_INVALIDA');
  end if;

  -- Serializa tentativas simultâneas contra o mesmo admin: sem isso, chamadas
  -- paralelas leriam a mesma contagem e passariam do limite.
  perform pg_advisory_xact_lock(hashtext('pin_attempt'), hashtext(v_user.id::text));

  -- Último acerto (a troca de PIN em set_my_pin também conta como acerto).
  v_last_ok := coalesce(
    (select max(s.id) from public.pin_attempt s where s.admin_id = v_user.id and s.ok),
    0
  );

  -- Bloqueio curto: 5 falhas em 15 min desde o último acerto.
  select count(*) into v_failures
    from public.pin_attempt a
   where a.admin_id = v_user.id
     and not a.ok
     and a.id > v_last_ok
     and a.at > now() - interval '15 minutes';

  -- Bloqueio longo: 10 falhas dentro de 24 h, desde o último acerto. Não expira sozinho: só a troca do PIN libera.
  select exists (
    select 1
      from public.pin_attempt a
     where a.admin_id = v_user.id and not a.ok and a.id > v_last_ok
       and (select count(*)
              from public.pin_attempt b
             where b.admin_id = v_user.id and not b.ok and b.id > v_last_ok
               and b.id <= a.id and b.at > a.at - interval '24 hours') >= 10
  ) into v_locked;

  if v_failures >= 5 or v_locked then
    -- Não registra: tentativas durante o bloqueio não o prolongam.
    return jsonb_build_object('ok', false, 'error', 'PIN_BLOQUEADO');
  end if;

  v_eligible := v_user.role = 'admin'
    and v_user.is_active
    and v_user.pin_hash is not null
    and not exists (
      select 1 from public.user_permission_override o
       where o.user_id = v_user.id and o.permission_key = 'reserva.authorize' and not o.granted
    );

  v_ok := extensions.crypt(coalesce(p_pin, ''), coalesce(v_user.pin_hash, c_dummy_hash))
            = coalesce(v_user.pin_hash, c_dummy_hash)
          and v_eligible;

  insert into public.pin_attempt (admin_id, ok) values (v_user.id, v_ok);

  if not v_ok then
    return jsonb_build_object('ok', false, 'error', 'AUTORIZACAO_INVALIDA');
  end if;

  insert into public.exception_authorization (kind, reason, ref_type, ref_id, requested_by, authorized_by, max_amount)
  values (p_kind, btrim(p_reason), p_ref_type, p_ref_id, v_me, v_user.id, round(p_max_amount, 2))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

revoke all on function public.authorize_exception(text, text, text, text, text, uuid, numeric) from public, anon;
grant execute on function public.authorize_exception(text, text, text, text, text, uuid, numeric) to authenticated;

-- Troca do PIN: grava o hash e registra um acerto, o que zera as contagens de falha (inclusive o bloqueio de 24 h).
create or replace function public.set_my_pin(p_pin text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := public.current_app_user_id();
begin
  if v_me is null or not exists (
    select 1 from public.app_user where id = v_me and role = 'admin'
  ) then
    raise exception 'SEM_PERMISSAO';
  end if;

  if p_pin is null or p_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN_INVALIDO';
  end if;

  update public.app_user
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf'))
   where id = v_me;

  perform pg_advisory_xact_lock(hashtext('pin_attempt'), hashtext(v_me::text));
  insert into public.pin_attempt (admin_id, ok) values (v_me, true);
end
$$;

-- Exceção utilizável (usableException): existe, é do tipo pedido, não foi usada, foi pedida por quem
-- está usando e aponta para esta reserva (`reserva`) ou para um rascunho ainda sem id
-- (`reserva_rascunho`, só se p_draft). Desconto sem valor autorizado (criada antes do valor existir) não vale.
-- Devolve o id ou null. Trava a linha.
create or replace function public.reservation_exception_usable(p_exc uuid, p_kind text, p_reservation uuid, p_draft boolean)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.exception_authorization;
begin
  if p_exc is null then
    return null;
  end if;
  select * into e from public.exception_authorization where id = p_exc for update;
  if not found or e.kind <> p_kind or e.consumed_at is not null
     or e.requested_by is distinct from public.current_app_user_id()
     or (e.kind = 'desconto_acima_limite' and e.max_amount is null) then
    return null;
  end if;
  if e.ref_type = 'reserva_rascunho' then
    return case when p_draft then e.id end;
  end if;
  return case when p_reservation is not null and e.ref_id = p_reservation then e.id end;
end
$$;

-- Grava o uso da exceção (consumeException): valor, vínculo com a reserva e entrada no histórico.
-- Valor acima do autorizado (max_amount) → o mesmo erro de quando não há exceção; a transação desfaz tudo.
create or replace function public.reservation_exception_consume(p_exc uuid, p_reservation uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  e public.exception_authorization;
  v_reason text;
  v_state public.reservation_state;
  v_min numeric;
begin
  select * into e from public.exception_authorization where id = p_exc;
  if e.max_amount is not null and round(p_amount, 2) > e.max_amount + 0.005 then
    if e.kind = 'desconto_acima_limite' then
      raise exception 'DESCONTO_ACIMA_LIMITE' using detail = 'discount';
    elsif e.kind = 'dispensa_sinal_minimo' then
      select round(r.total_net * s.min_signal_percent / 100, 2) into v_min
        from public.reservation r, public.app_settings s
       where r.id = p_reservation and s.id;
      raise exception 'SINAL_INSUFICIENTE' using detail = 'amount', hint = public.brl(v_min);
    else
      raise exception 'SALDO_EM_ABERTO' using hint = public.brl(round(p_amount, 2));
    end if;
  end if;
  update public.exception_authorization
     set reservation_id = p_reservation, ref_type = 'reserva', ref_id = p_reservation,
         amount = round(p_amount, 2), consumed_at = now()
   where id = p_exc;
  select 'Exceção autorizada: ' || coalesce(nullif(e2.reason, ''), e2.kind) || ' (' || coalesce(u.full_name, '—') || ')'
    into v_reason
    from public.exception_authorization e2
    left join public.app_user u on u.id = e2.authorized_by
   where e2.id = p_exc;
  select state into v_state from public.reservation where id = p_reservation;
  perform public.reservation_log(p_reservation, null, v_state, v_reason);
end
$$;

-- 4. Storage `pecas-fotos` --------------------------------------------------------------

-- Envio: pasta = id de peça existente (e quem envia edita o acervo). Recebe (storage.foldername(name))[1].
-- Executável por authenticated porque as policies rodam com o papel de quem chama; só responde
-- "sim" a quem tem acervo.edit, então não serve para sondar ids de peça.
create function public.pecas_fotos_folder_ok(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_perm('acervo.edit')
     and exists (select 1 from public.garment g where g.id = public.try_uuid(p_folder))
$$;

-- Exclusão: só arquivo que não está registrado como foto de peça nem de inspeção (o app apaga o registro antes).
create function public.pecas_fotos_unregistered(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_perm('acervo.edit')
     and not exists (select 1 from public.garment_photo f where f.storage_path = p_name)
     and not exists (select 1 from public.inspection_photo f where f.storage_path = p_name)
$$;

revoke all on function public.pecas_fotos_folder_ok(text) from public, anon;
revoke all on function public.pecas_fotos_unregistered(text) from public, anon;
grant execute on function public.pecas_fotos_folder_ok(text) to authenticated;
grant execute on function public.pecas_fotos_unregistered(text) to authenticated;

drop policy pecas_fotos_insert on storage.objects;
drop policy pecas_fotos_delete on storage.objects;

create policy pecas_fotos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'pecas-fotos'
    and coalesce(array_length(storage.foldername(name), 1), 0) = 1
    and (select public.pecas_fotos_folder_ok((storage.foldername(name))[1]))
  );

create policy pecas_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pecas-fotos' and public.pecas_fotos_unregistered(name));

-- Registra uma foto já enviada ao bucket `pecas-fotos` em `<p_garment>/<arquivo>` (arquivo não começa com ponto).
-- Máximo de 10 por peça (src/data/validation.ts → MAX_PHOTOS); a primeira vira capa. → Garment
create or replace function public.add_garment_photo(p_garment uuid, p_kind public.photo_kind, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  perform public.require_perm('acervo.edit');
  perform public.garment_must_exist(p_garment);
  if p_kind is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'kind';
  end if;
  if p_path is null or p_path !~ ('^' || p_garment::text || '/[A-Za-z0-9_-][A-Za-z0-9._-]*$') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'file';
  end if;
  perform 1 from public.garment where id = p_garment for update;
  select count(*) into v_count from public.garment_photo where garment_id = p_garment;
  if v_count >= 10 then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'photos';
  end if;
  insert into public.garment_photo (garment_id, kind, storage_path, position, is_cover, created_by)
  values (
    p_garment, p_kind, p_path,
    coalesce((select max(position) + 1 from public.garment_photo where garment_id = p_garment), 0),
    v_count = 0,
    public.current_app_user_id()
  );
  return public.garment_json(p_garment);
end
$$;

-- 5. Clientes -------------------------------------------------------------------------

-- Problemas da cliente, na ordem do formulário (customerIssues); levanta o primeiro.
-- `p_partial`: só os campos enviados. Depois: modelo ideal inexistente e enums e, por último, CPF repetido —
-- assim só uma entrada inteiramente válida descobre se o CPF já existe (e, no create, cria a cliente).
create or replace function public.customer_validate(p jsonb, p_partial boolean, p_self uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_birth date;
  v_pref jsonb := p -> 'preferences';
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if (not p_partial or p ? 'fullName') and length(coalesce(public.jtext(p, 'fullName'), '')) < 3 then
    raise exception 'NOME_CLIENTE_OBRIGATORIO' using detail = 'fullName';
  end if;
  if (not p_partial or p ? 'phone')
     and length(regexp_replace(coalesce(public.jtext(p, 'phone'), ''), '\D', '', 'g')) not between 10 and 11 then
    raise exception 'TELEFONE_INVALIDO' using detail = 'phone';
  end if;
  if not p_partial or p ? 'birthDate' then
    v_birth := public.try_iso_date(public.jtext(p, 'birthDate'));
    if v_birth is null or v_birth > public.store_today() then
      raise exception 'NASCIMENTO_INVALIDO' using detail = 'birthDate';
    end if;
  end if;
  if (not p_partial or p ? 'cpf') and not public.is_valid_cpf(public.jtext(p, 'cpf')) then
    raise exception 'CPF_INVALIDO' using detail = 'cpf';
  end if;
  if coalesce(public.jtext(p, 'email'), '') <> '' and public.jtext(p, 'email') !~* '^[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}$' then
    raise exception 'EMAIL_INVALIDO' using detail = 'email';
  end if;
  if jsonb_typeof(p -> 'measurement') = 'object' then
    perform public.customer_measurement_check(p -> 'measurement');
  elsif p ? 'measurement' and jsonb_typeof(p -> 'measurement') <> 'null' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'measurement';
  end if;

  if coalesce(public.jtext(p, 'idealGarmentId'), '') <> ''
     and not exists (select 1 from public.garment where id = public.try_uuid(public.jtext(p, 'idealGarmentId'))) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'idealGarmentId';
  end if;
  if public.jtext(p, 'leadSource') is not null then
    perform public.jenum_check(public.jtext(p, 'leadSource') in (select unnest(enum_range(null::public.lead_source))::text), 'leadSource');
  end if;
  if p ? 'vip' and jsonb_typeof(p -> 'vip') not in ('boolean', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'vip';
  end if;
  if v_pref is not null and jsonb_typeof(v_pref) <> 'null' then
    if jsonb_typeof(v_pref) <> 'object' then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'preferences';
    end if;
    perform public.jtext_array(v_pref, 'preferredColors');
    perform public.jtext_array(v_pref, 'avoidedColors');
    perform public.jenum_check(
      public.jtext_array(v_pref, 'preferredLengths') <@ array(select unnest(enum_range(null::public.garment_length))::text),
      'preferredLengths'
    );
  end if;

  if (not p_partial or p ? 'cpf') and exists (
    select 1 from public.customer
     where cpf = regexp_replace(public.jtext(p, 'cpf'), '\D', '', 'g') and id is distinct from p_self
  ) then
    raise exception 'CPF_DUPLICADO' using detail = 'cpf';
  end if;
end
$$;

-- CPF mascarado na auditoria (mesma máscara de customer_json sem cliente.edit).
create function public.audit_mask_cpf(p jsonb)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when jsonb_typeof(p -> 'cpf') = 'string'
      then jsonb_set(p, '{cpf}', to_jsonb('***' || substr(p ->> 'cpf', 4, 6) || '**'))
    else p
  end
$$;

-- row_id = valores da chave primária da tabela auditada, unidos por ':' na ordem da PK
-- (ex.: app_user → '<uuid>'; user_permission_override → '<user_id>:<permission_key>').
-- pin_hash nunca é copiado para before/after; cpf entra mascarado.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before jsonb;
  v_after jsonb;
  v_row jsonb;
  v_row_id text;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_before := to_jsonb(old) - 'pin_hash';
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    v_after := to_jsonb(new) - 'pin_hash';
  end if;
  v_row := coalesce(v_after, v_before);

  select string_agg(v_row ->> a.attname, ':' order by k.ord)
    into v_row_id
    from pg_index i
    cross join lateral unnest(i.indkey::int2[]) with ordinality as k (attnum, ord)
    join pg_attribute a on a.attrelid = i.indrelid and a.attnum = k.attnum
   where i.indrelid = tg_relid
     and i.indisprimary;

  insert into public.audit_log (actor_id, table_name, row_id, action, before, after)
  values (auth.uid(), tg_table_name, coalesce(v_row_id, ''), lower(tg_op),
          public.audit_mask_cpf(v_before), public.audit_mask_cpf(v_after));

  return null;
end
$$;

-- O que já foi gravado com o CPF completo passa a ficar mascarado.
update public.audit_log
   set before = public.audit_mask_cpf(before),
       after = public.audit_mask_cpf(after)
 where table_name = 'customer'
   and (jsonb_typeof(before -> 'cpf') = 'string' or jsonb_typeof(after -> 'cpf') = 'string');

-- Privilégios ---------------------------------------------------------------------------
revoke all on function public.reservation_input_priced(jsonb, uuid) from public, anon, authenticated;
revoke all on function public.audit_mask_cpf(jsonb) from public, anon, authenticated;

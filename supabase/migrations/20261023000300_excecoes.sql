-- =====================================================================
-- Senzi OS · Exceções autorizadas por PIN de administrador
--
-- set_my_pin(p_pin)           admin grava o próprio PIN (bcrypt).
-- list_active_admins()        admins que podem autorizar (para o seletor do diálogo).
-- authorize_exception(...)    atendimento pede, admin autoriza digitando o PIN.
--
-- Contrato de authorize_exception → jsonb:
--   sucesso:  {"ok": true,  "id": "<uuid da exception_authorization>"}
--   falha:    {"ok": false, "error": "AUTORIZACAO_INVALIDA" | "PIN_BLOQUEADO"}
--   Erros de requisição continuam como exceção: MOTIVO_OBRIGATORIO, PARAMETRO_INVALIDO,
--   SEM_PERMISSAO.
-- A falha de autenticação é DEVOLVIDA, não lançada, para que o registro em
-- pin_attempt seja confirmado junto com a transação da chamada (um raise desfaria o
-- insert e o bloqueio por força bruta nunca dispararia).
-- =====================================================================

create table public.exception_authorization (
  id uuid primary key default gen_random_uuid(),
  kind text not null
    check (kind in ('retirada_com_saldo', 'desconto_acima_limite', 'dispensa_sinal_minimo')),
  reason text not null check (btrim(reason) <> ''),
  ref_type text,
  ref_id uuid,
  requested_by uuid references public.app_user (id),
  authorized_by uuid references public.app_user (id),
  created_at timestamptz not null default now()
);

create index exception_authorization_ref_idx on public.exception_authorization (ref_type, ref_id);
create index exception_authorization_requested_by_idx on public.exception_authorization (requested_by);
create index exception_authorization_authorized_by_idx on public.exception_authorization (authorized_by);

create table public.pin_attempt (
  admin_id uuid not null references public.app_user (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null
);

create index pin_attempt_admin_at_idx on public.pin_attempt (admin_id, at desc);

-- set_my_pin -------------------------------------------------------------
create function public.set_my_pin(p_pin text)
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
end
$$;

-- list_active_admins ---------------------------------------------------
-- Admins aptos a autorizar: ativos, com PIN e sem revogação de reserva.authorize.
create function public.list_active_admins()
returns table (id uuid, full_name text, email text)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_app_user_id() is null then
    raise exception 'SEM_PERMISSAO';
  end if;

  return query
    select u.id, u.full_name, u.email
      from public.app_user u
     where u.role = 'admin'
       and u.is_active
       and u.pin_hash is not null
       and not exists (
         select 1 from public.user_permission_override o
          where o.user_id = u.id and o.permission_key = 'reserva.authorize' and not o.granted
       )
     order by u.full_name, u.id;
end
$$;

-- authorize_exception --------------------------------------------------
create function public.authorize_exception(
  p_admin_email text,
  p_pin text,
  p_kind text,
  p_reason text,
  p_ref_type text,
  p_ref_id uuid
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
  v_failures int;
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

  select * into v_user from public.app_user where email = p_admin_email;

  if v_user.id is null then
    perform extensions.crypt(coalesce(p_pin, ''), c_dummy_hash);
    return jsonb_build_object('ok', false, 'error', 'AUTORIZACAO_INVALIDA');
  end if;

  -- Serializa tentativas simultâneas contra o mesmo admin: sem isso, chamadas
  -- paralelas leriam a mesma contagem e passariam do limite de 5.
  perform pg_advisory_xact_lock(hashtext('pin_attempt'), hashtext(v_user.id::text));

  select count(*) into v_failures
    from public.pin_attempt a
   where a.admin_id = v_user.id
     and not a.ok
     and a.at > now() - interval '15 minutes';

  if v_failures >= 5 then
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

  insert into public.exception_authorization (kind, reason, ref_type, ref_id, requested_by, authorized_by)
  values (p_kind, btrim(p_reason), p_ref_type, p_ref_id, v_me, v_user.id)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end
$$;

-- RLS ------------------------------------------------------------------
alter table public.exception_authorization enable row level security;
alter table public.pin_attempt enable row level security;

-- Quem pediu, quem autorizou e quem audita.
create policy exception_authorization_select on public.exception_authorization
  for select to authenticated
  using (
    requested_by = (select public.current_app_user_id())
    or authorized_by = (select public.current_app_user_id())
    or (select public.has_perm('config.audit'))
  );

-- pin_attempt: sem policy e sem grant — só as funções security definer o tocam.

-- Privilégios ----------------------------------------------------------
revoke all on table public.exception_authorization, public.pin_attempt
  from public, anon, authenticated, service_role;
grant select on table public.exception_authorization to authenticated, service_role;
grant select on table public.pin_attempt to service_role;

revoke all on function public.set_my_pin(text) from public, anon;
revoke all on function public.list_active_admins() from public, anon;
revoke all on function public.authorize_exception(text, text, text, text, text, uuid) from public, anon;

grant execute on function public.set_my_pin(text) to authenticated;
grant execute on function public.list_active_admins() to authenticated;
grant execute on function public.authorize_exception(text, text, text, text, text, uuid) to authenticated;

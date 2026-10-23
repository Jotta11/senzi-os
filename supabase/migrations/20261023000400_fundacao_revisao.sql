-- =====================================================================
-- Senzi OS · Fundação: correções da revisão da branch
--
-- I2. Sequência de audit_log sem privilégio para anon/authenticated (o padrão do
--     Supabase concede ALL em sequências novas do public).
-- M1. admin_update_user só escreve o que mudou: app_user apenas se perfil/status
--     mudarem; overrides aplicados como diff (remove chaves ausentes, insere novas,
--     atualiza só valores diferentes). Semântica continua de SUBSTITUIÇÃO.
-- M4. Bloqueio de PIN conta só as falhas posteriores ao último sucesso do admin.
-- M5. admin_update_user serializa na mesma trava consultiva da guarda do último
--     admin; e triggers garantem que sempre reste um usuário ativo com config.users.
-- M6. Sem UPDATE direto de role/is_active pela API: só via admin_update_user.
-- =====================================================================

-- I2. Sequências ------------------------------------------------------------
revoke all on sequence public.audit_log_id_seq from public, anon, authenticated;

-- M6. role/is_active só pela RPC ------------------------------------------
-- O trigger app_user_guard_admins permanece como defesa em profundidade
-- (service_role, SQL direto).
revoke update (role, is_active) on table public.app_user from authenticated;

-- M5. Detentores de config.users ------------------------------------------

-- O usuário teria config.users com o perfil/status dados e os overrides atuais?
create function public.config_users_holder(p_user_id uuid, p_role public.app_role, p_is_active boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(p_is_active, false) and coalesce(
    (select o.granted from public.user_permission_override o
      where o.user_id = p_user_id and o.permission_key = 'config.users'),
    exists (select 1 from public.role_permission rp
             where rp.role = p_role and rp.permission_key = 'config.users')
  )
$$;

-- Usuários ativos com config.users, exceto p_except (null = nenhum excluído).
create function public.config_users_holders_count(p_except uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::int
    from public.app_user u
   where u.id is distinct from p_except
     and public.config_users_holder(u.id, u.role, u.is_active)
$$;

-- app_user: mudança de perfil/status ou exclusão que tira o último detentor.
create function public.app_user_guard_config_users()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'UPDATE'
     and new.role is not distinct from old.role
     and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  if not public.config_users_holder(old.id, old.role, old.is_active) then
    return coalesce(new, old);
  end if;
  if tg_op = 'UPDATE' and public.config_users_holder(new.id, new.role, new.is_active) then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('app_user_admins'));
  if public.config_users_holders_count(old.id) = 0 then
    raise exception 'ULTIMO_ADMIN';
  end if;

  return coalesce(new, old);
end
$$;

create trigger app_user_guard_config_users
before update of role, is_active or delete on public.app_user
for each row execute function public.app_user_guard_config_users();

-- user_permission_override: mudança na chave config.users que tira o último detentor.
create function public.user_permission_override_guard_config_users()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user public.app_user%rowtype;
  v_was boolean;
begin
  if coalesce(new.permission_key, '') <> 'config.users'
     and coalesce(old.permission_key, '') <> 'config.users' then
    return null;
  end if;

  -- Cascata da exclusão de app_user: a linha já se foi e a guarda de app_user decidiu.
  select * into v_user from public.app_user where id = coalesce(old.user_id, new.user_id);
  if v_user.id is null or not v_user.is_active then
    return null;
  end if;

  if tg_op = 'INSERT' then
    v_was := exists (select 1 from public.role_permission rp
                      where rp.role = v_user.role and rp.permission_key = 'config.users');
  else
    v_was := old.permission_key = 'config.users' and old.granted;
  end if;

  if not v_was or public.config_users_holder(v_user.id, v_user.role, v_user.is_active) then
    return null;
  end if;

  perform pg_advisory_xact_lock(hashtext('app_user_admins'));
  if public.config_users_holders_count(null) = 0 then
    raise exception 'ULTIMO_ADMIN';
  end if;

  return null;
end
$$;

create trigger user_permission_override_guard_config_users
after insert or update or delete on public.user_permission_override
for each row execute function public.user_permission_override_guard_config_users();

revoke all on function public.config_users_holder(uuid, public.app_role, boolean) from public, anon, authenticated;
revoke all on function public.config_users_holders_count(uuid) from public, anon, authenticated;
revoke all on function public.app_user_guard_config_users() from public, anon, authenticated;
revoke all on function public.user_permission_override_guard_config_users() from public, anon, authenticated;

-- M1 + M5. admin_update_user ----------------------------------------------
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_role public.app_role,
  p_is_active boolean,
  p_overrides jsonb
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Mesma trava da guarda do último admin, antes de ler permissões: dois admins não
  -- conseguem tirar config.users um do outro em paralelo (o segundo espera o commit do
  -- primeiro e reavalia has_perm com um snapshot novo).
  perform pg_advisory_xact_lock(hashtext('app_user_admins'));

  if not public.has_perm('config.users') then
    raise exception 'SEM_PERMISSAO';
  end if;

  if p_role is null or p_is_active is null then
    raise exception 'PARAMETRO_INVALIDO';
  end if;

  if p_overrides is not null then
    if jsonb_typeof(p_overrides) <> 'object' then
      raise exception 'PARAMETRO_INVALIDO';
    end if;
    if exists (
      select 1 from jsonb_each(p_overrides) e
      where jsonb_typeof(e.value) <> 'boolean'
         or not exists (select 1 from public.permission p where p.key = e.key)
    ) then
      raise exception 'PARAMETRO_INVALIDO';
    end if;
  end if;

  if not exists (select 1 from public.app_user where id = p_user_id) then
    raise exception 'USUARIO_NAO_ENCONTRADO';
  end if;

  if p_user_id = auth.uid() then
    if exists (
      select 1 from public.app_user
      where id = p_user_id and (role <> p_role or is_active <> p_is_active)
    ) then
      raise exception 'AUTO_REBAIXAMENTO';
    end if;
    -- Antes de aplicar, para que a recusa seja AUTO_REBAIXAMENTO e não ULTIMO_ADMIN.
    if p_overrides is not null and not coalesce(
      (p_overrides ->> 'config.users')::boolean,
      exists (select 1 from public.role_permission rp
               where rp.role = p_role and rp.permission_key = 'config.users')
    ) then
      raise exception 'AUTO_REBAIXAMENTO';
    end if;
  end if;

  -- Só grava (e audita) quando algo muda. Os triggers app_user_guard_* aplicam ULTIMO_ADMIN.
  update public.app_user
     set role = p_role,
         is_active = p_is_active
   where id = p_user_id
     and (role, is_active) is distinct from (p_role, p_is_active);

  if p_overrides is not null then
    delete from public.user_permission_override o
     where o.user_id = p_user_id
       and not (p_overrides ? o.permission_key);

    insert into public.user_permission_override as o (user_id, permission_key, granted)
    select p_user_id, e.key, (e.value)::boolean
      from jsonb_each(p_overrides) e
    on conflict (user_id, permission_key) do update
      set granted = excluded.granted
      where o.granted is distinct from excluded.granted;
  end if;

  -- Rede de segurança: quem gerencia usuários não pode tirar de si mesmo essa capacidade.
  if p_user_id = auth.uid() and not public.has_perm('config.users') then
    raise exception 'AUTO_REBAIXAMENTO';
  end if;
end
$$;

-- M4. Bloqueio de PIN -------------------------------------------------------
-- Ordem total das tentativas (now() é igual dentro da mesma transação).
alter table public.pin_attempt add column id bigint generated always as identity;
revoke all on sequence public.pin_attempt_id_seq from public, anon, authenticated;

create or replace function public.authorize_exception(
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

  -- Falhas na janela de 15 min, contadas a partir do último sucesso desse admin.
  select count(*) into v_failures
    from public.pin_attempt a
   where a.admin_id = v_user.id
     and not a.ok
     and a.at > now() - interval '15 minutes'
     and a.id > coalesce(
       (select max(s.id) from public.pin_attempt s where s.admin_id = v_user.id and s.ok),
       0
     );

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

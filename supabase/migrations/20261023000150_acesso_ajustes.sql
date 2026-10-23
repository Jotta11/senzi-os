-- =====================================================================
-- Senzi OS · Acesso: ajustes de revisão da migration 20261023000100
--
-- a. Guarda do último admin sem deadlock (trava consultiva em vez de FOR UPDATE).
-- b. Guarda do último admin também no DELETE (cascata de auth.users).
-- c. Auto-revogação de config.users por substituição de overrides é recusada.
-- d. Chave de override desconhecida → PARAMETRO_INVALIDO (não erro bruto de FK).
-- f. Comentário de equivalência da fórmula em my_permissions.
-- +  pin_hash deixa de ser legível pela API (grant de select por coluna).
-- =====================================================================

-- f. my_permissions ----------------------------------------------------
create or replace function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  -- (perfil − revogadas) ∪ concedidas = (perfil ∪ concedidas) − revogadas, pois a PK
  -- (user_id, permission_key) torna concessão e revogação da mesma chave mutuamente exclusivas.
  with me as (
    select u.id, u.role
    from public.app_user u
    where u.id = auth.uid()
      and u.is_active
  )
  select rp.permission_key
  from me
  join public.role_permission rp on rp.role = me.role
  where not exists (
    select 1
    from public.user_permission_override o
    where o.user_id = me.id
      and o.permission_key = rp.permission_key
      and not o.granted
  )
  union
  select o.permission_key
  from me
  join public.user_permission_override o on o.user_id = me.id
  where o.granted
$$;

-- a. Último admin no UPDATE -------------------------------------------
-- Uma única trava consultiva por transação serializa quem pode reduzir o conjunto de
-- admins ativos. Não há ordem de travas de linha a disputar, logo não há deadlock; em
-- READ COMMITTED a contagem (nova instrução, novo snapshot) já vê o commit anterior.
create or replace function public.app_user_guard_admins()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
begin
  if new.role is not distinct from old.role and new.is_active is not distinct from old.is_active then
    return new;
  end if;

  if old.id = auth.uid() then
    raise exception 'AUTO_REBAIXAMENTO';
  end if;

  if old.role = 'admin' and old.is_active and not (new.role = 'admin' and new.is_active) then
    perform pg_advisory_xact_lock(hashtext('app_user_admins'));

    select count(*)
      into v_remaining
      from public.app_user u
     where u.role = 'admin'
       and u.is_active
       and u.id <> old.id;

    if v_remaining = 0 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  return new;
end
$$;

-- b. Último admin no DELETE -------------------------------------------
create function public.app_user_guard_admins_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_remaining int;
begin
  if old.role = 'admin' and old.is_active then
    perform pg_advisory_xact_lock(hashtext('app_user_admins'));

    select count(*)
      into v_remaining
      from public.app_user u
     where u.role = 'admin'
       and u.is_active
       and u.id <> old.id;

    if v_remaining = 0 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  return old;
end
$$;

create trigger app_user_guard_admins_delete
before delete on public.app_user
for each row execute function public.app_user_guard_admins_delete();

revoke all on function public.app_user_guard_admins_delete() from public, anon, authenticated;

-- c + d. admin_update_user ---------------------------------------------
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
  end if;

  -- Os triggers app_user_guard_admins* aplicam ULTIMO_ADMIN.
  update public.app_user
     set role = p_role,
         is_active = p_is_active
   where id = p_user_id;

  if p_overrides is not null then
    delete from public.user_permission_override where user_id = p_user_id;

    insert into public.user_permission_override (user_id, permission_key, granted)
    select p_user_id, e.key, (e.value)::boolean
    from jsonb_each(p_overrides) e;
  end if;

  -- Cobre revogação explícita ({"config.users": false}) e remoção de concessão ({}):
  -- quem gerencia usuários não pode tirar de si mesmo essa capacidade.
  if p_user_id = auth.uid() and not public.has_perm('config.users') then
    raise exception 'AUTO_REBAIXAMENTO';
  end if;
end
$$;

-- pin_hash fora do alcance da API ---------------------------------------
-- Com select de tabela inteira, quem tem config.users leria hashes bcrypt de PINs de
-- 4–6 dígitos, quebráveis offline em segundos. Select passa a ser por coluna:
-- clientes devem listar as colunas (sem `select *`).
revoke select on table public.app_user from authenticated;
grant select (id, full_name, email, role, is_active, created_at, updated_at)
  on table public.app_user to authenticated;

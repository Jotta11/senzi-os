-- =====================================================================
-- Senzi OS · Acesso: usuários, perfis, permissões e RLS
--
-- Regra única: public.has_perm(chave). Toda policy e toda RPC pergunta a ela.
-- Permissões efetivas = (permissões do perfil ∪ concedidas ao usuário) − revogadas dele.
-- Usuário inativo (ou sem sessão) não tem permissão alguma e não enxerga linhas.
--
-- Dependências do Supabase (já existentes no projeto real; nos testes vêm do shim
-- supabase/tests/shims/auth.sql): schema auth, auth.users, auth.uid(),
-- papéis anon / authenticated / service_role.
-- =====================================================================

-- Extensões ------------------------------------------------------------
-- No Supabase as extensões vivem no schema `extensions` (pgcrypto já vem instalada lá).
-- Usar sempre nomes qualificados (ex.: extensions.crypt) em funções security definer.
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Tipos e tabelas ------------------------------------------------------
create type public.app_role as enum ('admin', 'atendimento');

create table public.permission (
  key text primary key,
  label text not null
);

create table public.role_permission (
  role public.app_role not null,
  permission_key text not null references public.permission (key) on update cascade on delete cascade,
  primary key (role, permission_key)
);

create table public.app_user (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null unique,
  role public.app_role not null default 'atendimento',
  is_active boolean not null default true,
  pin_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_user_active_admin_idx on public.app_user (id) where role = 'admin' and is_active;

create table public.user_permission_override (
  user_id uuid not null references public.app_user (id) on delete cascade,
  permission_key text not null references public.permission (key) on update cascade on delete cascade,
  granted boolean not null,
  primary key (user_id, permission_key)
);

create index user_permission_override_permission_idx on public.user_permission_override (permission_key);

-- Catálogo -------------------------------------------------------------
-- Espelho exato de src/auth/permissions.ts (teste de sincronia em tests/db/acesso.test.ts).
insert into public.permission (key, label) values
  ('dashboard.view',          'Ver o painel do dia'),
  ('agenda.view',             'Ver a agenda'),
  ('agenda.manage',           'Criar e editar compromissos'),
  ('cliente.view',            'Ver clientes'),
  ('cliente.create',          'Cadastrar cliente'),
  ('cliente.edit',            'Editar cadastro e medidas'),
  ('cliente.note',            'Registrar observações de atendimento'),
  ('acervo.view',             'Ver o acervo'),
  ('acervo.create',           'Cadastrar peça'),
  ('acervo.edit',             'Editar ficha da peça'),
  ('acervo.block',            'Bloquear e liberar peça'),
  ('acervo.cost',             'Ver custo de aquisição e economia da peça'),
  ('prova.view',              'Ver provas'),
  ('prova.manage',            'Agendar e conduzir provas'),
  ('reserva.view',            'Ver reservas'),
  ('reserva.create',          'Criar reserva'),
  ('reserva.confirm',         'Confirmar reserva'),
  ('reserva.cancel',          'Cancelar reserva'),
  ('reserva.pickup',          'Registrar retirada'),
  ('reserva.return',          'Registrar devolução'),
  ('reserva.discount',        'Conceder desconto'),
  ('reserva.authorize',       'Autorizar exceção (retirada com saldo, desconto acima do limite)'),
  ('operacao.view',           'Ver a fila de operação'),
  ('operacao.inspect',        'Registrar inspeção'),
  ('operacao.maintenance',    'Abrir e concluir ordens de serviço'),
  ('operacao.release',        'Liberar peça para o acervo'),
  ('financeiro.view',         'Ver o financeiro das reservas'),
  ('financeiro.payment',      'Lançar pagamento'),
  ('financeiro.consolidated', 'Ver resultado consolidado, margem e investimento'),
  ('financeiro.geral',        'Ver e gerir contas a pagar, a receber e categorias'),
  ('inteligencia.view',       'Ver a inteligência de acervo'),
  ('config.view',             'Abrir configurações'),
  ('config.params',           'Alterar parâmetros de operação'),
  ('config.users',            'Gerenciar usuários e permissões'),
  ('config.audit',            'Ver o histórico de auditoria'),
  ('config.data',             'Exportar e regenerar dados');

-- admin: todas.
insert into public.role_permission (role, permission_key)
select 'admin', key from public.permission;

-- atendimento: união de `atendimento` e `operacao` do protótipo + agenda.manage.
-- Sem acervo.cost, financeiro.consolidated, financeiro.geral, inteligencia.view,
-- reserva.authorize, config.*.
insert into public.role_permission (role, permission_key) values
  ('atendimento', 'dashboard.view'),
  ('atendimento', 'agenda.view'),
  ('atendimento', 'agenda.manage'),
  ('atendimento', 'cliente.view'),
  ('atendimento', 'cliente.create'),
  ('atendimento', 'cliente.edit'),
  ('atendimento', 'cliente.note'),
  ('atendimento', 'acervo.view'),
  ('atendimento', 'acervo.edit'),
  ('atendimento', 'acervo.block'),
  ('atendimento', 'prova.view'),
  ('atendimento', 'prova.manage'),
  ('atendimento', 'reserva.view'),
  ('atendimento', 'reserva.create'),
  ('atendimento', 'reserva.confirm'),
  ('atendimento', 'reserva.cancel'),
  ('atendimento', 'reserva.pickup'),
  ('atendimento', 'reserva.return'),
  ('atendimento', 'reserva.discount'),
  ('atendimento', 'operacao.view'),
  ('atendimento', 'operacao.inspect'),
  ('atendimento', 'operacao.maintenance'),
  ('atendimento', 'operacao.release'),
  ('atendimento', 'financeiro.view'),
  ('atendimento', 'financeiro.payment');

-- Funções de permissão -------------------------------------------------

-- id do usuário da sessão, somente se existir em app_user e estiver ativo; senão null.
create function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select u.id
  from public.app_user u
  where u.id = auth.uid()
    and u.is_active
$$;

create function public.my_permissions()
returns setof text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
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

create function public.has_perm(p text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.my_permissions() k where k = p)
$$;

-- Invariantes de app_user (valem para RPC e para update direto) ----------

create function public.app_user_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger app_user_set_updated_at
before update on public.app_user
for each row execute function public.app_user_set_updated_at();

-- Recusa auto-rebaixamento/auto-desativação e a perda do último admin ativo.
-- security definer para poder travar as linhas de admin independentemente do RLS.
create function public.app_user_guard_admins()
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
    -- Trava todos os admins ativos em ordem determinística: chamadas concorrentes
    -- serializam aqui e a segunda reavalia a contagem depois do commit da primeira.
    select count(*) filter (where s.id <> old.id)
      into v_remaining
      from (
        select u.id
        from public.app_user u
        where u.role = 'admin'
          and u.is_active
        order by u.id
        for update
      ) s;

    if v_remaining = 0 then
      raise exception 'ULTIMO_ADMIN';
    end if;
  end if;

  return new;
end
$$;

create trigger app_user_guard_admins
before update of role, is_active on public.app_user
for each row execute function public.app_user_guard_admins();

-- RPC ------------------------------------------------------------------

-- p_overrides: objeto {"chave.permissao": true|false} que SUBSTITUI os overrides do usuário;
-- null mantém os atuais.
create function public.admin_update_user(
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

  if p_overrides is not null and jsonb_typeof(p_overrides) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
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
    -- Revogar de si mesmo a gestão de usuários também é auto-rebaixamento.
    if p_overrides is not null and (p_overrides -> 'config.users') = 'false'::jsonb then
      raise exception 'AUTO_REBAIXAMENTO';
    end if;
  end if;

  -- O trigger app_user_guard_admins aplica ULTIMO_ADMIN com trava de linhas.
  update public.app_user
     set role = p_role,
         is_active = p_is_active
   where id = p_user_id;

  if p_overrides is not null then
    if exists (
      select 1 from jsonb_each(p_overrides) e where jsonb_typeof(e.value) <> 'boolean'
    ) then
      raise exception 'PARAMETRO_INVALIDO';
    end if;

    delete from public.user_permission_override where user_id = p_user_id;

    insert into public.user_permission_override (user_id, permission_key, granted)
    select p_user_id, e.key, (e.value)::boolean
    from jsonb_each(p_overrides) e;
  end if;
end
$$;

-- RLS ------------------------------------------------------------------
alter table public.permission enable row level security;
alter table public.role_permission enable row level security;
alter table public.app_user enable row level security;
alter table public.user_permission_override enable row level security;

create policy permission_select on public.permission
  for select to authenticated
  using ((select public.current_app_user_id()) is not null);

create policy role_permission_select on public.role_permission
  for select to authenticated
  using ((select public.current_app_user_id()) is not null);

create policy app_user_select on public.app_user
  for select to authenticated
  using (id = (select public.current_app_user_id()) or (select public.has_perm('config.users')));

create policy app_user_update on public.app_user
  for update to authenticated
  using ((select public.has_perm('config.users')))
  with check ((select public.has_perm('config.users')));

create policy user_permission_override_select on public.user_permission_override
  for select to authenticated
  using (user_id = (select public.current_app_user_id()) or (select public.has_perm('config.users')));

-- Privilégios ----------------------------------------------------------
-- O Supabase concede ALL por padrão a anon/authenticated em tabelas novas do public;
-- revogamos tudo e concedemos só o necessário.
revoke all on table public.permission, public.role_permission, public.app_user,
  public.user_permission_override from public, anon, authenticated;

grant select on table public.permission, public.role_permission to authenticated;
grant select on table public.app_user, public.user_permission_override to authenticated;
-- Alteração direta restrita a colunas não sensíveis; pin_hash/email ficam de fora.
-- role/is_active passam pelo trigger de invariantes; overrides só via admin_update_user.
grant update (full_name, role, is_active) on table public.app_user to authenticated;

grant all on table public.permission, public.role_permission, public.app_user,
  public.user_permission_override to service_role;

revoke all on function public.current_app_user_id() from public, anon;
revoke all on function public.my_permissions() from public, anon;
revoke all on function public.has_perm(text) from public, anon;
revoke all on function public.admin_update_user(uuid, public.app_role, boolean, jsonb) from public, anon;
revoke all on function public.app_user_set_updated_at() from public, anon, authenticated;
revoke all on function public.app_user_guard_admins() from public, anon, authenticated;

grant execute on function public.current_app_user_id() to authenticated, service_role;
grant execute on function public.my_permissions() to authenticated, service_role;
grant execute on function public.has_perm(text) to authenticated, service_role;
grant execute on function public.admin_update_user(uuid, public.app_role, boolean, jsonb) to authenticated;

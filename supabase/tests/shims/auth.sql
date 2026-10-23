-- SHIM DE TESTE — carregado apenas por tests/db/harness.ts (PGlite).
-- NUNCA mover para supabase/migrations: no Supabase real o schema `auth`,
-- `auth.users`, `auth.uid()` e os papéis anon/authenticated/service_role já existem.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub',
    ''
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

-- Padrões do Supabase: tudo que for criado em `public` por migrations nasce com ALL para
-- anon/authenticated/service_role (tabelas, funções e sequências). Reproduzido aqui ANTES
-- das migrations para que os testes peguem qualquer objeto que esqueça o revoke explícito.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

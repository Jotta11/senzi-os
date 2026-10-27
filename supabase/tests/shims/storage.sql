-- SHIM DE TESTE — carregado apenas por tests/db/harness.ts (PGlite), depois do shim de auth.
-- NUNCA mover para supabase/migrations: no Supabase real o schema `storage` (buckets, objects,
-- RLS ligado em objects) já existe e é gerenciado pelo próprio Supabase.
-- Só as colunas que as migrations e os testes usam.

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner_id text,
  unique (bucket_id, name)
);

alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

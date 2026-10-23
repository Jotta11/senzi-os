-- =====================================================================
-- Senzi OS · Auditoria
--
-- audit_log é escrito somente pelo trigger genérico public.audit_trigger()
-- (security definer). Nenhum papel da API (anon, authenticated, service_role)
-- insere, altera ou apaga linhas; leitura só com has_perm('config.audit').
--
-- Para auditar uma tabela nova:
--   create trigger <tabela>_audit after insert or update or delete on public.<tabela>
--   for each row execute function public.audit_trigger();
-- =====================================================================

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  table_name text not null,
  row_id text not null,
  action text not null check (action in ('insert', 'update', 'delete')),
  before jsonb,
  after jsonb
);

create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_at_idx on public.audit_log (at desc);

-- row_id = valores da chave primária da tabela auditada, unidos por ':' na ordem da PK
-- (ex.: app_user → '<uuid>'; user_permission_override → '<user_id>:<permission_key>').
-- pin_hash nunca é copiado para before/after.
create function public.audit_trigger()
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
  values (auth.uid(), tg_table_name, coalesce(v_row_id, ''), lower(tg_op), v_before, v_after);

  return null;
end
$$;

create trigger app_user_audit
after insert or update or delete on public.app_user
for each row execute function public.audit_trigger();

create trigger user_permission_override_audit
after insert or update or delete on public.user_permission_override
for each row execute function public.audit_trigger();

-- RLS ------------------------------------------------------------------
alter table public.audit_log enable row level security;

create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select public.has_perm('config.audit')));

-- Privilégios ----------------------------------------------------------
revoke all on table public.audit_log from public, anon, authenticated, service_role;
grant select on table public.audit_log to authenticated, service_role;

revoke all on function public.audit_trigger() from public, anon, authenticated, service_role;

-- =====================================================================
-- Senzi OS · Acervo: peças, medidas, fotos, agenda da peça e histórico
--
-- Tabelas sem grant para anon/authenticated: toda leitura e escrita passa pelas
-- RPCs abaixo (security definer), que checam has_perm(). Custos da peça só saem
-- para quem tem acervo.cost.
--
-- Fotos: bucket privado `pecas-fotos` (Storage). O arquivo fica em
-- `<garment_id>/<nome>`; o app sobe o arquivo e registra com add_garment_photo().
-- Leitura por URL assinada (o bucket não é público).
--
-- Erros: `raise exception '<CODIGO>'`, com o campo do formulário em DETAIL e o
-- detalhe para a pessoa em HINT (ex.: período em conflito).
--
-- Leitura das peças em jsonb já no formato do app (src/data/types.ts → Garment);
-- as fotos vêm com `path` e o app troca por URL assinada.
--
-- Fora deste plano (entram com Reservas/Operação/Financeiro): locações, receita,
-- higienização e manutenção na economia da peça; conta a pagar da compra da peça.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.garment_state as enum (
  'disponivel', 'reservado', 'retirado', 'em_uso', 'aguardando_devolucao',
  'higienizacao', 'inspecao', 'ajuste', 'manutencao', 'bloqueado', 'baixado'
);
create type public.size_equiv as enum ('PP', 'P', 'M', 'G', 'GG', 'U');
create type public.garment_length as enum ('curto', 'midi', 'longo');
create type public.fit_runs as enum ('menor', 'fiel', 'maior');
create type public.fabric_stretch as enum ('nenhum', 'leve', 'alto');
create type public.block_kind as enum (
  'locacao', 'higienizacao', 'inspecao', 'ajuste', 'manutencao', 'bloqueio_manual', 'editorial'
);
create type public.photo_kind as enum (
  'frente', 'costas', 'lateral', 'detalhe', 'editorial', 'manequim', 'saida', 'devolucao', 'dano', 'manutencao'
);

-- Tabelas --------------------------------------------------------------
create table public.garment_category (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  cleaning_days int not null default 2 check (cleaning_days between 0 and 15),
  sort_order int not null default 0
);

insert into public.garment_category (slug, name, cleaning_days, sort_order) values
  ('vestido-longo',   'Vestido longo',     3, 1),
  ('vestido-midi',    'Vestido midi',      2, 2),
  ('vestido-curto',   'Vestido curto',     2, 3),
  ('vestido-sereia',  'Vestido sereia',    3, 4),
  ('macacao',         'Macacão',           2, 5),
  ('conjunto',        'Conjunto',          2, 6),
  ('saia',            'Saia',              1, 7),
  ('bolsa-acessorio', 'Bolsa & acessório', 1, 8);

create table public.brand (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> '')
);

create unique index brand_name_ci_idx on public.brand (lower(name));

create table public.garment (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null check (length(btrim(name)) >= 2),
  category_id uuid not null references public.garment_category (id),
  brand_id uuid references public.brand (id),
  label_size text not null default '',
  size_equiv public.size_equiv not null,
  color_primary text not null default '',
  color_hex text not null default '#000000',
  fabric text not null default '',
  length public.garment_length not null,
  neckline text not null default '',
  sleeve text not null default '',
  style text not null default '',
  occasions text[] not null default '{}',
  fit_notes text not null default '',
  rental_price numeric(12, 2) not null check (rental_price > 0),
  acquisition_cost numeric(12, 2) check (acquisition_cost >= 0),
  retail_reference numeric(12, 2) check (retail_reference >= 0),
  cleaning_days int check (cleaning_days between 0 and 15),
  location text not null default '',
  state public.garment_state not null default 'disponivel',
  fit_runs public.fit_runs,
  bust_comfort_cm numeric(5, 1) check (bust_comfort_cm between 0 and 300),
  waist_max_cm numeric(5, 1) check (waist_max_cm between 0 and 300),
  hip_max_cm numeric(5, 1) check (hip_max_cm between 0 and 300),
  hem_heel_cm numeric(5, 1) check (hem_heel_cm between 0 and 20),
  common_alteration text,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index garment_category_idx on public.garment (category_id);
create index garment_brand_idx on public.garment (brand_id);
create index garment_state_idx on public.garment (state);
create index garment_created_by_idx on public.garment (created_by);

create table public.garment_measurement (
  garment_id uuid primary key references public.garment (id) on delete cascade,
  bust_cm numeric(5, 1) check (bust_cm between 0 and 300),
  waist_cm numeric(5, 1) check (waist_cm between 0 and 300),
  hip_cm numeric(5, 1) check (hip_cm between 0 and 300),
  shoulder_cm numeric(5, 1) check (shoulder_cm between 0 and 300),
  total_length_cm numeric(5, 1) check (total_length_cm between 0 and 300),
  hem_allowance_cm numeric(5, 1) check (hem_allowance_cm between 0 and 20),
  stretch public.fabric_stretch
);

create table public.garment_photo (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garment (id) on delete cascade,
  kind public.photo_kind not null,
  storage_path text not null unique,
  position int not null,
  is_cover boolean not null default false,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now()
);

create index garment_photo_garment_idx on public.garment_photo (garment_id, position);
create unique index garment_photo_one_cover_idx on public.garment_photo (garment_id) where is_cover;
create index garment_photo_created_by_idx on public.garment_photo (created_by);

-- `period` é [início, fim+1) — datas inclusivas no app. Blocos ativos (released_at nulo)
-- de uma mesma peça nunca se sobrepõem.
create table public.garment_calendar_block (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garment (id) on delete cascade,
  reservation_id uuid,
  maintenance_id uuid,
  kind public.block_kind not null,
  period daterange not null check (not isempty(period) and lower_inc(period) and not upper_inf(period)),
  note text,
  released_at timestamptz,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now(),
  constraint garment_calendar_block_no_overlap
    exclude using gist (garment_id with =, period with &&) where (released_at is null)
);

create index garment_calendar_block_created_by_idx on public.garment_calendar_block (created_by);

-- Histórico de estados: é ele mesmo um registro, por isso não vai para audit_log.
create table public.garment_state_history (
  id bigint generated always as identity primary key,
  garment_id uuid not null references public.garment (id) on delete cascade,
  from_state public.garment_state,
  to_state public.garment_state not null,
  reason text not null,
  occurred_at timestamptz not null default now(),
  user_id uuid references public.app_user (id)
);

create index garment_state_history_garment_idx on public.garment_state_history (garment_id, occurred_at desc);
create index garment_state_history_user_idx on public.garment_state_history (user_id);

create trigger garment_category_audit after insert or update or delete on public.garment_category
for each row execute function public.audit_trigger();
create trigger brand_audit after insert or update or delete on public.brand
for each row execute function public.audit_trigger();
create trigger garment_audit after insert or update or delete on public.garment
for each row execute function public.audit_trigger();
create trigger garment_measurement_audit after insert or update or delete on public.garment_measurement
for each row execute function public.audit_trigger();
create trigger garment_photo_audit after insert or update or delete on public.garment_photo
for each row execute function public.audit_trigger();
create trigger garment_calendar_block_audit after insert or update or delete on public.garment_calendar_block
for each row execute function public.audit_trigger();

create function public.garment_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger garment_updated_at before update on public.garment
for each row execute function public.garment_set_updated_at();

-- RLS e privilégios das tabelas ------------------------------------------
alter table public.garment_category enable row level security;
alter table public.brand enable row level security;
alter table public.garment enable row level security;
alter table public.garment_measurement enable row level security;
alter table public.garment_photo enable row level security;
alter table public.garment_calendar_block enable row level security;
alter table public.garment_state_history enable row level security;

revoke all on table
  public.garment_category, public.brand, public.garment, public.garment_measurement,
  public.garment_photo, public.garment_calendar_block, public.garment_state_history
  from public, anon, authenticated, service_role;
grant select on table
  public.garment_category, public.brand, public.garment, public.garment_measurement,
  public.garment_photo, public.garment_calendar_block, public.garment_state_history
  to service_role;
revoke all on sequence public.garment_state_history_id_seq from public, anon, authenticated;

-- Funções internas (sem execute para a API) --------------------------------

-- Hoje no fuso da loja.
create function public.store_today()
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (now() at time zone 'America/Araguaina')::date
$$;

-- Minúsculas sem acento (busca).
create function public.norm(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select translate(lower(coalesce(p, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
$$;

create function public.require_perm(p text)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_perm(p) then
    raise exception 'SEM_PERMISSAO';
  end if;
end
$$;

-- Número opcional de um jsonb: ausente/null → null; texto não numérico → PARAMETRO_INVALIDO (campo em DETAIL).
create function public.jnum(p jsonb, k text)
returns numeric
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p -> k is null or jsonb_typeof(p -> k) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p -> k) <> 'number' then
    raise exception 'PARAMETRO_INVALIDO' using detail = k;
  end if;
  return (p ->> k)::numeric;
end
$$;

-- Texto de um jsonb, sem espaços nas pontas; ausente/null → null.
create function public.jtext(p jsonb, k text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p -> k) = 'string' then btrim(p ->> k) end
$$;

-- Valor de enum vindo do app; inválido → PARAMETRO_INVALIDO (campo em DETAIL).
create function public.jenum_check(p_ok boolean, k text)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if not p_ok then
    raise exception 'PARAMETRO_INVALIDO' using detail = k;
  end if;
end
$$;

create function public.garment_set_state(p_garment uuid, p_to public.garment_state, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.garment_state;
begin
  select state into v_from from public.garment where id = p_garment for update;
  if v_from is distinct from p_to then
    update public.garment set state = p_to where id = p_garment;
    insert into public.garment_state_history (garment_id, from_state, to_state, reason, user_id)
    values (p_garment, v_from, p_to, p_reason, public.current_app_user_id());
  end if;
end
$$;

-- Peça no formato do app (Garment). Custos só com acervo.cost; fotos com `path` (o app assina a URL).
create function public.garment_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', g.id,
    'code', g.code,
    'name', g.name,
    'categorySlug', c.slug,
    'categoryName', c.name,
    'brandName', b.name,
    'labelSize', g.label_size,
    'sizeEquiv', g.size_equiv,
    'colorPrimary', g.color_primary,
    'colorHex', g.color_hex,
    'fabric', g.fabric,
    'length', g.length,
    'neckline', g.neckline,
    'sleeve', g.sleeve,
    'style', g.style,
    'occasions', to_jsonb(g.occasions),
    'fitNotes', g.fit_notes,
    'state', g.state,
    'rentalPrice', g.rental_price,
    'acquisitionCost', case when public.has_perm('acervo.cost') then g.acquisition_cost end,
    'retailReference', case when public.has_perm('acervo.cost') then g.retail_reference end,
    'cleaningDays', g.cleaning_days,
    'location', g.location,
    'fitRuns', g.fit_runs,
    'bustComfortCm', g.bust_comfort_cm,
    'waistMaxCm', g.waist_max_cm,
    'hipMaxCm', g.hip_max_cm,
    'hemHeelCm', g.hem_heel_cm,
    'commonAlteration', g.common_alteration,
    'measurement', jsonb_build_object(
      'bustCm', m.bust_cm,
      'waistCm', m.waist_cm,
      'hipCm', m.hip_cm,
      'shoulderCm', m.shoulder_cm,
      'totalLengthCm', m.total_length_cm,
      'hemAllowanceCm', m.hem_allowance_cm,
      'stretch', m.stretch
    ),
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'kind', p.kind, 'path', p.storage_path, 'isCover', p.is_cover)
                       order by p.position)
      from public.garment_photo p
      where p.garment_id = g.id
    ), '[]'::jsonb),
    'blocks', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', k.id,
               'kind', k.kind,
               'from', lower(k.period),
               'to', upper(k.period) - 1,
               'note', k.note,
               'reservationId', k.reservation_id,
               'maintenanceId', k.maintenance_id
             ) order by lower(k.period))
      from public.garment_calendar_block k
      where k.garment_id = g.id and k.released_at is null
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'at', h.occurred_at,
               'from', h.from_state,
               'to', h.to_state,
               'reason', h.reason,
               'userName', coalesce(u.full_name, 'Sistema')
             ) order by h.occurred_at desc, h.id desc)
      from public.garment_state_history h
      left join public.app_user u on u.id = h.user_id
      where h.garment_id = g.id
    ), '[]'::jsonb)
  )
  from public.garment g
  join public.garment_category c on c.id = g.category_id
  left join public.brand b on b.id = g.brand_id
  left join public.garment_measurement m on m.garment_id = g.id
  where g.id = p_id
$$;

-- Peças que casam com busca (código, nome, cor, tecido; sem acento), categoria e tamanho.
create function public.garment_matching(p_q text, p_cat text, p_size public.size_equiv)
returns table (id uuid, code text, state public.garment_state)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select g.id, g.code, g.state
  from public.garment g
  join public.garment_category c on c.id = g.category_id
  where (coalesce(p_cat, '') = '' or c.slug = p_cat)
    and (p_size is null or g.size_equiv = p_size)
    and (
      public.norm(btrim(p_q)) = ''
      or strpos(public.norm(g.code || ' ' || g.name || ' ' || g.color_primary || ' ' || g.fabric), public.norm(btrim(p_q))) > 0
    )
$$;

create function public.state_group_states(p_group text)
returns public.garment_state[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_group
    when 'disponivel' then array['disponivel']::public.garment_state[]
    when 'reservado' then array['reservado']::public.garment_state[]
    when 'em_uso' then array['retirado', 'em_uso', 'aguardando_devolucao']::public.garment_state[]
    when 'ciclo' then array['inspecao', 'higienizacao', 'ajuste', 'manutencao']::public.garment_state[]
    when 'bloqueado' then array['bloqueado']::public.garment_state[]
  end
$$;

-- Marca por nome (sem diferenciar maiúsculas), criando se não existir; vazio → null.
create function public.ensure_brand(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if coalesce(btrim(p_name), '') = '' then
    return null;
  end if;
  select id into v_id from public.brand where lower(name) = lower(btrim(p_name));
  if v_id is null then
    insert into public.brand (name) values (btrim(p_name))
    on conflict (lower(name)) do nothing
    returning id into v_id;
    if v_id is null then
      select id into v_id from public.brand where lower(name) = lower(btrim(p_name));
    end if;
  end if;
  return v_id;
end
$$;

-- Aplica os campos presentes em `p` (GarmentInput parcial) à peça. Custos só com acervo.cost.
create function public.garment_apply(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cat uuid;
  v_can_cost boolean := public.has_perm('acervo.cost');
  v_days numeric;
begin
  if p ? 'name' and length(coalesce(public.jtext(p, 'name'), '')) < 2 then
    raise exception 'NOME_OBRIGATORIO' using detail = 'name';
  end if;
  if p ? 'rentalPrice' and coalesce(public.jnum(p, 'rentalPrice'), 0) <= 0 then
    raise exception 'VALOR_LOCACAO_OBRIGATORIO' using detail = 'rentalPrice';
  end if;
  if v_can_cost then
    if coalesce(public.jnum(p, 'acquisitionCost'), 0) < 0 then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'acquisitionCost';
    end if;
    if coalesce(public.jnum(p, 'retailReference'), 0) < 0 then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'retailReference';
    end if;
  end if;
  v_days := public.jnum(p, 'cleaningDays');
  if v_days is not null and (v_days <> trunc(v_days) or v_days < 0 or v_days > 15) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'cleaningDays';
  end if;
  if p ? 'categorySlug' then
    select id into v_cat from public.garment_category where slug = public.jtext(p, 'categorySlug');
    if v_cat is null then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'categorySlug';
    end if;
  end if;
  if p ? 'sizeEquiv' then
    perform public.jenum_check(public.jtext(p, 'sizeEquiv') in (select unnest(enum_range(null::public.size_equiv))::text), 'sizeEquiv');
  end if;
  if p ? 'length' then
    perform public.jenum_check(public.jtext(p, 'length') in (select unnest(enum_range(null::public.garment_length))::text), 'length');
  end if;
  if p ? 'occasions' and jsonb_typeof(p -> 'occasions') <> 'array' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'occasions';
  end if;

  update public.garment g set
    name             = case when p ? 'name' then public.jtext(p, 'name') else g.name end,
    category_id      = case when p ? 'categorySlug' then v_cat else g.category_id end,
    brand_id         = case when p ? 'brandName' then public.ensure_brand(public.jtext(p, 'brandName')) else g.brand_id end,
    label_size       = case when p ? 'labelSize' then coalesce(public.jtext(p, 'labelSize'), '') else g.label_size end,
    size_equiv       = case when p ? 'sizeEquiv' then public.jtext(p, 'sizeEquiv')::public.size_equiv else g.size_equiv end,
    color_primary    = case when p ? 'colorPrimary' then coalesce(public.jtext(p, 'colorPrimary'), '') else g.color_primary end,
    color_hex        = case when p ? 'colorHex' then coalesce(public.jtext(p, 'colorHex'), '#000000') else g.color_hex end,
    fabric           = case when p ? 'fabric' then coalesce(public.jtext(p, 'fabric'), '') else g.fabric end,
    length           = case when p ? 'length' then public.jtext(p, 'length')::public.garment_length else g.length end,
    neckline         = case when p ? 'neckline' then coalesce(public.jtext(p, 'neckline'), '') else g.neckline end,
    sleeve           = case when p ? 'sleeve' then coalesce(public.jtext(p, 'sleeve'), '') else g.sleeve end,
    style            = case when p ? 'style' then coalesce(public.jtext(p, 'style'), '') else g.style end,
    occasions        = case when p ? 'occasions'
                         then array(select btrim(x) from jsonb_array_elements_text(p -> 'occasions') x where btrim(x) <> '')
                         else g.occasions end,
    fit_notes        = case when p ? 'fitNotes' then coalesce(public.jtext(p, 'fitNotes'), '') else g.fit_notes end,
    rental_price     = case when p ? 'rentalPrice' then public.jnum(p, 'rentalPrice') else g.rental_price end,
    acquisition_cost = case when v_can_cost and p ? 'acquisitionCost' then public.jnum(p, 'acquisitionCost') else g.acquisition_cost end,
    retail_reference = case when v_can_cost and p ? 'retailReference' then public.jnum(p, 'retailReference') else g.retail_reference end,
    cleaning_days    = case when p ? 'cleaningDays' then v_days::int else g.cleaning_days end,
    location         = case when p ? 'location' then coalesce(public.jtext(p, 'location'), '') else g.location end
  where g.id = p_id;
end
$$;

create function public.garment_must_exist(p_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.garment where id = p_id) then
    raise exception 'NAO_ENCONTRADO';
  end if;
end
$$;

-- Leitura -------------------------------------------------------------------

create function public.list_garment_categories()
returns table (slug text, name text, cleaning_days int)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.view');
  return query select c.slug, c.name, c.cleaning_days from public.garment_category c order by c.sort_order, c.name;
end
$$;

create function public.list_brands()
returns setof text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.view');
  return query select b.name from public.brand b order by public.norm(b.name);
end
$$;

-- `p_state_group`: null = tudo menos baixadas; 'todos' = inclusive baixadas. → {"items": [Garment…], "total": n}
create function public.search_garments(
  p_q text,
  p_cat text,
  p_state_group text,
  p_size public.size_equiv,
  p_limit int,
  p_offset int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_states public.garment_state[];
  v_total bigint;
  v_items jsonb;
begin
  perform public.require_perm('acervo.view');
  if p_state_group is not null and p_state_group <> 'todos' then
    v_states := public.state_group_states(p_state_group);
    if v_states is null then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'stateGroup';
    end if;
  end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 200 or coalesce(p_offset, -1) < 0 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;

  with hits as (
    select m.id, m.code
    from public.garment_matching(p_q, p_cat, p_size) m
    where case
      when p_state_group = 'todos' then true
      when v_states is not null then m.state = any (v_states)
      else m.state <> 'baixado'
    end
  ),
  page as (
    select h.id, h.code from hits h order by h.code limit p_limit offset p_offset
  )
  select (select count(*) from hits),
         coalesce((select jsonb_agg(public.garment_json(pg.id) order by pg.code) from page pg), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total);
end
$$;

create function public.garment_counts(p_q text, p_cat text, p_size public.size_equiv)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v jsonb;
begin
  perform public.require_perm('acervo.view');
  select jsonb_build_object(
    'todos', count(*),
    'ativas', count(*) filter (where m.state <> 'baixado'),
    'disponivel', count(*) filter (where m.state = any (public.state_group_states('disponivel'))),
    'reservado', count(*) filter (where m.state = any (public.state_group_states('reservado'))),
    'em_uso', count(*) filter (where m.state = any (public.state_group_states('em_uso'))),
    'ciclo', count(*) filter (where m.state = any (public.state_group_states('ciclo'))),
    'bloqueado', count(*) filter (where m.state = any (public.state_group_states('bloqueado')))
  ) into v
  from public.garment_matching(p_q, p_cat, p_size) m;
  return v;
end
$$;

-- null quando a peça não existe.
create function public.get_garment(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.view');
  return public.garment_json(p_id);
end
$$;

-- Custo de aquisição das peças pedidas (ids inexistentes são ignorados). Só com acervo.cost.
-- Receita, locações, higienização e manutenção entram com Reservas/Operação.
create function public.garment_costs(p_ids uuid[])
returns table (garment_id uuid, acquisition_cost numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.cost');
  return query select g.id, g.acquisition_cost from public.garment g where g.id = any (p_ids);
end
$$;

-- Σ custo de aquisição das peças não baixadas. Só com acervo.cost.
create function public.acervo_investment()
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.cost');
  return (select coalesce(sum(g.acquisition_cost), 0) from public.garment g where g.state <> 'baixado');
end
$$;

-- Escrita -------------------------------------------------------------------

-- `p` = GarmentInput do app. Gera o código SZ-NNNN (maior + 1). → Garment
create function public.create_garment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
  v_cat uuid;
begin
  perform public.require_perm('acervo.create');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if length(coalesce(public.jtext(p, 'name'), '')) < 2 then
    raise exception 'NOME_OBRIGATORIO' using detail = 'name';
  end if;
  if coalesce(public.jnum(p, 'rentalPrice'), 0) <= 0 then
    raise exception 'VALOR_LOCACAO_OBRIGATORIO' using detail = 'rentalPrice';
  end if;
  select id into v_cat from public.garment_category where slug = public.jtext(p, 'categorySlug');
  if v_cat is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'categorySlug';
  end if;
  perform public.jenum_check(coalesce(public.jtext(p, 'sizeEquiv'), '') in (select unnest(enum_range(null::public.size_equiv))::text), 'sizeEquiv');
  perform public.jenum_check(coalesce(public.jtext(p, 'length'), '') in (select unnest(enum_range(null::public.garment_length))::text), 'length');

  perform pg_advisory_xact_lock(hashtext('public.garment.code'));
  select 'SZ-' || lpad((coalesce(max(nullif(substring(code from '^SZ-(\d+)$'), '')::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.garment;

  insert into public.garment (code, name, category_id, size_equiv, length, rental_price, created_by)
  values (
    v_code,
    public.jtext(p, 'name'),
    v_cat,
    public.jtext(p, 'sizeEquiv')::public.size_equiv,
    public.jtext(p, 'length')::public.garment_length,
    public.jnum(p, 'rentalPrice'),
    public.current_app_user_id()
  )
  returning id into v_id;

  perform public.garment_apply(v_id, p);
  insert into public.garment_measurement (garment_id) values (v_id);
  insert into public.garment_state_history (garment_id, from_state, to_state, reason, user_id)
  values (v_id, null, 'disponivel', 'Peça cadastrada no acervo', public.current_app_user_id());

  return public.garment_json(v_id);
end
$$;

-- `p` = GarmentInput parcial. Custos ignorados sem acervo.cost. → Garment
create function public.update_garment(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.edit');
  perform public.garment_must_exist(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  perform public.garment_apply(p_id, p);
  return public.garment_json(p_id);
end
$$;

-- `p` = FitInput parcial (caimento observado + observação de caimento). → Garment
create function public.update_garment_fit(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.edit');
  perform public.garment_must_exist(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if p ? 'fitRuns' and public.jtext(p, 'fitRuns') is not null then
    perform public.jenum_check(public.jtext(p, 'fitRuns') in (select unnest(enum_range(null::public.fit_runs))::text), 'fitRuns');
  end if;
  if coalesce(public.jnum(p, 'bustComfortCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'bustComfortCm'; end if;
  if coalesce(public.jnum(p, 'waistMaxCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'waistMaxCm'; end if;
  if coalesce(public.jnum(p, 'hipMaxCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'hipMaxCm'; end if;
  if coalesce(public.jnum(p, 'hemHeelCm'), 0) not between 0 and 20 then raise exception 'PARAMETRO_INVALIDO' using detail = 'hemHeelCm'; end if;

  update public.garment g set
    fit_runs          = case when p ? 'fitRuns' then public.jtext(p, 'fitRuns')::public.fit_runs else g.fit_runs end,
    bust_comfort_cm   = case when p ? 'bustComfortCm' then public.jnum(p, 'bustComfortCm') else g.bust_comfort_cm end,
    waist_max_cm      = case when p ? 'waistMaxCm' then public.jnum(p, 'waistMaxCm') else g.waist_max_cm end,
    hip_max_cm        = case when p ? 'hipMaxCm' then public.jnum(p, 'hipMaxCm') else g.hip_max_cm end,
    hem_heel_cm       = case when p ? 'hemHeelCm' then public.jnum(p, 'hemHeelCm') else g.hem_heel_cm end,
    common_alteration = case when p ? 'commonAlteration' then nullif(public.jtext(p, 'commonAlteration'), '') else g.common_alteration end,
    fit_notes         = case when p ? 'fitNotes' then coalesce(public.jtext(p, 'fitNotes'), '') else g.fit_notes end
  where g.id = p_id;
  return public.garment_json(p_id);
end
$$;

-- `p` = GarmentMeasurement parcial. → Garment
create function public.update_garment_measurement(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.edit');
  perform public.garment_must_exist(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if p ? 'stretch' and public.jtext(p, 'stretch') is not null then
    perform public.jenum_check(public.jtext(p, 'stretch') in (select unnest(enum_range(null::public.fabric_stretch))::text), 'stretch');
  end if;
  if coalesce(public.jnum(p, 'bustCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'bustCm'; end if;
  if coalesce(public.jnum(p, 'waistCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'waistCm'; end if;
  if coalesce(public.jnum(p, 'hipCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'hipCm'; end if;
  if coalesce(public.jnum(p, 'shoulderCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'shoulderCm'; end if;
  if coalesce(public.jnum(p, 'totalLengthCm'), 0) not between 0 and 300 then raise exception 'PARAMETRO_INVALIDO' using detail = 'totalLengthCm'; end if;
  if coalesce(public.jnum(p, 'hemAllowanceCm'), 0) not between 0 and 20 then raise exception 'PARAMETRO_INVALIDO' using detail = 'hemAllowanceCm'; end if;

  insert into public.garment_measurement (garment_id) values (p_id) on conflict (garment_id) do nothing;
  update public.garment_measurement m set
    bust_cm          = case when p ? 'bustCm' then public.jnum(p, 'bustCm') else m.bust_cm end,
    waist_cm         = case when p ? 'waistCm' then public.jnum(p, 'waistCm') else m.waist_cm end,
    hip_cm           = case when p ? 'hipCm' then public.jnum(p, 'hipCm') else m.hip_cm end,
    shoulder_cm      = case when p ? 'shoulderCm' then public.jnum(p, 'shoulderCm') else m.shoulder_cm end,
    total_length_cm  = case when p ? 'totalLengthCm' then public.jnum(p, 'totalLengthCm') else m.total_length_cm end,
    hem_allowance_cm = case when p ? 'hemAllowanceCm' then public.jnum(p, 'hemAllowanceCm') else m.hem_allowance_cm end,
    stretch          = case when p ? 'stretch' then public.jtext(p, 'stretch')::public.fabric_stretch else m.stretch end
  where m.garment_id = p_id;
  return public.garment_json(p_id);
end
$$;

-- Registra uma foto já enviada ao bucket `pecas-fotos` em `<p_garment>/<arquivo>`.
-- Máximo de 10 por peça (src/data/validation.ts → MAX_PHOTOS); a primeira vira capa. → Garment
create function public.add_garment_photo(p_garment uuid, p_kind public.photo_kind, p_path text)
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
  if p_path is null or p_path !~ ('^' || p_garment::text || '/[A-Za-z0-9._-]+$') then
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

-- Apaga o registro da foto e devolve o caminho no bucket (o app apaga o arquivo).
-- Se era a capa, a primeira restante vira capa.
create function public.remove_garment_photo(p_garment uuid, p_photo uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_path text;
  v_cover boolean;
begin
  perform public.require_perm('acervo.edit');
  delete from public.garment_photo
   where id = p_photo and garment_id = p_garment
  returning storage_path, is_cover into v_path, v_cover;
  if v_path is null then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if v_cover then
    update public.garment_photo set is_cover = true
     where id = (select id from public.garment_photo where garment_id = p_garment order by position limit 1);
  end if;
  return v_path;
end
$$;

create function public.set_cover_photo(p_garment uuid, p_photo uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.edit');
  if not exists (select 1 from public.garment_photo where id = p_photo and garment_id = p_garment) then
    raise exception 'NAO_ENCONTRADO';
  end if;
  update public.garment_photo set is_cover = false where garment_id = p_garment and is_cover and id <> p_photo;
  update public.garment_photo set is_cover = true where id = p_photo;
  return public.garment_json(p_garment);
end
$$;

-- Bloqueio manual [p_from, p_to] (inclusivo). Sobreposição → CONFLITO_AGENDA com o período em HINT
-- (dd/mm/aaaa – dd/mm/aaaa). Se cobre hoje e a peça está disponível, passa a `bloqueado`. → Garment
create function public.block_garment(p_garment uuid, p_from date, p_to date, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_clash daterange;
  v_today date := public.store_today();
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform public.require_perm('acervo.block');
  perform public.garment_must_exist(p_garment);
  if p_from is null or p_to is null or p_to < p_from then
    raise exception 'PERIODO_INVALIDO' using detail = 'to';
  end if;
  perform 1 from public.garment where id = p_garment for update;
  select k.period into v_clash
    from public.garment_calendar_block k
   where k.garment_id = p_garment
     and k.released_at is null
     and k.period && daterange(p_from, p_to, '[]')
   order by lower(k.period)
   limit 1;
  if v_clash is not null then
    raise exception 'CONFLITO_AGENDA' using
      detail = 'from',
      hint = to_char(lower(v_clash), 'DD/MM/YYYY') || ' – ' || to_char(upper(v_clash) - 1, 'DD/MM/YYYY');
  end if;
  insert into public.garment_calendar_block (garment_id, kind, period, note, created_by)
  values (p_garment, 'bloqueio_manual', daterange(p_from, p_to, '[]'), v_note, public.current_app_user_id());
  if p_from <= v_today and v_today <= p_to and (select state from public.garment where id = p_garment) = 'disponivel' then
    perform public.garment_set_state(p_garment, 'bloqueado', coalesce(v_note, 'Bloqueio manual'));
  end if;
  return public.garment_json(p_garment);
end
$$;

-- Libera um bloqueio manual. Se a peça estava `bloqueado` e nada mais a bloqueia hoje, volta a `disponivel`. → Garment
create function public.release_block(p_garment uuid, p_block uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind public.block_kind;
  v_today date := public.store_today();
begin
  perform public.require_perm('acervo.block');
  select kind into v_kind
    from public.garment_calendar_block
   where id = p_block and garment_id = p_garment and released_at is null
   for update;
  if v_kind is null then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if v_kind <> 'bloqueio_manual' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  update public.garment_calendar_block set released_at = now() where id = p_block;
  if (select state from public.garment where id = p_garment) = 'bloqueado'
     and not exists (
       select 1 from public.garment_calendar_block k
        where k.garment_id = p_garment and k.released_at is null
          and k.kind = 'bloqueio_manual' and k.period @> v_today
     ) then
    perform public.garment_set_state(p_garment, 'disponivel', 'Bloqueio liberado');
  end if;
  return public.garment_json(p_garment);
end
$$;

-- Privilégios das funções ---------------------------------------------------
revoke all on function public.garment_set_updated_at() from public, anon, authenticated;
revoke all on function public.store_today() from public, anon, authenticated;
revoke all on function public.norm(text) from public, anon, authenticated;
revoke all on function public.require_perm(text) from public, anon, authenticated;
revoke all on function public.jnum(jsonb, text) from public, anon, authenticated;
revoke all on function public.jtext(jsonb, text) from public, anon, authenticated;
revoke all on function public.jenum_check(boolean, text) from public, anon, authenticated;
revoke all on function public.garment_set_state(uuid, public.garment_state, text) from public, anon, authenticated;
revoke all on function public.garment_json(uuid) from public, anon, authenticated;
revoke all on function public.garment_matching(text, text, public.size_equiv) from public, anon, authenticated;
revoke all on function public.state_group_states(text) from public, anon, authenticated;
revoke all on function public.ensure_brand(text) from public, anon, authenticated;
revoke all on function public.garment_apply(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.garment_must_exist(uuid) from public, anon, authenticated;

revoke all on function public.list_garment_categories() from public, anon;
revoke all on function public.list_brands() from public, anon;
revoke all on function public.search_garments(text, text, text, public.size_equiv, int, int) from public, anon;
revoke all on function public.garment_counts(text, text, public.size_equiv) from public, anon;
revoke all on function public.get_garment(uuid) from public, anon;
revoke all on function public.garment_costs(uuid[]) from public, anon;
revoke all on function public.acervo_investment() from public, anon;
revoke all on function public.create_garment(jsonb) from public, anon;
revoke all on function public.update_garment(uuid, jsonb) from public, anon;
revoke all on function public.update_garment_fit(uuid, jsonb) from public, anon;
revoke all on function public.update_garment_measurement(uuid, jsonb) from public, anon;
revoke all on function public.add_garment_photo(uuid, public.photo_kind, text) from public, anon;
revoke all on function public.remove_garment_photo(uuid, uuid) from public, anon;
revoke all on function public.set_cover_photo(uuid, uuid) from public, anon;
revoke all on function public.block_garment(uuid, date, date, text) from public, anon;
revoke all on function public.release_block(uuid, uuid) from public, anon;

grant execute on function public.list_garment_categories() to authenticated;
grant execute on function public.list_brands() to authenticated;
grant execute on function public.search_garments(text, text, text, public.size_equiv, int, int) to authenticated;
grant execute on function public.garment_counts(text, text, public.size_equiv) to authenticated;
grant execute on function public.get_garment(uuid) to authenticated;
grant execute on function public.garment_costs(uuid[]) to authenticated;
grant execute on function public.acervo_investment() to authenticated;
grant execute on function public.create_garment(jsonb) to authenticated;
grant execute on function public.update_garment(uuid, jsonb) to authenticated;
grant execute on function public.update_garment_fit(uuid, jsonb) to authenticated;
grant execute on function public.update_garment_measurement(uuid, jsonb) to authenticated;
grant execute on function public.add_garment_photo(uuid, public.photo_kind, text) to authenticated;
grant execute on function public.remove_garment_photo(uuid, uuid) to authenticated;
grant execute on function public.set_cover_photo(uuid, uuid) to authenticated;
grant execute on function public.block_garment(uuid, date, date, text) to authenticated;
grant execute on function public.release_block(uuid, uuid) to authenticated;

-- Storage: fotos das peças ----------------------------------------------------
-- Bucket privado, só imagens, até 10 MB por arquivo. Sem policy de update: o app nunca
-- sobrescreve (cada foto tem nome único), só envia, lê (URL assinada) e apaga.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pecas-fotos', 'pecas-fotos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy pecas_fotos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'pecas-fotos' and (select public.has_perm('acervo.view')));

create policy pecas_fotos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pecas-fotos' and (select public.has_perm('acervo.edit')));

create policy pecas_fotos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'pecas-fotos' and (select public.has_perm('acervo.edit')));

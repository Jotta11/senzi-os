-- =====================================================================
-- Senzi OS · Clientes: cadastro, medidas versionadas, preferências,
-- memória de atendimento (observações), favoritos e recomendações.
--
-- Mesmo padrão do Acervo: tabelas sem grant para anon/authenticated; toda
-- leitura e escrita pelas RPCs abaixo (security definer), que checam has_perm().
-- Regras e códigos de erro = fonte em memória (src/data/mock/acervoClientes.ts,
-- src/data/validation.ts → customerIssues, src/data/mock/recommend.ts).
--
-- Campos protegidos no banco:
--   · CPF completo só com cliente.edit; sem ela sai `***XXXXXX**` (os 6 dígitos do
--     meio, como hideCPF) e a busca não casa por CPF.
--   · Dinheiro da cliente (stats.spent) só com financeiro.view; sem ela sai null e
--     a ordenação "gasto" vira "nome".
--   · Contato (telefone, Instagram, e-mail) aparece para quem tem cliente.view,
--     como na ficha e na lista.
--
-- Estatísticas de reserva (`stats`): zeradas até a área 3 (Reservas), que
-- substitui public.customer_stats() com `create or replace`.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.lead_source as enum ('indicacao', 'instagram', 'passante', 'evento', 'google', 'outro');
create type public.contact_channel as enum ('presencial', 'whatsapp', 'instagram', 'telefone');
create type public.favorite_source as enum ('manual', 'prova');
create type public.measurement_source as enum ('manual', 'modelo_ideal');

-- Tabelas --------------------------------------------------------------
create table public.customer (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  full_name text not null check (length(btrim(full_name)) >= 3),
  phone text not null check (phone ~ '^\d{10,11}$'),
  instagram text,
  email text,
  birth_date date not null,
  cpf text not null unique check (cpf ~ '^\d{11}$'),
  city text,
  state text,
  lead_source public.lead_source,
  vip boolean not null default false,
  notes text,
  ideal_garment_id uuid references public.garment (id) on delete set null,
  -- Preferências declaradas (1:1 com a cliente).
  preferred_colors text[] not null default '{}',
  avoided_colors text[] not null default '{}',
  preferred_lengths public.garment_length[] not null default '{}',
  sleeve_pref text,
  neckline_pref text,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index customer_ideal_garment_idx on public.customer (ideal_garment_id);
create index customer_created_by_idx on public.customer (created_by);
create index customer_phone_idx on public.customer (phone);

-- Versões de medidas: só insert (nenhuma versão é alterada). `id` crescente dá a ordem.
-- É ela mesma um histórico, por isso não vai para audit_log.
create table public.customer_measurement (
  id bigint generated always as identity primary key,
  customer_id uuid not null references public.customer (id) on delete cascade,
  measured_at date not null,
  usual_size public.size_equiv,
  bust_cm numeric(5, 1) check (bust_cm between 0 and 300),
  waist_cm numeric(5, 1) check (waist_cm between 0 and 300),
  hip_cm numeric(5, 1) check (hip_cm between 0 and 300),
  height_cm numeric(5, 1) check (height_cm between 0 and 300),
  shoulder_cm numeric(5, 1) check (shoulder_cm between 0 and 300),
  shoe_size text,
  preferred_length public.garment_length,
  source public.measurement_source not null,
  source_garment_id uuid references public.garment (id) on delete set null,
  notes text,
  measured_by uuid references public.app_user (id),
  created_at timestamptz not null default now()
);

create index customer_measurement_customer_idx on public.customer_measurement (customer_id, id desc);
create index customer_measurement_garment_idx on public.customer_measurement (source_garment_id);
create index customer_measurement_by_idx on public.customer_measurement (measured_by);

-- Memória de atendimento. clock_timestamp(): duas observações na mesma transação mantêm a ordem.
create table public.customer_note (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customer (id) on delete cascade,
  content text not null check (btrim(content) <> ''),
  channel public.contact_channel not null,
  pinned boolean not null default false,
  occurred_at timestamptz not null default clock_timestamp(),
  author_id uuid references public.app_user (id)
);

create index customer_note_customer_idx on public.customer_note (customer_id, occurred_at desc);
create index customer_note_author_idx on public.customer_note (author_id);

create table public.customer_favorite (
  customer_id uuid not null references public.customer (id) on delete cascade,
  garment_id uuid not null references public.garment (id) on delete cascade,
  source public.favorite_source not null default 'manual',
  note text,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp(),
  primary key (customer_id, garment_id)
);

create index customer_favorite_garment_idx on public.customer_favorite (garment_id);
create index customer_favorite_created_by_idx on public.customer_favorite (created_by);

create trigger customer_audit after insert or update or delete on public.customer
for each row execute function public.audit_trigger();
create trigger customer_note_audit after insert or update or delete on public.customer_note
for each row execute function public.audit_trigger();
create trigger customer_favorite_audit after insert or update or delete on public.customer_favorite
for each row execute function public.audit_trigger();

create function public.customer_set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger customer_updated_at before update on public.customer
for each row execute function public.customer_set_updated_at();

-- RLS e privilégios das tabelas ------------------------------------------
alter table public.customer enable row level security;
alter table public.customer_measurement enable row level security;
alter table public.customer_note enable row level security;
alter table public.customer_favorite enable row level security;

revoke all on table
  public.customer, public.customer_measurement, public.customer_note, public.customer_favorite
  from public, anon, authenticated, service_role;
grant select on table
  public.customer, public.customer_measurement, public.customer_note, public.customer_favorite
  to service_role;
revoke all on sequence public.customer_measurement_id_seq from public, anon, authenticated;

-- Funções internas (sem execute para a API) --------------------------------

-- CPF válido (com ou sem máscara): 11 dígitos, não todos iguais, verificadores corretos (src/lib/cpf.ts).
create function public.is_valid_cpf(p text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  s int;
  r int;
  dv1 int;
  dv2 int;
begin
  if length(d) <> 11 or d ~ '^(\d)\1{10}$' then
    return false;
  end if;
  s := 0;
  for i in 1..9 loop
    s := s + substr(d, i, 1)::int * (11 - i);
  end loop;
  r := s % 11;
  dv1 := case when r < 2 then 0 else 11 - r end;
  s := 0;
  for i in 1..10 loop
    s := s + substr(d, i, 1)::int * (12 - i);
  end loop;
  r := s % 11;
  dv2 := case when r < 2 then 0 else 11 - r end;
  return substr(d, 10, 1)::int = dv1 and substr(d, 11, 1)::int = dv2;
end
$$;

-- `aaaa-mm-dd` que existe no calendário (isValidISODate); senão null.
create function public.try_iso_date(p text)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p::date;
exception when others then
  return null;
end
$$;

-- uuid de um texto; inválido → null.
create function public.try_uuid(p text)
returns uuid
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  return p::uuid;
exception when others then
  return null;
end
$$;

-- Lista de textos de um jsonb (sem espaços nas pontas, sem vazios); não-array → PARAMETRO_INVALIDO (campo em DETAIL).
create function public.jtext_array(p jsonb, k text)
returns text[]
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p -> k is null or jsonb_typeof(p -> k) = 'null' then
    return '{}';
  end if;
  if jsonb_typeof(p -> k) <> 'array' then
    raise exception 'PARAMETRO_INVALIDO' using detail = k;
  end if;
  return array(select btrim(x) from jsonb_array_elements_text(p -> k) x where btrim(x) <> '');
end
$$;

-- Estatísticas de reserva da cliente: locações realizadas, Σ líquido delas e próximo evento.
-- Área 3 (Reservas) completa esta função com `create or replace` (customerStats de src/domain/customers.ts).
create function public.customer_stats(p_id uuid)
returns table (rentals int, spent numeric, next_event date)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select 0, 0::numeric, null::date
$$;

-- Cliente no formato do app (Customer). CPF completo só com cliente.edit; gasto só com financeiro.view.
create function public.customer_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'fullName', c.full_name,
    'phone', c.phone,
    'instagram', c.instagram,
    'email', c.email,
    'birthDate', c.birth_date,
    'cpf', case when public.has_perm('cliente.edit') then c.cpf else '***' || substr(c.cpf, 4, 6) || '**' end,
    'city', c.city,
    'state', c.state,
    'leadSource', c.lead_source,
    'vip', c.vip,
    'notes', c.notes,
    'idealGarmentId', c.ideal_garment_id,
    'createdAt', c.created_at,
    'measurements', coalesce((
      select jsonb_agg(jsonb_build_object(
               'measuredAt', m.measured_at,
               'usualSize', m.usual_size,
               'bustCm', m.bust_cm,
               'waistCm', m.waist_cm,
               'hipCm', m.hip_cm,
               'heightCm', m.height_cm,
               'shoulderCm', m.shoulder_cm,
               'shoeSize', m.shoe_size,
               'preferredLength', m.preferred_length,
               'source', m.source,
               'sourceGarmentId', m.source_garment_id,
               'notes', m.notes,
               'measuredBy', u.full_name
             ) order by m.id desc)
      from public.customer_measurement m
      left join public.app_user u on u.id = m.measured_by
      where m.customer_id = c.id
    ), '[]'::jsonb),
    'preferences', jsonb_build_object(
      'preferredColors', to_jsonb(c.preferred_colors),
      'avoidedColors', to_jsonb(c.avoided_colors),
      'preferredLengths', to_jsonb(c.preferred_lengths),
      'sleeve', c.sleeve_pref,
      'neckline', c.neckline_pref
    ),
    'interactions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id,
               'content', n.content,
               'channel', n.channel,
               'pinned', n.pinned,
               'at', n.occurred_at,
               'authorName', coalesce(u.full_name, 'Sistema')
             ) order by n.occurred_at desc, n.id)
      from public.customer_note n
      left join public.app_user u on u.id = n.author_id
      where n.customer_id = c.id
    ), '[]'::jsonb),
    'favorites', coalesce((
      select jsonb_agg(jsonb_build_object(
               'garmentId', f.garment_id,
               'source', f.source,
               'note', f.note,
               'at', f.created_at
             ) order by f.created_at desc, f.garment_id)
      from public.customer_favorite f
      where f.customer_id = c.id
    ), '[]'::jsonb),
    'stats', (
      select jsonb_build_object(
        'rentals', s.rentals,
        'spent', case when public.has_perm('financeiro.view') then s.spent end,
        'nextEvent', s.next_event
      )
      from public.customer_stats(c.id) s
    )
  )
  from public.customer c
  where c.id = p_id
$$;

create function public.customer_must_exist(p_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.customer where id = p_id) then
    raise exception 'NAO_ENCONTRADO';
  end if;
end
$$;

-- Versão de medidas (CustomerMeasurementInput): faixas de cm (CM_RANGES) e enums.
create function public.customer_measurement_check(m jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  k text;
begin
  if m is null or jsonb_typeof(m) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'measurement';
  end if;
  foreach k in array array['bustCm', 'waistCm', 'hipCm', 'shoulderCm', 'heightCm'] loop
    if coalesce(public.jnum(m, k), 0) not between 0 and 300 then
      raise exception 'PARAMETRO_INVALIDO' using detail = k;
    end if;
  end loop;
  if public.jtext(m, 'usualSize') is not null then
    perform public.jenum_check(public.jtext(m, 'usualSize') in (select unnest(enum_range(null::public.size_equiv))::text), 'usualSize');
  end if;
  if public.jtext(m, 'preferredLength') is not null then
    perform public.jenum_check(public.jtext(m, 'preferredLength') in (select unnest(enum_range(null::public.garment_length))::text), 'preferredLength');
  end if;
  if public.jtext(m, 'source') is not null then
    perform public.jenum_check(public.jtext(m, 'source') in (select unnest(enum_range(null::public.measurement_source))::text), 'source');
  end if;
  if public.jtext(m, 'sourceGarmentId') is not null
     and not exists (select 1 from public.garment where id = public.try_uuid(public.jtext(m, 'sourceGarmentId'))) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'sourceGarmentId';
  end if;
end
$$;

-- A versão tem algum valor além de origem/peça de origem? (hasMeasurement da fonte em memória)
create function public.customer_measurement_has_value(m jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select jsonb_typeof(m) = 'object' and exists (
    select 1 from jsonb_each(m) e
     where e.key not in ('source', 'sourceGarmentId')
       and jsonb_typeof(e.value) <> 'null'
       and e.value <> '""'::jsonb
  )
$$;

-- Grava uma versão nova. Origem: a enviada; sem origem, `p_default_source`; sem nenhuma das duas,
-- `modelo_ideal` se a cliente tem modelo ideal (peça de origem = a enviada ou o modelo ideal).
create function public.customer_insert_measurement(p_customer uuid, m jsonb, p_default_source text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_src text := case when m ? 'source' then public.jtext(m, 'source') else p_default_source end;
  v_ideal uuid;
  v_from_ideal boolean;
begin
  select ideal_garment_id into v_ideal from public.customer where id = p_customer;
  v_from_ideal := v_src = 'modelo_ideal' or (v_src is null and v_ideal is not null);
  insert into public.customer_measurement (
    customer_id, measured_at, usual_size, bust_cm, waist_cm, hip_cm, height_cm, shoulder_cm,
    shoe_size, preferred_length, source, source_garment_id, notes, measured_by
  ) values (
    p_customer,
    public.store_today(),
    public.jtext(m, 'usualSize')::public.size_equiv,
    public.jnum(m, 'bustCm'),
    public.jnum(m, 'waistCm'),
    public.jnum(m, 'hipCm'),
    public.jnum(m, 'heightCm'),
    public.jnum(m, 'shoulderCm'),
    nullif(public.jtext(m, 'shoeSize'), ''),
    public.jtext(m, 'preferredLength')::public.garment_length,
    case when v_from_ideal then 'modelo_ideal' else 'manual' end::public.measurement_source,
    case when v_from_ideal then coalesce(public.try_uuid(public.jtext(m, 'sourceGarmentId')), v_ideal) end,
    nullif(public.jtext(m, 'notes'), ''),
    public.current_app_user_id()
  );
end
$$;

-- Problemas da cliente, na ordem do formulário (customerIssues); levanta o primeiro.
-- `p_partial`: só os campos enviados. Depois: CPF repetido, modelo ideal inexistente e enums.
create function public.customer_validate(p jsonb, p_partial boolean, p_self uuid)
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

  if (not p_partial or p ? 'cpf') and exists (
    select 1 from public.customer
     where cpf = regexp_replace(public.jtext(p, 'cpf'), '\D', '', 'g') and id is distinct from p_self
  ) then
    raise exception 'CPF_DUPLICADO' using detail = 'cpf';
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
end
$$;

-- Aplica os campos presentes em `p` (CustomerInput parcial, já validado) e grava a versão de medidas
-- se `measurement` tiver algum valor. CPF repetido em corrida → CPF_DUPLICADO.
create function public.customer_apply(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pref jsonb := case when jsonb_typeof(p -> 'preferences') = 'object' then p -> 'preferences' else '{}'::jsonb end;
begin
  begin
    update public.customer c set
      full_name         = case when p ? 'fullName' then public.jtext(p, 'fullName') else c.full_name end,
      phone             = case when p ? 'phone' then regexp_replace(public.jtext(p, 'phone'), '\D', '', 'g') else c.phone end,
      birth_date        = case when p ? 'birthDate' then public.try_iso_date(public.jtext(p, 'birthDate')) else c.birth_date end,
      cpf               = case when p ? 'cpf' then regexp_replace(public.jtext(p, 'cpf'), '\D', '', 'g') else c.cpf end,
      instagram         = case when p ? 'instagram' then nullif(public.jtext(p, 'instagram'), '') else c.instagram end,
      email             = case when p ? 'email' then nullif(public.jtext(p, 'email'), '') else c.email end,
      city              = case when p ? 'city' then nullif(public.jtext(p, 'city'), '') else c.city end,
      state             = case when p ? 'state' then upper(nullif(public.jtext(p, 'state'), '')) else c.state end,
      lead_source       = case when p ? 'leadSource' then public.jtext(p, 'leadSource')::public.lead_source else c.lead_source end,
      vip               = case when p ? 'vip' then coalesce((p ->> 'vip')::boolean, false) else c.vip end,
      notes             = case when p ? 'notes' then nullif(public.jtext(p, 'notes'), '') else c.notes end,
      ideal_garment_id  = case when p ? 'idealGarmentId' then public.try_uuid(nullif(public.jtext(p, 'idealGarmentId'), '')) else c.ideal_garment_id end,
      preferred_colors  = case when v_pref ? 'preferredColors' then public.jtext_array(v_pref, 'preferredColors') else c.preferred_colors end,
      avoided_colors    = case when v_pref ? 'avoidedColors' then public.jtext_array(v_pref, 'avoidedColors') else c.avoided_colors end,
      preferred_lengths = case when v_pref ? 'preferredLengths'
                            then public.jtext_array(v_pref, 'preferredLengths')::public.garment_length[]
                            else c.preferred_lengths end,
      sleeve_pref       = case when v_pref ? 'sleeve' then nullif(public.jtext(v_pref, 'sleeve'), '') else c.sleeve_pref end,
      neckline_pref     = case when v_pref ? 'neckline' then nullif(public.jtext(v_pref, 'neckline'), '') else c.neckline_pref end
    where c.id = p_id;
  exception when unique_violation then
    raise exception 'CPF_DUPLICADO' using detail = 'cpf';
  end;
  if public.customer_measurement_has_value(p -> 'measurement') then
    perform public.customer_insert_measurement(p_id, p -> 'measurement', null);
  end if;
end
$$;

-- Leitura -------------------------------------------------------------------

-- Busca em nome, Instagram, código e cidade (sem acento) e, com 3+ dígitos, em telefone e CPF
-- (CPF só para quem tem cliente.edit). Ordem: nome (pt-BR, sem acento), gasto, locações ou recentes.
-- → {"items": [Customer…], "total": n}
create function public.search_customers(p_q text, p_sort text, p_limit int, p_offset int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nq text := btrim(public.norm(p_q));
  v_dq text := regexp_replace(coalesce(p_q, ''), '\D', '', 'g');
  v_cpf boolean := public.has_perm('cliente.edit');
  v_sort text := p_sort;
  v_total bigint;
  v_items jsonb;
begin
  perform public.require_perm('cliente.view');
  if p_sort is null or p_sort not in ('nome', 'gasto', 'locacoes', 'recentes') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'sort';
  end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 200 or coalesce(p_offset, -1) < 0 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  -- "Maior gasto" expõe dinheiro: sem financeiro.view cai em A–Z (como a lista).
  if v_sort = 'gasto' and not public.has_perm('financeiro.view') then
    v_sort := 'nome';
  end if;

  with hits as (
    select c.id,
           row_number() over (
             order by
               case when v_sort = 'gasto' then s.spent end desc nulls last,
               case when v_sort = 'locacoes' then s.rentals end desc nulls last,
               case when v_sort = 'recentes' then c.created_at end desc nulls last,
               btrim(public.norm(c.full_name)), c.full_name, c.code
           ) as rn
    from public.customer c
    cross join lateral public.customer_stats(c.id) s
    where v_nq = ''
       or strpos(btrim(public.norm(c.full_name)), v_nq) > 0
       or strpos(btrim(public.norm(c.instagram)), v_nq) > 0
       or strpos(btrim(public.norm(c.code)), v_nq) > 0
       or strpos(btrim(public.norm(c.city)), v_nq) > 0
       or (length(v_dq) >= 3 and (strpos(c.phone, v_dq) > 0 or (v_cpf and strpos(c.cpf, v_dq) > 0)))
  )
  select (select count(*) from hits),
         coalesce((
           select jsonb_agg(public.customer_json(h.id) order by h.rn)
             from hits h
            where h.rn > p_offset and h.rn <= p_offset + p_limit
         ), '[]'::jsonb)
    into v_total, v_items;

  return jsonb_build_object('items', v_items, 'total', v_total);
end
$$;

-- null quando a cliente não existe.
create function public.get_customer(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.view');
  return public.customer_json(p_id);
end
$$;

-- Medidas sugeridas a partir de uma peça ("modelo ideal"). → IdealMeasurements
create function public.ideal_measurements(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.view');
  perform public.garment_must_exist(p_garment);
  return (
    select jsonb_build_object(
      'usualSize', g.size_equiv,
      'bustCm', m.bust_cm,
      'waistCm', m.waist_cm,
      'hipCm', m.hip_cm,
      'shoulderCm', m.shoulder_cm,
      'preferredLength', g.length
    )
    from public.garment g
    left join public.garment_measurement m on m.garment_id = g.id
    where g.id = p_garment
  );
end
$$;

-- Sugestões de peças (src/data/mock/recommend.ts):
--   +4 tamanho = tamanho usual da medida atual             'No tamanho dela (M)'
--   +3 mesma categoria do modelo ideal ou de uma favorita   'Parecida com <peça>'
--   +2 cor contém uma cor preferida                         'Cor que ela ama (<cor>)'
--   cor contém uma cor evitada → peça descartada
--   +2 comprimento preferido (preferências ou medida atual) 'Comprimento preferido'
--   +2 busto conforto ≥ busto e cintura máx. ≥ cintura      'Caimento compatível com as medidas'
-- Só peças fora de baixado/bloqueado, sem as favoritas; score > 0; score desc, preço asc.
-- Sem acervo.view → lista vazia (as sugestões são peças do acervo).
-- (Áreas 2–3 podem somar sinais de provas e locações aqui.) → [{garment, score, reasons}]
create function public.recommend_garments(p_customer uuid, p_limit int default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_size public.size_equiv;
  v_bust numeric;
  v_waist numeric;
  v_mlen public.garment_length;
  v_ideal uuid;
  v_pref text[];
  v_avoid text[];
  v_lengths public.garment_length[];
begin
  perform public.require_perm('cliente.view');
  perform public.customer_must_exist(p_customer);
  if p_limit is null or p_limit < 1 or p_limit > 100 then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'limit';
  end if;
  if not public.has_perm('acervo.view') then
    return '[]'::jsonb;
  end if;

  select m.usual_size, m.bust_cm, m.waist_cm, m.preferred_length
    into v_size, v_bust, v_waist, v_mlen
    from public.customer_measurement m
   where m.customer_id = p_customer
   order by m.id desc
   limit 1;
  select c.ideal_garment_id, c.preferred_colors, c.avoided_colors, c.preferred_lengths
    into v_ideal, v_pref, v_avoid, v_lengths
    from public.customer c
   where c.id = p_customer;
  if v_mlen is not null then
    v_lengths := v_lengths || v_mlen;
  end if;

  return coalesce((
    with refs as (
      select g.id, g.category_id, g.name, 0 as ord, null::timestamptz as at
        from public.garment g where g.id = v_ideal
      union all
      select g.id, g.category_id, g.name, 1, f.created_at
        from public.customer_favorite f join public.garment g on g.id = f.garment_id
       where f.customer_id = p_customer
    ),
    base as (
      select g.id, g.code, g.category_id, g.rental_price, g.size_equiv, g.length,
             g.bust_comfort_cm, g.waist_max_cm, btrim(public.norm(g.color_primary)) as color
        from public.garment g
       where g.state not in ('baixado', 'bloqueado')
         and not exists (select 1 from public.customer_favorite f where f.customer_id = p_customer and f.garment_id = g.id)
    ),
    cand as (
      select b.*,
             (select r.name from refs r
               where r.id <> b.id and r.category_id = b.category_id
               order by r.ord, r.at desc nulls first limit 1) as similar,
             (select x.c from unnest(v_pref) with ordinality as x (c, i)
               where btrim(public.norm(x.c)) <> '' and strpos(b.color, btrim(public.norm(x.c))) > 0
               order by x.i limit 1) as loved,
             v_size is not null and b.size_equiv = v_size as sized,
             b.length = any (v_lengths) as lengthy,
             v_bust is not null and v_waist is not null and b.bust_comfort_cm is not null and b.waist_max_cm is not null
               and b.bust_comfort_cm >= v_bust and b.waist_max_cm >= v_waist as fits
        from base b
       where not exists (
         select 1 from unnest(v_avoid) a
          where btrim(public.norm(a)) <> '' and strpos(b.color, btrim(public.norm(a))) > 0
       )
    ),
    scored as (
      select c.id, c.code, c.rental_price,
             (case when c.sized then 4 else 0 end
              + case when c.similar is not null then 3 else 0 end
              + case when c.loved is not null then 2 else 0 end
              + case when c.lengthy then 2 else 0 end
              + case when c.fits then 2 else 0 end) as score,
             array_remove(array[
               case when c.sized then 'No tamanho dela (' || v_size::text || ')' end,
               case when c.similar is not null then 'Parecida com ' || c.similar end,
               case when c.loved is not null then 'Cor que ela ama (' || c.loved || ')' end,
               case when c.lengthy then 'Comprimento preferido' end,
               case when c.fits then 'Caimento compatível com as medidas' end
             ], null) as reasons
        from cand c
    ),
    top as (
      select * from scored where score > 0 order by score desc, rental_price, code limit p_limit
    )
    select jsonb_agg(jsonb_build_object('garment', public.garment_json(t.id), 'score', t.score, 'reasons', to_jsonb(t.reasons))
                     order by t.score desc, t.rental_price, t.code)
      from top t
  ), '[]'::jsonb);
end
$$;

-- Escrita -------------------------------------------------------------------

-- `p` = CustomerInput. Gera o código CL-NNNN (maior + 1). → Customer
create function public.create_customer(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
begin
  perform public.require_perm('cliente.create');
  perform public.customer_validate(p, false, null);

  perform pg_advisory_xact_lock(hashtext('public.customer.code'));
  select 'CL-' || lpad((coalesce(max(nullif(substring(code from '^CL-(\d+)$'), '')::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.customer;

  begin
    insert into public.customer (code, full_name, phone, birth_date, cpf, created_by)
    values (
      v_code,
      public.jtext(p, 'fullName'),
      regexp_replace(public.jtext(p, 'phone'), '\D', '', 'g'),
      public.try_iso_date(public.jtext(p, 'birthDate')),
      regexp_replace(public.jtext(p, 'cpf'), '\D', '', 'g'),
      public.current_app_user_id()
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception 'CPF_DUPLICADO' using detail = 'cpf';
  end;

  perform public.customer_apply(v_id, p);
  return public.customer_json(v_id);
end
$$;

-- `p` = CustomerInput parcial (só os campos enviados são validados e gravados). → Customer
create function public.update_customer(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.edit');
  perform public.customer_must_exist(p_id);
  perform public.customer_validate(p, true, p_id);
  perform public.customer_apply(p_id, p);
  return public.customer_json(p_id);
end
$$;

-- Nova versão de medidas (nunca altera as anteriores); origem padrão `manual`. → Customer
create function public.add_customer_measurement(p_customer uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.edit');
  perform public.customer_must_exist(p_customer);
  perform public.customer_measurement_check(p);
  perform public.customer_insert_measurement(p_customer, p, 'manual');
  return public.customer_json(p_customer);
end
$$;

-- Observação de atendimento. Vazia → OBSERVACAO_OBRIGATORIA (campo content). → Customer
create function public.add_customer_note(p_customer uuid, p_content text, p_channel text, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.note');
  perform public.customer_must_exist(p_customer);
  if btrim(coalesce(p_content, '')) = '' then
    raise exception 'OBSERVACAO_OBRIGATORIA' using detail = 'content';
  end if;
  perform public.jenum_check(coalesce(p_channel, '') in (select unnest(enum_range(null::public.contact_channel))::text), 'channel');
  insert into public.customer_note (customer_id, content, channel, pinned, author_id)
  values (p_customer, btrim(p_content), p_channel::public.contact_channel, coalesce(p_pinned, false), public.current_app_user_id());
  return public.customer_json(p_customer);
end
$$;

-- Fixa/desafixa uma observação da cliente. → Customer
create function public.set_customer_note_pinned(p_customer uuid, p_note uuid, p_pinned boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.note');
  perform public.customer_must_exist(p_customer);
  update public.customer_note set pinned = coalesce(p_pinned, false)
   where id = p_note and customer_id = p_customer;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  return public.customer_json(p_customer);
end
$$;

-- Liga/desliga uma peça favorita (origem `manual`). → Customer
create function public.set_customer_favorite(p_customer uuid, p_garment uuid, p_on boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('cliente.edit');
  perform public.customer_must_exist(p_customer);
  perform public.garment_must_exist(p_garment);
  if coalesce(p_on, false) then
    insert into public.customer_favorite (customer_id, garment_id, source, created_by)
    values (p_customer, p_garment, 'manual', public.current_app_user_id())
    on conflict (customer_id, garment_id) do nothing;
  else
    delete from public.customer_favorite where customer_id = p_customer and garment_id = p_garment;
  end if;
  return public.customer_json(p_customer);
end
$$;

-- Privilégios das funções ---------------------------------------------------
revoke all on function public.customer_set_updated_at() from public, anon, authenticated;
revoke all on function public.is_valid_cpf(text) from public, anon, authenticated;
revoke all on function public.try_iso_date(text) from public, anon, authenticated;
revoke all on function public.try_uuid(text) from public, anon, authenticated;
revoke all on function public.jtext_array(jsonb, text) from public, anon, authenticated;
revoke all on function public.customer_stats(uuid) from public, anon, authenticated;
revoke all on function public.customer_json(uuid) from public, anon, authenticated;
revoke all on function public.customer_must_exist(uuid) from public, anon, authenticated;
revoke all on function public.customer_measurement_check(jsonb) from public, anon, authenticated;
revoke all on function public.customer_measurement_has_value(jsonb) from public, anon, authenticated;
revoke all on function public.customer_insert_measurement(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.customer_validate(jsonb, boolean, uuid) from public, anon, authenticated;
revoke all on function public.customer_apply(uuid, jsonb) from public, anon, authenticated;

revoke all on function public.search_customers(text, text, int, int) from public, anon;
revoke all on function public.get_customer(uuid) from public, anon;
revoke all on function public.ideal_measurements(uuid) from public, anon;
revoke all on function public.recommend_garments(uuid, int) from public, anon;
revoke all on function public.create_customer(jsonb) from public, anon;
revoke all on function public.update_customer(uuid, jsonb) from public, anon;
revoke all on function public.add_customer_measurement(uuid, jsonb) from public, anon;
revoke all on function public.add_customer_note(uuid, text, text, boolean) from public, anon;
revoke all on function public.set_customer_note_pinned(uuid, uuid, boolean) from public, anon;
revoke all on function public.set_customer_favorite(uuid, uuid, boolean) from public, anon;

grant execute on function public.search_customers(text, text, int, int) to authenticated;
grant execute on function public.get_customer(uuid) to authenticated;
grant execute on function public.ideal_measurements(uuid) to authenticated;
grant execute on function public.recommend_garments(uuid, int) to authenticated;
grant execute on function public.create_customer(jsonb) to authenticated;
grant execute on function public.update_customer(uuid, jsonb) to authenticated;
grant execute on function public.add_customer_measurement(uuid, jsonb) to authenticated;
grant execute on function public.add_customer_note(uuid, text, text, boolean) to authenticated;
grant execute on function public.set_customer_note_pinned(uuid, uuid, boolean) to authenticated;
grant execute on function public.set_customer_favorite(uuid, uuid, boolean) to authenticated;

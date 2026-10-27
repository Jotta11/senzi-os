-- =====================================================================
-- Senzi OS · Reservas (1/2): tabelas, configurações, base do financeiro e
-- funções internas (saldo, rateio, contrato, disponibilidade, estado da peça).
-- As RPCs ficam em 20261027000450_reservas_rpcs.sql.
--
-- Mesmo padrão das áreas anteriores: tabelas sem grant para anon/authenticated;
-- toda leitura e escrita pelas RPCs (security definer), que checam has_perm().
-- Regras e códigos de erro = fonte em memória (src/data/mock/reservas*.ts,
-- contract.ts, pricing.ts, exceptions.ts e src/domain/money.ts / calendar.ts).
--
-- Agenda da peça: a confirmação cria blocos `inspecao` (preparação, se
-- default_prep_days > 0), `locacao` e `higienizacao` em garment_calendar_block
-- (sem sobreposição: constraint de exclusão da área do Acervo). Cancelamento e
-- no-show liberam os blocos (released_at); reserva `finalizada` libera a locação
-- (trigger), como a fonte em memória que deixa de contar locação encerrada.
--
-- Base do financeiro (a área 4 acrescenta RPCs e telas sobre ela):
--   · fin_category — categorias com as de sistema (system_key), seed do fixture.
--   · receivable   — recebíveis AVULSOS. Parcelas de reserva NÃO ficam aqui: derivam
--                    de reservation_payment (como src/domain/finance.ts).
--   A retenção de caução (return_reservation_deposit) já grava um avulso pago na
--   categoria de sistema `locacao`.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.reservation_state as enum (
  'rascunho', 'confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao',
  'devolvida', 'em_inspecao', 'finalizada', 'cancelada', 'no_show'
);
create type public.reservation_item_state as enum ('pendente', 'retirado', 'nao_entregue', 'devolvido', 'inspecionado', 'cancelado');
create type public.payment_kind as enum ('sinal', 'saldo', 'integral', 'caucao', 'multa', 'estorno');
create type public.payment_method as enum ('pix', 'credito', 'debito', 'dinheiro', 'link', 'transferencia', 'outro');
create type public.payment_state as enum ('pago', 'pendente', 'parcial', 'estornado', 'cancelado');
create type public.reservation_channel as enum ('loja', 'whatsapp', 'instagram');
create type public.fin_category_type as enum ('receita', 'despesa');
create type public.receivable_status as enum ('aberto', 'parcial', 'pago', 'cancelado');

-- Configurações (Settings; uma linha só) -----------------------------------
create table public.app_settings (
  id boolean primary key default true check (id),
  default_cleaning_days int not null check (default_cleaning_days between 0 and 15),
  default_prep_days int not null check (default_prep_days between 0 and 15),
  late_fee_daily_percent numeric(6, 2) not null check (late_fee_daily_percent >= 0),
  deposit_percent numeric(6, 2) not null check (deposit_percent >= 0),
  discount_limit_percent numeric(6, 2) not null check (discount_limit_percent between 0 and 100),
  min_signal_percent numeric(6, 2) not null check (min_signal_percent between 0 and 100),
  idle_alert_days int not null check (idle_alert_days >= 1),
  updated_at timestamptz not null default now()
);

-- DEFAULT_SETTINGS de src/domain/settings.ts.
insert into public.app_settings (default_cleaning_days, default_prep_days, late_fee_daily_percent, deposit_percent,
                                 discount_limit_percent, min_signal_percent, idle_alert_days)
values (2, 0, 20, 0, 15, 50, 90);

-- Financeiro: categorias -------------------------------------------------------
create table public.fin_category (
  id uuid primary key default gen_random_uuid(),
  name text not null check (btrim(name) <> ''),
  type public.fin_category_type not null,
  color text not null default '#3C3F46' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  -- Identidade das categorias de sistema (FinSystemKey); as regras casam por ela, nunca pelo id.
  system_key text unique check (system_key in ('locacao', 'aquisicao', 'higienizacao', 'manutencao', 'ajuste')),
  is_system boolean generated always as (system_key is not null) stored,
  archived boolean not null default false,
  sort_order int not null default 0,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now()
);

create index fin_category_created_by_idx on public.fin_category (created_by);

-- Seed = src/data/fixture/finance.ts (CATEGORIES, cor = PALETTE[i % 8]).
insert into public.fin_category (name, type, system_key, color, sort_order) values
  ('Locação',                'receita', 'locacao',      '#7A2E3A', 1),
  ('Venda de peça',          'receita', null,           '#5E6B3C', 2),
  ('Outros',                 'receita', null,           '#1D4E63', 3),
  ('Aquisição de acervo',    'despesa', 'aquisicao',    '#B4633F', 4),
  ('Higienização',           'despesa', 'higienizacao', '#A98BC4', 5),
  ('Manutenção',             'despesa', 'manutencao',   '#C9A961', 6),
  ('Ajuste',                 'despesa', 'ajuste',       '#3C3F46', 7),
  ('Aluguel',                'despesa', null,           '#C98A99', 8),
  ('Energia e água',         'despesa', null,           '#7A2E3A', 9),
  ('Internet e telefone',    'despesa', null,           '#5E6B3C', 10),
  ('Folha / pró-labore',     'despesa', null,           '#1D4E63', 11),
  ('Marketing',              'despesa', null,           '#B4633F', 12),
  ('Contabilidade',          'despesa', null,           '#A98BC4', 13),
  ('Impostos',               'despesa', null,           '#C9A961', 14),
  ('Embalagens e materiais', 'despesa', null,           '#3C3F46', 15),
  ('Outros',                 'despesa', null,           '#C98A99', 16);

-- Reservas -------------------------------------------------------------------
create table public.reservation (
  id uuid primary key default gen_random_uuid(),
  -- RS-<ano de criação>-NNNN
  code text not null unique,
  customer_id uuid not null references public.customer (id),
  state public.reservation_state not null default 'rascunho',
  event_date date,
  event_type text,
  event_venue text,
  pickup_date date not null,
  return_due_date date not null check (return_due_date >= pickup_date),
  picked_up_at timestamptz,
  returned_at timestamptz,
  channel public.reservation_channel not null default 'loja',
  total_gross numeric(12, 2) not null default 0,
  discount numeric(12, 2) not null default 0,
  total_net numeric(12, 2) not null default 0 check (total_net >= 0),
  deposit_amount numeric(12, 2) not null default 0 check (deposit_amount >= 0),
  late_fee numeric(12, 2) not null default 0 check (late_fee >= 0),
  notes text,
  cancel_reason text,
  fitting_id uuid references public.fitting_session (id),
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp()
);

create index reservation_customer_idx on public.reservation (customer_id);
create index reservation_fitting_idx on public.reservation (fitting_id);
create index reservation_state_idx on public.reservation (state);
create index reservation_pickup_idx on public.reservation (pickup_date, created_at);
create index reservation_created_by_idx on public.reservation (created_by);

create table public.reservation_item (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservation (id) on delete cascade,
  garment_id uuid not null references public.garment (id),
  position int not null,
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  gross_amount numeric(12, 2) not null check (gross_amount >= 0),
  item_discount numeric(12, 2) not null default 0 check (item_discount >= 0),
  allocated_order_discount numeric(12, 2) not null default 0,
  net_revenue numeric(12, 2) not null default 0,
  item_state public.reservation_item_state not null default 'pendente',
  picked_up_at timestamptz,
  returned_at timestamptz,
  pickup_note text,
  return_note text,
  alteration_notes text,
  unique (reservation_id, garment_id)
);

create index reservation_item_garment_idx on public.reservation_item (garment_id);

-- Lançamentos da reserva (Payment). `seq` dá a ordem (parcela pendente quitada mantém a posição).
create table public.reservation_payment (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity unique,
  reservation_id uuid not null references public.reservation (id) on delete cascade,
  kind public.payment_kind not null,
  method public.payment_method not null,
  amount numeric(12, 2) not null check (amount > 0),
  state public.payment_state not null,
  paid_at timestamptz,
  -- Saldo = retirada; multa = dia da devolução.
  due_at date,
  reference text,
  notes text,
  -- 'caucao' só em estorno da caução (não mexe no saldo).
  refers_to text check (refers_to = 'caucao'),
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp()
);

create index reservation_payment_reservation_idx on public.reservation_payment (reservation_id, seq);
create index reservation_payment_pending_idx on public.reservation_payment (reservation_id) where state = 'pendente';
create index reservation_payment_created_by_idx on public.reservation_payment (created_by);

-- Versões do contrato: a mais alta é a vigente. Assinada, a versão congela (trigger abaixo);
-- editar o rascunho gera a versão seguinte, não assinada.
create table public.reservation_contract (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservation (id) on delete cascade,
  number text not null,
  version int not null check (version >= 1),
  body_rendered text not null,
  generated_at timestamptz not null default clock_timestamp(),
  template_version int not null default 1,
  late_fee_daily_percent numeric(6, 2) not null,
  deposit numeric(12, 2) not null default 0,
  signed_at timestamptz,
  signed_by uuid references public.app_user (id),
  signer_name text,
  signature_kind text check (signature_kind = 'presencial'),
  signature_notes text,
  pdf_path text,
  unique (reservation_id, version)
);

create index reservation_contract_signed_by_idx on public.reservation_contract (signed_by);

-- Histórico de estados: é ele mesmo um registro, por isso não vai para audit_log.
create table public.reservation_history (
  id bigint generated always as identity primary key,
  reservation_id uuid not null references public.reservation (id) on delete cascade,
  from_state public.reservation_state,
  to_state public.reservation_state not null,
  reason text,
  user_id uuid references public.app_user (id),
  occurred_at timestamptz not null default clock_timestamp()
);

create index reservation_history_reservation_idx on public.reservation_history (reservation_id, id);
create index reservation_history_user_idx on public.reservation_history (user_id);

-- Financeiro: recebíveis avulsos ---------------------------------------------
create table public.receivable (
  id uuid primary key default gen_random_uuid(),
  description text not null check (btrim(description) <> ''),
  category_id uuid references public.fin_category (id),
  reservation_id uuid references public.reservation (id),
  customer_id uuid references public.customer (id),
  payer_name text,
  amount numeric(12, 2) not null check (amount > 0),
  paid_amount numeric(12, 2) not null default 0 check (paid_amount >= 0),
  due_date date not null,
  status public.receivable_status not null default 'aberto',
  received_at timestamptz,
  method public.payment_method,
  notes text,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp()
);

create index receivable_category_idx on public.receivable (category_id);
create index receivable_reservation_idx on public.receivable (reservation_id);
create index receivable_customer_idx on public.receivable (customer_id);
create index receivable_due_idx on public.receivable (due_date);
create index receivable_created_by_idx on public.receivable (created_by);

-- Exceções: uso único, para o tipo e a reserva certos -------------------------
alter table public.exception_authorization
  add column reservation_id uuid references public.reservation (id),
  add column amount numeric(12, 2),
  add column consumed_at timestamptz;

create index exception_authorization_reservation_idx on public.exception_authorization (reservation_id);

-- FKs pendentes das áreas 1 e 2 -------------------------------------------------
alter table public.appointment
  add constraint appointment_reservation_id_fkey foreign key (reservation_id) references public.reservation (id);
alter table public.fitting_session
  add constraint fitting_session_reservation_id_fkey foreign key (reservation_id) references public.reservation (id);
alter table public.garment_calendar_block
  add constraint garment_calendar_block_reservation_id_fkey foreign key (reservation_id) references public.reservation (id);
create index garment_calendar_block_reservation_idx on public.garment_calendar_block (reservation_id);

-- Auditoria --------------------------------------------------------------------
create trigger app_settings_audit after insert or update or delete on public.app_settings
for each row execute function public.audit_trigger();
create trigger fin_category_audit after insert or update or delete on public.fin_category
for each row execute function public.audit_trigger();
create trigger reservation_audit after insert or update or delete on public.reservation
for each row execute function public.audit_trigger();
create trigger reservation_item_audit after insert or update or delete on public.reservation_item
for each row execute function public.audit_trigger();
create trigger reservation_payment_audit after insert or update or delete on public.reservation_payment
for each row execute function public.audit_trigger();
create trigger reservation_contract_audit after insert or update or delete on public.reservation_contract
for each row execute function public.audit_trigger();
create trigger receivable_audit after insert or update or delete on public.receivable
for each row execute function public.audit_trigger();

-- RLS e privilégios das tabelas ------------------------------------------
alter table public.app_settings enable row level security;
alter table public.fin_category enable row level security;
alter table public.reservation enable row level security;
alter table public.reservation_item enable row level security;
alter table public.reservation_payment enable row level security;
alter table public.reservation_contract enable row level security;
alter table public.reservation_history enable row level security;
alter table public.receivable enable row level security;

revoke all on table
  public.app_settings, public.fin_category, public.reservation, public.reservation_item,
  public.reservation_payment, public.reservation_contract, public.reservation_history, public.receivable
  from public, anon, authenticated, service_role;
grant select on table
  public.app_settings, public.fin_category, public.reservation, public.reservation_item,
  public.reservation_payment, public.reservation_contract, public.reservation_history, public.receivable
  to service_role;
revoke all on sequence public.reservation_payment_seq_seq from public, anon, authenticated;
revoke all on sequence public.reservation_history_id_seq from public, anon, authenticated;

-- =====================================================================
-- Funções internas (sem execute para a API)
-- =====================================================================

-- Contrato assinado não muda (a edição do rascunho abre uma versão nova).
create function public.reservation_contract_frozen()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.signed_at is not null then
    raise exception 'ESTADO_INVALIDO' using detail = 'contract';
  end if;
  return new;
end
$$;

create trigger reservation_contract_frozen before update on public.reservation_contract
for each row execute function public.reservation_contract_frozen();

-- Grupos de estados (src/data/labels-ops.ts).
create function public.reservation_states(p_group text)
returns public.reservation_state[]
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_group
    -- ACTIVE_RESERVATION_STATES
    when 'active' then array['confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao']
    -- OUT_RESERVATION_STATES (peça na rua)
    when 'out' then array['retirada', 'em_uso', 'aguardando_devolucao']
    -- CLOSED_RESERVATION_STATES
    when 'closed' then array['finalizada', 'cancelada', 'no_show']
    -- REALIZED_RESERVATION_STATES
    when 'realized' then array['retirada', 'em_uso', 'aguardando_devolucao', 'devolvida', 'em_inspecao', 'finalizada']
    -- NO_RECEIVABLE_RESERVATION_STATES
    when 'no_receivable' then array['rascunho', 'cancelada', 'no_show']
    -- Chip "Ativas" da lista (spec §2.1)
    when 'list_active' then array['rascunho', 'confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao', 'devolvida', 'em_inspecao']
  end::public.reservation_state[]
$$;

-- "R$ 1.234,56" (brl de src/lib/format.ts).
create function public.brl(p numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when p < 0 then '-' else '' end || 'R$ '
         || translate(to_char(abs(round(coalesce(p, 0), 2)), 'FM999,999,999,990.00'), ',.', '.,')
$$;

-- Rótulo do tipo de bloco (BLOCK_KIND de src/data/labels.ts).
create function public.block_kind_label(p public.block_kind)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p
    when 'locacao' then 'Locação'
    when 'higienizacao' then 'Higienização'
    when 'inspecao' then 'Inspeção'
    when 'ajuste' then 'Ajuste'
    when 'manutencao' then 'Manutenção'
    when 'bloqueio_manual' then 'Bloqueio manual'
    when 'editorial' then 'Editorial'
  end
$$;

create function public.settings_json()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'defaultCleaningDays', s.default_cleaning_days,
    'defaultPrepDays', s.default_prep_days,
    'lateFeeDailyPercent', s.late_fee_daily_percent,
    'depositPercent', s.deposit_percent,
    'discountLimitPercent', s.discount_limit_percent,
    'minSignalPercent', s.min_signal_percent,
    'idleAlertDays', s.idle_alert_days
  )
  from public.app_settings s
  where s.id
$$;

-- Dias de higienização da peça: peça > categoria > padrão do sistema (effectiveCleaningDays).
create function public.garment_cleaning_days(p_garment uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(g.cleaning_days, c.cleaning_days, (select s.default_cleaning_days from public.app_settings s where s.id))
    from public.garment g
    join public.garment_category c on c.id = g.category_id
   where g.id = p_garment
$$;

-- Saldo (balance) e parcelas pendentes coerentes (pendingTargets) de src/domain/money.ts.
-- Só pagamentos `pago` contam; caução nunca abate; estorno de caução não mexe no saldo.
create function public.reservation_money(p_id uuid)
returns table (devido numeric, pago numeric, caucao numeric, due numeric, status text, target_saldo numeric, target_multa numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with r as (
    select x.total_net, x.late_fee from public.reservation x where x.id = p_id
  ),
  p as (
    select
      coalesce(sum(amount) filter (where kind not in ('caucao', 'estorno')), 0) as bruto,
      coalesce(sum(amount) filter (where kind not in ('caucao', 'estorno', 'multa')), 0) as rental_bruto,
      coalesce(sum(amount) filter (where kind = 'estorno' and refers_to is null), 0) as estorno_receita,
      coalesce(sum(amount) filter (where kind = 'estorno' and refers_to = 'caucao'), 0) as estorno_caucao,
      coalesce(sum(amount) filter (where kind = 'caucao'), 0) as caucao_bruto
    from public.reservation_payment
    where reservation_id = p_id and state = 'pago'
  ),
  m as (
    select round(r.total_net + r.late_fee, 2) as devido,
           round(p.bruto - p.estorno_receita, 2) as pago,
           greatest(0, round(p.caucao_bruto - p.estorno_caucao, 2)) as caucao,
           round(p.rental_bruto - p.estorno_receita, 2) as rental_paid,
           r.total_net
      from r, p
  ),
  d as (
    select m.*, greatest(0, round(m.devido - m.pago, 2)) as due from m
  )
  select d.devido, d.pago, d.caucao, d.due,
         case when d.pago <= 0 then 'nao_pago' when d.pago >= d.devido - 0.009 then 'pago' else 'parcial' end,
         least(d.due, greatest(0, round(d.total_net - d.rental_paid, 2))),
         round(d.due - least(d.due, greatest(0, round(d.total_net - d.rental_paid, 2))), 2)
    from d
$$;

-- Quanto falta receber (openReceivableDue): 0 em rascunho/cancelada/no-show.
create function public.reservation_open_due(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when r.state = any (public.reservation_states('no_receivable')) then 0
              else (select m.due from public.reservation_money(r.id) m) end
    from public.reservation r
   where r.id = p_id
$$;

-- % diário da multa: o do contrato vigente (o que a cliente assinou); sem contrato, o da configuração.
create function public.reservation_late_fee_percent(p_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select c.late_fee_daily_percent from public.reservation_contract c
      where c.reservation_id = p_id order by c.version desc limit 1),
    (select s.late_fee_daily_percent from public.app_settings s where s.id)
  )
$$;

-- Trava a reserva; inexistente → NAO_ENCONTRADO.
create function public.reservation_lock(p_id uuid)
returns public.reservation
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
begin
  select * into r from public.reservation where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  return r;
end
$$;

-- ESTADO_INVALIDO se a reserva não está num dos estados (ensureState).
create function public.reservation_ensure_state(p_state public.reservation_state, p_states public.reservation_state[])
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if not (p_state = any (p_states)) then
    raise exception 'ESTADO_INVALIDO';
  end if;
end
$$;

create function public.reservation_log(p_id uuid, p_from public.reservation_state, p_to public.reservation_state, p_reason text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.reservation_history (reservation_id, from_state, to_state, reason, user_id)
  values (p_id, p_from, p_to, p_reason, public.current_app_user_id())
$$;

create function public.reservation_transition(p_id uuid, p_to public.reservation_state, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from public.reservation_state;
begin
  select state into v_from from public.reservation where id = p_id for update;
  update public.reservation set state = p_to where id = p_id;
  perform public.reservation_log(p_id, v_from, p_to, p_reason);
end
$$;

-- Estado da peça sempre registrado no histórico (setGarmentState da fonte em memória),
-- mesmo quando não muda (ex.: "Reserva … confirmada" numa peça já reservada).
create function public.garment_log_state(p_garment uuid, p_to public.garment_state, p_reason text)
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
  end if;
  insert into public.garment_state_history (garment_id, from_state, to_state, reason, user_id)
  values (p_garment, v_from, p_to, p_reason, public.current_app_user_id());
end
$$;

-- Estado derivado da peça (deriveGarmentState de src/domain/calendar.ts): estados operacionais só
-- saem pela Operação; peça na rua → em_uso/aguardando_devolucao; senão o plano de hoje. Registra se muda.
create function public.garment_rederive(p_garment uuid, p_reason text)
returns public.garment_state
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_cur public.garment_state;
  v_next public.garment_state;
  v_out public.reservation_state;
begin
  select state into v_cur from public.garment where id = p_garment for update;
  if v_cur in ('baixado', 'bloqueado', 'higienizacao', 'inspecao', 'ajuste', 'manutencao') then
    return v_cur;
  end if;

  select r.state into v_out
    from public.reservation_item i
    join public.reservation r on r.id = i.reservation_id
   where i.garment_id = p_garment and i.item_state = 'retirado' and r.state = any (public.reservation_states('out'))
   order by r.created_at
   limit 1;

  if v_out is not null then
    v_next := case when v_out = 'aguardando_devolucao' then 'aguardando_devolucao' else 'em_uso' end;
  else
    with live as (
      select k.kind, lower(k.period) as f, upper(k.period) - 1 as t, i.item_state
        from public.garment_calendar_block k
        left join public.reservation r on r.id = k.reservation_id
        left join public.reservation_item i on i.reservation_id = k.reservation_id and i.garment_id = k.garment_id
       where k.garment_id = p_garment and k.released_at is null
         and not (k.kind = 'locacao' and r.state is not null and r.state = any (public.reservation_states('closed')))
         and (r.id is null or r.state <> 'rascunho')
    )
    select case
      when exists (select 1 from live where kind = 'locacao' and f <= v_today and t >= v_today
                     and coalesce(item_state::text, '') not in ('devolvido', 'inspecionado')) then 'reservado'
      when exists (select 1 from live where kind = 'higienizacao' and f <= v_today and t >= v_today) then 'higienizacao'
      when exists (select 1 from live where kind = 'locacao' and f > v_today) then 'reservado'
      else 'disponivel'
    end::public.garment_state into v_next;
  end if;

  if v_next is distinct from v_cur then
    perform public.garment_set_state(p_garment, v_next, p_reason);
  end if;
  return v_next;
end
$$;

-- Libera os blocos da reserva numa peça (ou em todas, com p_garment nulo).
create function public.reservation_release_blocks(p_id uuid, p_garment uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.garment_calendar_block
     set released_at = now()
   where reservation_id = p_id and released_at is null and (p_garment is null or garment_id = p_garment)
$$;

-- Reserva finalizada: a locação vira histórico (a peça já voltou); a higienização segue na agenda.
create function public.reservation_state_blocks()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.state = 'finalizada' and old.state is distinct from new.state then
    update public.garment_calendar_block
       set released_at = now()
     where reservation_id = new.id and kind = 'locacao' and released_at is null;
  end if;
  return null;
end
$$;

create trigger reservation_state_blocks after update of state on public.reservation
for each row execute function public.reservation_state_blocks();

-- Disponibilidade da peça no período (checkAvailability de src/domain/calendar.ts) → AvailabilityResult.
-- Janela = [retirada − preparação, devolução + higienização]; blocos ativos e outros rascunhos (draft: true).
create function public.garment_availability(p_garment uuid, p_pickup date, p_return date, p_ignore uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s public.app_settings;
  v_state public.garment_state;
  v_clean int;
  v_from date;
  v_to date;
  v_window jsonb;
  v_conflicts jsonb;
begin
  select * into s from public.app_settings where id;
  select g.state into v_state from public.garment g where g.id = p_garment;
  if not found then
    v_clean := s.default_cleaning_days;
    return jsonb_build_object(
      'garmentId', p_garment, 'ok', false, 'conflicts', '[]'::jsonb, 'reason', 'Peça inexistente.',
      'window', jsonb_build_object('from', p_pickup - s.default_prep_days, 'to', p_return + v_clean, 'cleaningDays', v_clean)
    );
  end if;
  v_clean := public.garment_cleaning_days(p_garment);
  v_from := p_pickup - s.default_prep_days;
  v_to := p_return + v_clean;
  v_window := jsonb_build_object('from', v_from, 'to', v_to, 'cleaningDays', v_clean);
  if v_state = 'baixado' then
    return jsonb_build_object('garmentId', p_garment, 'ok', false, 'conflicts', '[]'::jsonb, 'reason', 'Peça baixada do acervo.', 'window', v_window);
  end if;

  select coalesce(jsonb_agg(c.j order by c.grp, c.f, c.ord), '[]'::jsonb) into v_conflicts
  from (
    select 1 as grp, lower(k.period) as f, k.created_at::text || k.id::text as ord,
           jsonb_build_object(
             'kind', k.kind, 'label', public.block_kind_label(k.kind), 'from', lower(k.period), 'to', upper(k.period) - 1,
             'reservationCode', r.code, 'draft', false
           ) as j
      from public.garment_calendar_block k
      left join public.reservation r on r.id = k.reservation_id
     where k.garment_id = p_garment and k.released_at is null
       and (p_ignore is null or k.reservation_id is distinct from p_ignore)
       and not (k.kind = 'locacao' and r.state is not null and r.state = any (public.reservation_states('closed')))
       and k.period && daterange(v_from, v_to, '[]')
    union all
    select 2, r.created_at::date, r.created_at::text || r.code,
           jsonb_build_object(
             'kind', 'locacao', 'label', 'Rascunho', 'from', r.pickup_date - s.default_prep_days, 'to', r.return_due_date + v_clean,
             'reservationCode', r.code, 'draft', true
           )
      from public.reservation r
     where r.state = 'rascunho'
       and r.id is distinct from p_ignore
       and exists (select 1 from public.reservation_item i where i.reservation_id = r.id and i.garment_id = p_garment)
       and r.pickup_date - s.default_prep_days <= v_to and r.return_due_date + v_clean >= v_from
  ) c;

  return jsonb_build_object(
    'garmentId', p_garment, 'ok', jsonb_array_length(v_conflicts) = 0, 'conflicts', v_conflicts, 'reason', null, 'window', v_window
  );
end
$$;

-- Conflito que impede confirmar: peça baixada/inexistente ou bloco ativo (outro rascunho é só aviso).
create function public.availability_blocking(a jsonb)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select a ->> 'reason' is not null
      or exists (select 1 from jsonb_array_elements(a -> 'conflicts') c where not (c ->> 'draft')::boolean)
$$;

-- Rateio do desconto do pedido (prorate de src/domain/money.ts, em centavos) e totais da reserva
-- (priceItems de src/data/mock/pricing.ts). Os itens já têm preço, desconto da peça e posição.
create function public.reservation_reprice(p_id uuid, p_order_discount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ids uuid[];
  v_base bigint[];
  v_alloc bigint[];
  v_total bigint := 0;
  v_desc bigint;
  v_rest bigint;
  v_top int := 1;
  n int;
  k int;
begin
  select array_agg(i.id order by i.position),
         array_agg(greatest(0, round(i.unit_price * 100) - round(i.item_discount * 100))::bigint order by i.position)
    into v_ids, v_base
    from public.reservation_item i
   where i.reservation_id = p_id;
  n := coalesce(array_length(v_ids, 1), 0);
  for k in 1 .. n loop
    v_total := v_total + v_base[k];
  end loop;
  v_desc := least(greatest(0, round(coalesce(p_order_discount, 0) * 100)::bigint), v_total);
  v_alloc := array_fill(0::bigint, array[greatest(n, 1)]);
  if v_total > 0 and v_desc > 0 then
    v_rest := v_desc;
    for k in 1 .. n loop
      v_alloc[k] := (v_desc * v_base[k]) / v_total;
      v_rest := v_rest - v_alloc[k];
      if v_base[k] > v_base[v_top] then
        v_top := k;
      end if;
    end loop;
    if v_rest > 0 then
      v_alloc[v_top] := v_alloc[v_top] + v_rest;
    end if;
  end if;
  for k in 1 .. n loop
    update public.reservation_item
       set gross_amount = unit_price,
           allocated_order_discount = v_alloc[k] / 100.0,
           net_revenue = (v_base[k] - v_alloc[k]) / 100.0
     where id = v_ids[k];
  end loop;
  update public.reservation r
     set total_gross = coalesce((select round(sum(i.unit_price), 2) from public.reservation_item i where i.reservation_id = p_id), 0),
         discount = round(coalesce((select sum(i.item_discount) from public.reservation_item i where i.reservation_id = p_id), 0)
                          + coalesce(p_order_discount, 0), 2),
         total_net = coalesce((select round(sum(i.net_revenue), 2) from public.reservation_item i where i.reservation_id = p_id), 0)
   where r.id = p_id;
end
$$;

-- Corpo do contrato em texto plano (renderContract de src/data/mock/contract.ts; "Local e data" = hoje).
create function public.reservation_contract_body(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  c public.customer;
  s public.app_settings;
  v_name text;
  v_lines text;
  v_ref numeric;
  v_paid numeric;
  v_sinal numeric;
  v_phone text;
begin
  select * into r from public.reservation where id = p_id;
  select * into c from public.customer where id = r.customer_id;
  select * into s from public.app_settings where id;
  v_name := coalesce(c.full_name, '—');
  select string_agg('• ' || g.code || ' — ' || g.name || ' (' || g.color_primary || ', tam. ' || g.label_size || ') — '
                    || public.brl(i.gross_amount), E'\n' order by i.position),
         round(coalesce(sum(coalesce(nullif(g.retail_reference, 0), i.unit_price * 4)), 0), 2)
    into v_lines, v_ref
    from public.reservation_item i
    join public.garment g on g.id = i.garment_id
   where i.reservation_id = p_id;
  select coalesce(sum(p.amount), 0) into v_paid
    from public.reservation_payment p
   where p.reservation_id = p_id and p.state = 'pago' and p.kind in ('sinal', 'integral');
  v_sinal := case when v_paid > 0 then round(v_paid, 2) else round(r.total_net * s.min_signal_percent / 100, 2) end;
  v_phone := case
    when c.phone is null or c.phone = '' then '—'
    when length(c.phone) = 11 then '(' || substr(c.phone, 1, 2) || ') ' || substr(c.phone, 3, 5) || '-' || substr(c.phone, 8)
    else '(' || substr(c.phone, 1, 2) || ') ' || substr(c.phone, 3, 4) || '-' || substr(c.phone, 7)
  end;

  return concat_ws(E'\n',
    'CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº ' || regexp_replace(r.code, 'RS', 'CT'),
    '',
    'LOCADORA: Senzi Club — locação de vestuário feminino.',
    'LOCATÁRIA: ' || v_name || case when coalesce(c.cpf, '') <> ''
      then ' — CPF ' || substr(c.cpf, 1, 3) || '.' || substr(c.cpf, 4, 3) || '.' || substr(c.cpf, 7, 3) || '-' || substr(c.cpf, 10, 2)
      else '' end,
    'Telefone: ' || v_phone || case when coalesce(c.email, '') <> '' then ' · ' || c.email else '' end,
    '',
    '1. OBJETO',
    'A LOCADORA cede à LOCATÁRIA, a título de locação temporária, a(s) peça(s):',
    v_lines,
    '',
    'Valor de referência do acervo cedido: ' || public.brl(v_ref) || '.',
    '',
    '2. PRAZO',
    'Retirada: ' || to_char(r.pickup_date, 'DD/MM/YYYY'),
    'Evento: ' || coalesce(to_char(r.event_date, 'DD/MM/YYYY'), '—') || coalesce(' — ' || nullif(r.event_type, ''), ''),
    'Devolução prevista: ' || to_char(r.return_due_date, 'DD/MM/YYYY') || ' até as 18h.',
    '',
    '3. VALORES',
    'Locação: ' || public.brl(r.total_gross),
    'Desconto: ' || public.brl(r.discount),
    'Total: ' || public.brl(r.total_net),
    'Caução: ' || case when r.deposit_amount > 0 then public.brl(r.deposit_amount) else 'dispensada' end,
    'Sinal: ' || public.brl(v_sinal) || ' · Saldo: ' || public.brl(greatest(0, round(r.total_net - v_sinal, 2))) || ' até a retirada.',
    '',
    '4. RESPONSABILIDADES DA LOCATÁRIA',
    '4.1 Utilizar a peça exclusivamente no evento indicado, zelando por sua conservação.',
    '4.2 Não lavar, passar, tingir, cortar ou submeter a peça a qualquer processo de',
    '    higienização por conta própria. A higienização é realizada pela LOCADORA.',
    '4.3 Não ceder, sublocar ou emprestar a peça a terceiros.',
    '4.4 Comunicar imediatamente qualquer dano ocorrido durante o uso.',
    '',
    '5. ATRASO NA DEVOLUÇÃO',
    'O atraso implica multa diária de ' || trim_scale(s.late_fee_daily_percent)::text || '% sobre o valor da locação,',
    'por dia corrido de atraso, sem prejuízo da responsabilidade por prejuízos causados',
    'a reservas subsequentes da mesma peça.',
    '',
    '6. DANOS',
    '6.1 Desgaste natural de uso não gera cobrança.',
    '6.2 Manchas e danos recuperáveis: a LOCATÁRIA arca com o custo do reparo, mediante',
    '    orçamento apresentado pela LOCADORA.',
    '6.3 Dano irrecuperável ou extravio: a LOCATÁRIA arca com o valor de reposição da',
    '    peça, correspondente ao seu valor de referência.',
    '',
    '7. CANCELAMENTO',
    '7.1 Até 15 dias antes da retirada: devolução integral dos valores pagos.',
    '7.2 Entre 14 e 7 dias: retenção de 30% do valor da locação.',
    '7.3 A menos de 7 dias: retenção de 50% do valor da locação.',
    '7.4 Não comparecimento (no-show): retenção integral.',
    '',
    '8. PROVA E AJUSTES',
    'Ajustes de barra e pences, quando possíveis, são realizados pela LOCADORA sem custo',
    'adicional e são desfeitos após a devolução. Alterações irreversíveis não são permitidas.',
    '',
    'Local e data: ______________________, ' || to_char(public.store_today(), 'DD/MM/YYYY'),
    '',
    '',
    repeat('_', 31) || repeat(' ', 8) || repeat('_', 31),
    v_name || repeat(' ', greatest(0, 40 - length(v_name))) || 'Senzi Club',
    'LOCATÁRIA' || repeat(' ', 31) || 'LOCADORA'
  );
end
$$;

-- Gera (v1) ou regera (versão + 1) o contrato. Assinado não muda: a edição abre uma versão nova,
-- não assinada, e registra a troca no histórico.
create function public.reservation_write_contract(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r public.reservation;
  prev public.reservation_contract;
begin
  select * into r from public.reservation where id = p_id;
  select * into prev from public.reservation_contract where reservation_id = p_id order by version desc limit 1;
  if prev.signed_at is not null then
    perform public.reservation_log(p_id, null, r.state,
      'Contrato v' || prev.version || ' assinado substituído pela v' || (prev.version + 1));
  end if;
  insert into public.reservation_contract (reservation_id, number, version, body_rendered, late_fee_daily_percent, deposit)
  values (
    p_id,
    regexp_replace(r.code, 'RS', 'CT'),
    coalesce(prev.version, 0) + 1,
    public.reservation_contract_body(p_id),
    (select s.late_fee_daily_percent from public.app_settings s where s.id),
    r.deposit_amount
  );
end
$$;

-- Parcelas pendentes coerentes com o saldo (syncPending): `saldo` e `multa` pendentes recebem os alvos;
-- zeradas, somem. Com p_multa_notes (devolução com atraso), atualiza/cria a parcela de multa.
create function public.reservation_sync_pending(p_id uuid, p_multa_notes text, p_multa_due date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m record;
begin
  select * into m from public.reservation_money(p_id);
  delete from public.reservation_payment
   where reservation_id = p_id and state = 'pendente'
     and ((kind = 'saldo' and m.target_saldo <= 0) or (kind = 'multa' and m.target_multa <= 0));
  update public.reservation_payment set amount = m.target_saldo
   where reservation_id = p_id and state = 'pendente' and kind = 'saldo' and amount <> m.target_saldo;
  update public.reservation_payment
     set amount = m.target_multa,
         notes = case when p_multa_notes is not null then p_multa_notes else notes end,
         due_at = case when p_multa_notes is not null then p_multa_due else due_at end
   where reservation_id = p_id and state = 'pendente' and kind = 'multa';
  if p_multa_notes is not null and m.target_multa > 0
     and not exists (select 1 from public.reservation_payment where reservation_id = p_id and kind = 'multa' and state = 'pendente') then
    insert into public.reservation_payment (reservation_id, kind, method, amount, state, due_at, notes, created_by)
    values (p_id, 'multa', 'pix', m.target_multa, 'pendente', p_multa_due, p_multa_notes, public.current_app_user_id());
  end if;
end
$$;

-- Exceção utilizável (usableException): existe, é do tipo pedido, não foi usada, foi pedida por quem
-- está usando e aponta para esta reserva (`reserva`) ou para um rascunho ainda sem id
-- (`reserva_rascunho`, só se p_draft). Devolve o id ou null. Trava a linha.
create function public.reservation_exception_usable(p_exc uuid, p_kind text, p_reservation uuid, p_draft boolean)
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
     or e.requested_by is distinct from public.current_app_user_id() then
    return null;
  end if;
  if e.ref_type = 'reserva_rascunho' then
    return case when p_draft then e.id end;
  end if;
  return case when p_reservation is not null and e.ref_id = p_reservation then e.id end;
end
$$;

-- Grava o uso da exceção (consumeException): valor, vínculo com a reserva e entrada no histórico.
create function public.reservation_exception_consume(p_exc uuid, p_reservation uuid, p_amount numeric)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text;
  v_state public.reservation_state;
begin
  update public.exception_authorization
     set reservation_id = p_reservation, ref_type = 'reserva', ref_id = p_reservation,
         amount = round(p_amount, 2), consumed_at = now()
   where id = p_exc;
  select 'Exceção autorizada: ' || coalesce(nullif(e.reason, ''), e.kind) || ' (' || coalesce(u.full_name, '—') || ')'
    into v_reason
    from public.exception_authorization e
    left join public.app_user u on u.id = e.authorized_by
   where e.id = p_exc;
  select state into v_state from public.reservation where id = p_reservation;
  perform public.reservation_log(p_reservation, null, v_state, v_reason);
end
$$;

-- Realinha os blocos da reserva na devolução real (realignOnReturn, buffer comprimível): a locação termina
-- na devolução (nunca antes do início); a higienização vai para [real+1, real+dias], cortada no início do
-- próximo bloco de outra reserva; sem espaço, é liberada; se não existia, é criada.
-- Diferença do banco: blocos ativos não se sobrepõem, então a locação atrasada para no dia anterior ao
-- próximo bloco de outra reserva (a fonte em memória deixaria as duas locações sobrepostas).
create function public.reservation_realign_on_return(p_garment uuid, p_id uuid, p_actual date)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_loc public.garment_calendar_block;
  v_hig public.garment_calendar_block;
  v_clean int := public.garment_cleaning_days(p_garment);
  v_end date;
  v_next date;
  v_from date := p_actual + 1;
  v_to date := p_actual + v_clean;
  v_wants boolean;
begin
  select * into v_loc from public.garment_calendar_block
   where garment_id = p_garment and reservation_id = p_id and kind = 'locacao' and released_at is null
   limit 1 for update;
  if v_loc.id is null then
    return;
  end if;
  select * into v_hig from public.garment_calendar_block
   where garment_id = p_garment and reservation_id = p_id and kind = 'higienizacao' and released_at is null
   limit 1 for update;

  v_end := greatest(p_actual, lower(v_loc.period));
  select min(lower(k.period)) into v_next
    from public.garment_calendar_block k
   where k.garment_id = p_garment and k.released_at is null and k.reservation_id is distinct from p_id
     and lower(k.period) > lower(v_loc.period);
  if v_next is not null and v_end >= v_next then
    v_end := greatest(lower(v_loc.period), v_next - 1);
  end if;

  select least(v_to, min(lower(k.period)) - 1) into v_to
    from public.garment_calendar_block k
   where k.garment_id = p_garment and k.released_at is null and k.reservation_id is distinct from p_id
     and lower(k.period) between v_from and p_actual + v_clean;
  v_to := coalesce(v_to, p_actual + v_clean);
  v_wants := v_clean > 0 and v_to >= v_from
    and v_from > v_end
    and not exists (
      select 1 from public.garment_calendar_block k
       where k.garment_id = p_garment and k.released_at is null and k.reservation_id is distinct from p_id
         and k.period && daterange(v_from, v_to, '[]')
    );

  -- Higienização sai do caminho antes de a locação mudar (blocos ativos não se sobrepõem).
  if v_hig.id is not null then
    update public.garment_calendar_block set released_at = now() where id = v_hig.id;
  end if;
  update public.garment_calendar_block set period = daterange(lower(v_loc.period), v_end, '[]') where id = v_loc.id;
  if v_wants then
    if v_hig.id is not null then
      update public.garment_calendar_block
         set period = daterange(v_from, v_to, '[]'), released_at = null
       where id = v_hig.id;
    else
      insert into public.garment_calendar_block (garment_id, reservation_id, kind, period, note, created_by)
      values (p_garment, p_id, 'higienizacao', daterange(v_from, v_to, '[]'), 'Higienização pós-uso', public.current_app_user_id());
    end if;
  end if;
end
$$;

-- Reserva no formato do app (Reservation). CPF no contrato fica oculto sem cliente.edit (como hideCPF).
create function public.reservation_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'customerId', r.customer_id,
    'state', r.state,
    'eventDate', r.event_date,
    'eventType', r.event_type,
    'eventVenue', r.event_venue,
    'pickupDate', r.pickup_date,
    'returnDueDate', r.return_due_date,
    'pickedUpAt', public.store_instant(r.picked_up_at),
    'returnedAt', public.store_instant(r.returned_at),
    'channel', r.channel,
    'totalGross', r.total_gross,
    'discount', r.discount,
    'totalNet', r.total_net,
    'depositAmount', r.deposit_amount,
    'lateFee', r.late_fee,
    'notes', r.notes,
    'cancelReason', r.cancel_reason,
    'createdBy', r.created_by,
    'createdAt', public.store_instant(r.created_at),
    'fittingId', r.fitting_id,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id,
               'reservationId', i.reservation_id,
               'garmentId', i.garment_id,
               'unitPrice', i.unit_price,
               'grossAmount', i.gross_amount,
               'itemDiscount', i.item_discount,
               'allocatedOrderDiscount', i.allocated_order_discount,
               'netRevenue', i.net_revenue,
               'itemState', i.item_state,
               'pickedUpAt', public.store_instant(i.picked_up_at),
               'returnedAt', public.store_instant(i.returned_at),
               'pickupNote', i.pickup_note,
               'returnNote', i.return_note,
               'alterationNotes', i.alteration_notes
             ) order by i.position)
        from public.reservation_item i
       where i.reservation_id = r.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'reservationId', p.reservation_id,
               'kind', p.kind,
               'method', p.method,
               'amount', p.amount,
               'state', p.state,
               'paidAt', public.store_instant(p.paid_at),
               'dueAt', p.due_at,
               'reference', p.reference,
               'notes', p.notes,
               'refersTo', p.refers_to,
               'createdBy', p.created_by,
               'createdAt', public.store_instant(p.created_at)
             ) order by p.seq)
        from public.reservation_payment p
       where p.reservation_id = r.id
    ), '[]'::jsonb),
    'contract', (
      select jsonb_build_object(
               'id', c.id,
               'reservationId', c.reservation_id,
               'number', c.number,
               'version', c.version,
               'bodyRendered', case when public.has_perm('cliente.edit') then c.body_rendered
                                    else regexp_replace(c.body_rendered, 'CPF \d{3}\.(\d{3})\.(\d{3})-\d{2}', 'CPF ***.\1.\2-**') end,
               'generatedAt', public.store_instant(c.generated_at),
               'templateVersion', c.template_version,
               'terms', jsonb_build_object('lateFeeDailyPercent', c.late_fee_daily_percent, 'deposit', c.deposit),
               'signedAt', public.store_instant(c.signed_at),
               'signedBy', c.signed_by,
               'signerName', c.signer_name,
               'signatureKind', c.signature_kind,
               'signatureNotes', c.signature_notes,
               'pdfPath', c.pdf_path
             )
        from public.reservation_contract c
       where c.reservation_id = r.id
       order by c.version desc
       limit 1
    ),
    'authorizations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id,
               'reservationId', e.reservation_id,
               'kind', e.kind,
               'amount', e.amount,
               'reason', e.reason,
               'authorizedBy', e.authorized_by,
               'authorizedByName', coalesce(u.full_name, '—'),
               'authorizedByRole', 'Administrador',
               'authorizedAt', public.store_instant(e.created_at),
               'refType', e.ref_type
             ) order by e.consumed_at, e.id)
        from public.exception_authorization e
        left join public.app_user u on u.id = e.authorized_by
       where e.reservation_id = r.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', h.id::text,
               'fromState', h.from_state,
               'toState', h.to_state,
               'reason', h.reason,
               'userId', h.user_id,
               'userName', coalesce(u.full_name, 'Sistema'),
               'occurredAt', public.store_instant(h.occurred_at)
             ) order by h.id)
        from public.reservation_history h
        left join public.app_user u on u.id = h.user_id
       where h.reservation_id = r.id
    ), '[]'::jsonb),
    'balance', (
      select jsonb_build_object('devido', m.devido, 'pago', m.pago, 'caucao', m.caucao, 'due', m.due, 'status', m.status)
        from public.reservation_money(r.id) m
    )
  )
  from public.reservation r
  where r.id = p_id
$$;

-- Linha da lista (ReservationRow). payStatus null e due 0 em rascunho/cancelada/no-show.
create function public.reservation_row_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id,
    'code', r.code,
    'state', r.state,
    'customerName', coalesce(c.full_name, '—'),
    'garments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'code', g.code,
               'shortName', regexp_replace(g.name, '^(Vestido|Macacão|Conjunto|Saia|Clutch) ', '')
             ) order by i.position)
        from public.reservation_item i
        join public.garment g on g.id = i.garment_id
       where i.reservation_id = r.id
    ), '[]'::jsonb),
    'eventDate', r.event_date,
    'eventType', r.event_type,
    'pickupDate', r.pickup_date,
    'returnDueDate', r.return_due_date,
    'daysLate', case when r.state = any (public.reservation_states('out'))
                     then greatest(0, public.store_today() - r.return_due_date) else 0 end,
    'payStatus', case when r.state = any (public.reservation_states('no_receivable')) then null else m.status end,
    'totalNet', r.total_net,
    'due', case when r.state = any (public.reservation_states('no_receivable')) then 0 else m.due end
  )
  from public.reservation r
  left join public.customer c on c.id = r.customer_id
  cross join lateral public.reservation_money(r.id) m
  where r.id = p_id
$$;

-- Ficha (ReservationDetail): reserva + cliente, peças (o app assina as fotos), conflitos (só em rascunho),
-- prova de origem, sinal mínimo e caução sugerida (depositSuggestion).
create function public.reservation_detail_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.reservation_json(r.id) || jsonb_build_object(
    'customer', public.customer_json(r.customer_id),
    'garments', coalesce((
      select jsonb_agg(public.garment_json(i.garment_id) order by i.position)
        from public.reservation_item i where i.reservation_id = r.id
    ), '[]'::jsonb),
    'conflicts', case when r.state = 'rascunho' then coalesce((
      select jsonb_agg(a.j order by a.position)
        from (
          select i.position, public.garment_availability(i.garment_id, r.pickup_date, r.return_due_date, r.id) as j
            from public.reservation_item i where i.reservation_id = r.id
        ) a
       where not (a.j ->> 'ok')::boolean
    ), '[]'::jsonb) else '[]'::jsonb end,
    'fittingCode', f.code,
    'fittingDate', to_char(f.scheduled_at at time zone 'America/Araguaina', 'YYYY-MM-DD'),
    'minSignal', round(r.total_net * s.min_signal_percent / 100, 2),
    'depositSuggested', case
      when s.deposit_percent > 0 then round(coalesce((
        select sum(coalesce(g.retail_reference, 0)) from public.reservation_item i join public.garment g on g.id = i.garment_id
         where i.reservation_id = r.id
      ), 0) * s.deposit_percent / 100, 2)
      else coalesce(nullif((
        select case when c.slug = 'bolsa-acessorio' then 0 else round(coalesce(g.retail_reference, 0) * 0.1 / 10) * 10 end
          from public.reservation_item i
          join public.garment g on g.id = i.garment_id
          join public.garment_category c on c.id = g.category_id
         where i.reservation_id = r.id
         order by i.position
         limit 1
      ), 0), round((select m.devido from public.reservation_money(r.id) m) * 0.1, 2))
    end
  )
  from public.reservation r
  cross join public.app_settings s
  left join public.fitting_session f on f.id = r.fitting_id
  where r.id = p_id and s.id
$$;

-- Privilégios das funções internas -------------------------------------------
revoke all on function public.reservation_contract_frozen() from public, anon, authenticated;
revoke all on function public.reservation_states(text) from public, anon, authenticated;
revoke all on function public.brl(numeric) from public, anon, authenticated;
revoke all on function public.block_kind_label(public.block_kind) from public, anon, authenticated;
revoke all on function public.settings_json() from public, anon, authenticated;
revoke all on function public.garment_cleaning_days(uuid) from public, anon, authenticated;
revoke all on function public.reservation_money(uuid) from public, anon, authenticated;
revoke all on function public.reservation_open_due(uuid) from public, anon, authenticated;
revoke all on function public.reservation_late_fee_percent(uuid) from public, anon, authenticated;
revoke all on function public.reservation_lock(uuid) from public, anon, authenticated;
revoke all on function public.reservation_ensure_state(public.reservation_state, public.reservation_state[]) from public, anon, authenticated;
revoke all on function public.reservation_log(uuid, public.reservation_state, public.reservation_state, text) from public, anon, authenticated;
revoke all on function public.reservation_transition(uuid, public.reservation_state, text) from public, anon, authenticated;
revoke all on function public.garment_log_state(uuid, public.garment_state, text) from public, anon, authenticated;
revoke all on function public.garment_rederive(uuid, text) from public, anon, authenticated;
revoke all on function public.reservation_release_blocks(uuid, uuid) from public, anon, authenticated;
revoke all on function public.reservation_state_blocks() from public, anon, authenticated;
revoke all on function public.garment_availability(uuid, date, date, uuid) from public, anon, authenticated;
revoke all on function public.availability_blocking(jsonb) from public, anon, authenticated;
revoke all on function public.reservation_reprice(uuid, numeric) from public, anon, authenticated;
revoke all on function public.reservation_contract_body(uuid) from public, anon, authenticated;
revoke all on function public.reservation_write_contract(uuid) from public, anon, authenticated;
revoke all on function public.reservation_sync_pending(uuid, text, date) from public, anon, authenticated;
revoke all on function public.reservation_exception_usable(uuid, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.reservation_exception_consume(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.reservation_realign_on_return(uuid, uuid, date) from public, anon, authenticated;
revoke all on function public.reservation_json(uuid) from public, anon, authenticated;
revoke all on function public.reservation_row_json(uuid) from public, anon, authenticated;
revoke all on function public.reservation_detail_json(uuid) from public, anon, authenticated;

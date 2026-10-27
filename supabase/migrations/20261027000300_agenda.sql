-- =====================================================================
-- Senzi OS · Agenda e Provas: compromissos, sessões de prova e peças provadas.
--
-- Mesmo padrão do Acervo/Clientes: tabelas sem grant para anon/authenticated; toda
-- leitura e escrita pelas RPCs abaixo (security definer), que checam has_perm().
-- Regras e códigos de erro = fonte em memória (src/data/mock/agenda.ts,
-- src/data/validation.ts → appointmentIssues/fittingIssues, src/domain/fittings.ts).
--
-- Instantes do app (startsAt, scheduledAt, startedAt, endedAt, recordedAt) saem no
-- fuso da loja, `aaaa-mm-ddTHH:MM:SS-03:00` (public.store_instant): a agenda agrupa
-- pelos 10 primeiros caracteres e mostra a hora pelos caracteres 11–16.
--
-- Pontos de extensão para a área 3 (Reservas) — cada um com `create or replace`:
--   · public.appointment_reservation_json(reserva, tipo): reserva, peças e contadores
--     (pendingPickupItems / itemsOut) do item da agenda. Hoje: nada.
--   · public.fitting_reservation_json(reserva): bloco `reservation` do detalhe da prova. Hoje: null.
--   · public.reservation_has_garment(reserva, peça): conversão por peça (fittingStatsOf). Hoje: false.
--   · As colunas `appointment.reservation_id` e `fitting_session.reservation_id` ficam
--     sem FK; a área 3 cria a tabela `reservation` e acrescenta as FKs.
--   · Funções internas já prontas para a área 3 chamar:
--       public.appointment_insert(...)  → compromissos automáticos da confirmação
--                                         (retirada 10:00, evento 19:00, devolução 11:00).
--       public.fitting_convert(prova, reserva, cliente) → prova vira `convertida`
--                                         quando o rascunho da reserva nasce dela.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.appointment_kind as enum ('prova', 'retirada', 'devolucao', 'atendimento', 'evento', 'servico', 'interno');
create type public.appointment_state as enum ('agendado', 'concluido', 'cancelado', 'no_show');
create type public.fitting_state as enum ('agendada', 'em_curso', 'concluida', 'convertida', 'perdida', 'no_show');
create type public.fit_outcome as enum (
  'favorita', 'serviu', 'gostou', 'precisa_ajuste', 'apertada', 'larga', 'nao_gostou', 'descartada', 'nao_provou'
);

-- Tabelas --------------------------------------------------------------
create table public.fitting_session (
  id uuid primary key default gen_random_uuid(),
  -- PR-<ano da data da prova>-NNNN
  code text not null unique,
  customer_id uuid not null references public.customer (id),
  state public.fitting_state not null default 'agendada',
  scheduled_at timestamptz not null,
  started_at timestamptz,
  ended_at timestamptz,
  attendant_id uuid references public.app_user (id),
  event_type text,
  event_date date,
  budget numeric(12, 2) check (budget >= 0),
  notes text,
  outcome_notes text,
  -- Preenchido na conversão (public.fitting_convert). FK para reservation entra na área 3.
  reservation_id uuid,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default now()
);

create index fitting_session_customer_idx on public.fitting_session (customer_id, scheduled_at desc);
create index fitting_session_scheduled_idx on public.fitting_session (scheduled_at desc, id desc);
create index fitting_session_state_idx on public.fitting_session (state);
create index fitting_session_attendant_idx on public.fitting_session (attendant_id);
create index fitting_session_reservation_idx on public.fitting_session (reservation_id);
create index fitting_session_created_by_idx on public.fitting_session (created_by);

-- Uma linha por peça dentro da sessão.
create table public.fitting_item (
  fitting_session_id uuid not null references public.fitting_session (id) on delete cascade,
  garment_id uuid not null references public.garment (id),
  position int not null,
  outcome public.fit_outcome not null default 'nao_provou',
  needs_alteration boolean not null default false,
  note text,
  recorded_by uuid references public.app_user (id),
  recorded_at timestamptz,
  primary key (fitting_session_id, garment_id)
);

create index fitting_item_garment_idx on public.fitting_item (garment_id);
create index fitting_item_recorded_by_idx on public.fitting_item (recorded_by);

create table public.appointment (
  id uuid primary key default gen_random_uuid(),
  kind public.appointment_kind not null,
  starts_at timestamptz not null,
  title text,
  notes text,
  state public.appointment_state not null default 'agendado',
  customer_id uuid references public.customer (id),
  -- Compromissos automáticos da reserva (área 3). FK para reservation entra na área 3.
  reservation_id uuid,
  fitting_id uuid references public.fitting_session (id) on delete cascade,
  garment_id uuid references public.garment (id),
  assigned_to uuid references public.app_user (id),
  internal boolean generated always as (kind = 'interno') stored,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp(),
  constraint appointment_prova_has_fitting check (kind <> 'prova' or fitting_id is not null)
);

create index appointment_starts_idx on public.appointment (starts_at) where state <> 'cancelado';
create index appointment_customer_idx on public.appointment (customer_id);
create index appointment_reservation_idx on public.appointment (reservation_id);
create index appointment_fitting_idx on public.appointment (fitting_id);
create index appointment_garment_idx on public.appointment (garment_id);
create index appointment_assigned_idx on public.appointment (assigned_to);
create index appointment_created_by_idx on public.appointment (created_by);

create trigger fitting_session_audit after insert or update or delete on public.fitting_session
for each row execute function public.audit_trigger();
create trigger fitting_item_audit after insert or update or delete on public.fitting_item
for each row execute function public.audit_trigger();
create trigger appointment_audit after insert or update or delete on public.appointment
for each row execute function public.audit_trigger();

-- RLS e privilégios das tabelas ------------------------------------------
alter table public.fitting_session enable row level security;
alter table public.fitting_item enable row level security;
alter table public.appointment enable row level security;

revoke all on table public.fitting_session, public.fitting_item, public.appointment
  from public, anon, authenticated, service_role;
grant select on table public.fitting_session, public.fitting_item, public.appointment
  to service_role;

-- Funções internas (sem execute para a API) --------------------------------

-- Instante no fuso da loja, no formato do app (`2026-10-24T10:30:00-03:00`). Palmas/Araguaína não tem horário de verão.
create function public.store_instant(p timestamptz)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select to_char(p at time zone 'America/Araguaina', 'YYYY-MM-DD"T"HH24:MI:SS') || '-03:00'
$$;

-- Data + `HH:MM` no fuso da loja → instante.
create function public.store_at(p_date date, p_time time)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select (p_date + p_time) at time zone 'America/Araguaina'
$$;

-- `HH:MM` válido → time; senão null.
create function public.try_hhmm(p text)
returns time
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p is null or p !~ '^([01]\d|2[0-3]):[0-5]\d$' then
    return null;
  end if;
  return p::time;
end
$$;

-- Rótulo do tipo de compromisso (AG_KIND de src/data/labels-ops.ts).
create function public.appointment_kind_label(p public.appointment_kind)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p
    when 'prova' then 'Prova'
    when 'retirada' then 'Retirada'
    when 'devolucao' then 'Devolução'
    when 'atendimento' then 'Atendimento'
    when 'evento' then 'Evento'
    when 'servico' then 'Serviço'
    when 'interno' then 'Interno'
  end
$$;

-- Resultado que conta como "aprovada" (FIT_OUTCOME.positive = true).
create function public.fit_outcome_positive(p public.fit_outcome)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select p in ('favorita', 'serviu', 'gostou', 'precisa_ajuste')
$$;

-- PONTO DE EXTENSÃO (área 3): parte da reserva no item da agenda. Devolve as chaves que
-- sobrescrevem o item base: {"reservation": {id, code}, "garments": [{id, code, name}…]} e,
-- em `retirada`, "pendingPickupItems" (itens pendentes); em `devolucao`, "itemsOut" (itens retirados).
-- Enquanto Reservas não está no banco, nada a acrescentar.
create function public.appointment_reservation_json(p_reservation uuid, p_kind public.appointment_kind)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select '{}'::jsonb
$$;

-- PONTO DE EXTENSÃO (área 3): bloco `reservation` do detalhe da prova
-- ({id, code, customerName, eventDate}). Enquanto Reservas não está no banco, null.
create function public.fitting_reservation_json(p_reservation uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select null::jsonb
$$;

-- PONTO DE EXTENSÃO (área 3): a reserva contém a peça? (conversão por peça em fitting_stats_of).
create function public.reservation_has_garment(p_reservation uuid, p_garment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select false
$$;

-- Compromisso no formato do app (Appointment).
create function public.appointment_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', a.id,
    'kind', a.kind,
    'startsAt', public.store_instant(a.starts_at),
    'title', a.title,
    'notes', a.notes,
    'state', a.state,
    'customerId', a.customer_id,
    'reservationId', a.reservation_id,
    'fittingId', a.fitting_id,
    'garmentId', a.garment_id,
    'assignedTo', a.assigned_to,
    'internal', a.internal,
    'createdBy', a.created_by
  )
  from public.appointment a
  where a.id = p_id
$$;

-- Item da agenda (AgendaItem): cliente, prova e, via appointment_reservation_json, a reserva.
create function public.agenda_item_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', a.id,
           'time', to_char(a.starts_at at time zone 'America/Araguaina', 'HH24:MI'),
           'kind', a.kind,
           'customer', case when c.id is not null then jsonb_build_object('id', c.id, 'fullName', c.full_name) end,
           'reservation', null,
           'fitting', case when f.id is not null then jsonb_build_object('id', f.id, 'code', f.code) end,
           'garments', '[]'::jsonb,
           'title', coalesce(a.title, public.appointment_kind_label(a.kind)),
           'notes', a.notes,
           'state', a.state,
           'internal', a.internal
         )
         || case when a.reservation_id is not null then public.appointment_reservation_json(a.reservation_id, a.kind) else '{}'::jsonb end
  from public.appointment a
  left join public.customer c on c.id = a.customer_id
  left join public.fitting_session f on f.id = a.fitting_id
  where a.id = p_id
$$;

-- Insere um compromisso (manual ou automático) e devolve o id. `created_by` = usuário da sessão.
-- Usada por create_appointment e create_fitting; a área 3 chama esta função na confirmação da
-- reserva (retirada/evento/devolução, com reservation_id e garment_id quando há uma só peça).
create function public.appointment_insert(
  p_kind public.appointment_kind,
  p_starts_at timestamptz,
  p_title text,
  p_notes text,
  p_customer uuid,
  p_reservation uuid,
  p_fitting uuid,
  p_garment uuid,
  p_assigned_to uuid,
  p_state public.appointment_state default 'agendado'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  insert into public.appointment (kind, starts_at, title, notes, state, customer_id, reservation_id, fitting_id, garment_id, assigned_to, created_by)
  values (p_kind, p_starts_at, p_title, p_notes, p_state, p_customer, p_reservation, p_fitting, p_garment, p_assigned_to, public.current_app_user_id())
  returning id into v_id;
  return v_id;
end
$$;

-- AppointmentInput validado (appointmentIssues; levanta o primeiro problema). Cliente informada precisa existir.
create function public.appointment_validate(p jsonb)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text := public.jtext(p, 'kind');
  v_customer text := nullif(public.jtext(p, 'customerId'), '');
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  perform public.jenum_check(coalesce(v_kind, '') in ('atendimento', 'servico', 'interno'), 'kind');
  if public.try_iso_date(public.jtext(p, 'date')) is null then
    raise exception 'DATA_OBRIGATORIA' using detail = 'date';
  end if;
  if public.try_hhmm(public.jtext(p, 'time')) is null then
    raise exception 'HORARIO_OBRIGATORIO' using detail = 'time';
  end if;
  if v_kind = 'atendimento' and v_customer is null then
    raise exception 'CLIENTE_OBRIGATORIA' using detail = 'customerId';
  elsif v_kind <> 'atendimento' and v_customer is null and coalesce(public.jtext(p, 'notes'), '') = '' then
    raise exception 'OBSERVACAO_OBRIGATORIA' using detail = 'notes';
  end if;
  if v_customer is not null then
    perform public.customer_must_exist(public.try_uuid(v_customer));
  end if;
end
$$;

-- Aplica um AppointmentInput já validado. Título: "Atendimento"; nos demais, a observação ou o rótulo do tipo.
create function public.appointment_apply(p_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind public.appointment_kind := public.jtext(p, 'kind')::public.appointment_kind;
  v_notes text := nullif(public.jtext(p, 'notes'), '');
begin
  update public.appointment set
    kind = v_kind,
    starts_at = public.store_at(public.try_iso_date(public.jtext(p, 'date')), public.try_hhmm(public.jtext(p, 'time'))),
    title = case when v_kind = 'atendimento' then 'Atendimento' else coalesce(v_notes, public.appointment_kind_label(v_kind)) end,
    notes = v_notes,
    customer_id = public.try_uuid(nullif(public.jtext(p, 'customerId'), ''))
  where id = p_id;
end
$$;

-- Compromisso manual (atendimento/serviço/interno, sem reserva nem prova) e agendado, travado; senão erro.
create function public.appointment_manual_lock(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.appointment;
begin
  select * into a from public.appointment where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if a.kind not in ('atendimento', 'servico', 'interno') or a.reservation_id is not null or a.fitting_id is not null
     or a.state <> 'agendado' then
    raise exception 'ESTADO_INVALIDO';
  end if;
end
$$;

-- Sessão de prova no formato do app (FittingSession).
create function public.fitting_session_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', f.id,
    'code', f.code,
    'customerId', f.customer_id,
    'state', f.state,
    'scheduledAt', public.store_instant(f.scheduled_at),
    'startedAt', public.store_instant(f.started_at),
    'endedAt', public.store_instant(f.ended_at),
    'attendantId', f.attendant_id,
    'eventType', f.event_type,
    'eventDate', f.event_date,
    'budget', f.budget,
    'notes', f.notes,
    'outcomeNotes', f.outcome_notes,
    'reservationId', f.reservation_id,
    'createdBy', f.created_by
  )
  from public.fitting_session f
  where f.id = p_id
$$;

-- Linha da lista (FittingListRow): sessão + nome da cliente e contagens.
create function public.fitting_row_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fitting_session_json(f.id) || jsonb_build_object(
    'customerName', c.full_name,
    'itemCount', (select count(*) from public.fitting_item i where i.fitting_session_id = f.id),
    'approvedCount', (select count(*) from public.fitting_item i where i.fitting_session_id = f.id and public.fit_outcome_positive(i.outcome)),
    'discardedCount', (select count(*) from public.fitting_item i where i.fitting_session_id = f.id and i.outcome in ('descartada', 'nao_gostou'))
  )
  from public.fitting_session f
  join public.customer c on c.id = f.customer_id
  where f.id = p_id
$$;

-- Linha do histórico (FittingHistoryRow): linha da lista + peças na ordem da prova (só `p_only`, se informada).
create function public.fitting_history_json(p_id uuid, p_only uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.fitting_row_json(p_id) || jsonb_build_object('items', coalesce((
    select jsonb_agg(jsonb_build_object(
             'garmentId', g.id,
             'garmentCode', g.code,
             'garmentName', g.name,
             'outcome', i.outcome,
             'note', i.note,
             'needsAlteration', i.needs_alteration
           ) order by i.position)
      from public.fitting_item i
      join public.garment g on g.id = i.garment_id
     where i.fitting_session_id = p_id and (p_only is null or i.garment_id = p_only)
  ), '[]'::jsonb))
$$;

-- Detalhe da prova (FittingDetail): sessão, cliente, atendente, peças (com a peça e se é favorita) e reserva.
create function public.fitting_detail_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'session', public.fitting_session_json(f.id),
    'customer', public.customer_json(f.customer_id),
    'attendantName', u.full_name,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fittingSessionId', i.fitting_session_id,
               'garmentId', i.garment_id,
               'position', i.position,
               'outcome', i.outcome,
               'needsAlteration', i.needs_alteration,
               'note', i.note,
               'recordedBy', i.recorded_by,
               'recordedAt', public.store_instant(i.recorded_at),
               'garment', public.garment_json(i.garment_id),
               'favorite', exists (
                 select 1 from public.customer_favorite cf where cf.customer_id = f.customer_id and cf.garment_id = i.garment_id
               )
             ) order by i.position)
        from public.fitting_item i
       where i.fitting_session_id = f.id
    ), '[]'::jsonb),
    'reservation', case when f.reservation_id is not null then public.fitting_reservation_json(f.reservation_id) end
  )
  from public.fitting_session f
  left join public.app_user u on u.id = f.attendant_id
  where f.id = p_id
$$;

-- Trava a prova e exige que esteja aberta (agendada ou em curso). Inexistente → NAO_ENCONTRADO;
-- encerrada → PROVA_ENCERRADA.
create function public.fitting_open_lock(p_id uuid)
returns public.fitting_session
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f public.fitting_session;
begin
  select * into f from public.fitting_session where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if f.state not in ('agendada', 'em_curso') then
    raise exception 'PROVA_ENCERRADA';
  end if;
  return f;
end
$$;

-- Fecha os compromissos `prova` ainda agendados da sessão.
create function public.fitting_close_appointments(p_id uuid, p_state public.appointment_state)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.appointment set state = p_state
   where fitting_id = p_id and kind = 'prova' and state = 'agendado'
$$;

-- PONTO DE EXTENSÃO (área 3): o rascunho da reserva nasce da prova (ReservationInput.fittingId).
-- Prova inexistente → NAO_ENCONTRADO; não aberta → PROVA_ENCERRADA; de outra cliente →
-- PARAMETRO_INVALIDO (campo customerId). Marca `convertida`, liga a reserva, encerra (ended_at)
-- e conclui o compromisso `prova` (como convert() de src/data/mock/reservas-draft.ts).
-- Quem chama já checou reserva.create e decide quando não converter (mesma prova já ligada).
create function public.fitting_convert(p_fitting uuid, p_reservation uuid, p_customer uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f public.fitting_session;
begin
  f := public.fitting_open_lock(p_fitting);
  if f.customer_id is distinct from p_customer then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'customerId';
  end if;
  update public.fitting_session
     set state = 'convertida', reservation_id = p_reservation, ended_at = now()
   where id = p_fitting;
  perform public.fitting_close_appointments(p_fitting, 'concluido');
end
$$;

-- Leitura -------------------------------------------------------------------

-- Um AgendaDay por dia de p_from a p_to (inclusive, até 366 dias). Itens não cancelados por hora;
-- blocos do acervo (higienização, manutenção, ajuste, bloqueio manual, editorial) por código da peça,
-- no máx. 4 + `moreBlocks`.
create function public.agenda_range(p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('agenda.view');
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  return (
    with days as (
      select d::date as day from generate_series(p_from, p_to, interval '1 day') d
    ),
    blocks as (
      select x.day, x.garment_id, x.code, x.kind,
             row_number() over (partition by x.day order by x.code, x.ord) as rn,
             count(*) over (partition by x.day) as n
        from (
          select distinct d.day, g.id as garment_id, g.code, k.kind,
                 array_position(array['higienizacao', 'manutencao', 'ajuste', 'bloqueio_manual', 'editorial']::public.block_kind[], k.kind) as ord
            from days d
            join public.garment_calendar_block k
              on k.released_at is null and k.period @> d.day
             and k.kind in ('higienizacao', 'manutencao', 'ajuste', 'bloqueio_manual', 'editorial')
            join public.garment g on g.id = k.garment_id
        ) x
    )
    select jsonb_agg(jsonb_build_object(
             'date', d.day,
             'items', coalesce((
               select jsonb_agg(public.agenda_item_json(a.id) order by a.starts_at, a.created_at, a.id)
                 from public.appointment a
                where a.state <> 'cancelado'
                  and a.starts_at >= public.store_at(d.day, '00:00')
                  and a.starts_at < public.store_at(d.day + 1, '00:00')
             ), '[]'::jsonb),
             'garmentBlocks', coalesce((
               select jsonb_agg(jsonb_build_object('garmentId', b.garment_id, 'garmentCode', b.code, 'kind', b.kind) order by b.rn)
                 from blocks b where b.day = d.day and b.rn <= 4
             ), '[]'::jsonb),
             'moreBlocks', coalesce((select max(b.n) - 4 from blocks b where b.day = d.day and b.n > 4), 0)
           ) order by d.day)
      from days d
  );
end
$$;

-- Dias (`aaaa-mm-dd`, crescentes) do mês `aaaa-mm` com ao menos um compromisso não cancelado.
create function public.agenda_month_days(p_month text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_first date;
begin
  perform public.require_perm('agenda.view');
  v_first := public.try_iso_date(coalesce(p_month, '') || '-01');
  if p_month !~ '^\d{4}-\d{2}$' or v_first is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'month';
  end if;
  return coalesce((
    select jsonb_agg(x.day order by x.day)
      from (
        select distinct (a.starts_at at time zone 'America/Araguaina')::date as day
          from public.appointment a
         where a.state <> 'cancelado'
           and a.starts_at >= public.store_at(v_first, '00:00')
           and a.starts_at < public.store_at((v_first + interval '1 month')::date, '00:00')
      ) x
  ), '[]'::jsonb);
end
$$;

-- Equipe ativa (atendente da prova). → [AppUser]
create function public.list_staff()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.has_perm('agenda.view') or public.has_perm('prova.view')) then
    raise exception 'SEM_PERMISSAO';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', u.id, 'name', u.full_name, 'email', u.email, 'role', u.role)
                     order by u.full_name, u.id)
      from public.app_user u
     where u.is_active
  ), '[]'::jsonb);
end
$$;

-- `p_filter`: abertas | convertidas | perdidas (perdida + no_show) | todas. Ordem scheduledAt desc.
-- → {"items": [FittingListRow…], "total": n}
create function public.list_fittings(p_filter text, p_limit int, p_offset int)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_states public.fitting_state[];
  v_total bigint;
  v_items jsonb;
begin
  perform public.require_perm('prova.view');
  v_states := case p_filter
    when 'abertas' then array['agendada', 'em_curso']::public.fitting_state[]
    when 'convertidas' then array['convertida']::public.fitting_state[]
    when 'perdidas' then array['perdida', 'no_show']::public.fitting_state[]
    when 'todas' then enum_range(null::public.fitting_state)
  end;
  if v_states is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'filter';
  end if;
  if coalesce(p_limit, 0) < 1 or p_limit > 200 or coalesce(p_offset, -1) < 0 then
    raise exception 'PARAMETRO_INVALIDO';
  end if;

  select count(*) into v_total from public.fitting_session where state = any (v_states);
  select coalesce(jsonb_agg(public.fitting_row_json(x.id) order by x.scheduled_at desc, x.id desc), '[]'::jsonb)
    into v_items
    from (
      select f.id, f.scheduled_at
        from public.fitting_session f
       where f.state = any (v_states)
       order by f.scheduled_at desc, f.id desc
       limit p_limit offset p_offset
    ) x;
  return jsonb_build_object('items', v_items, 'total', v_total);
end
$$;

-- KPIs (conversionRate de src/domain/fittings.ts): fechadas = convertida + perdida + no_show. → FittingKpis
create function public.fitting_kpis()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.view');
  return (
    select jsonb_build_object(
      'open', count(*) filter (where state in ('agendada', 'em_curso')),
      'converted', count(*) filter (where state = 'convertida'),
      'lost', count(*) filter (where state = 'perdida'),
      'closed', count(*) filter (where state in ('convertida', 'perdida', 'no_show')),
      'rate', coalesce(
        (count(*) filter (where state = 'convertida'))::float8
          / nullif(count(*) filter (where state in ('convertida', 'perdida', 'no_show')), 0),
        0),
      'total', count(*)
    )
    from public.fitting_session
  );
end
$$;

-- null quando a prova não existe. → FittingDetail
create function public.get_fitting(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.view');
  return public.fitting_detail_json(p_id);
end
$$;

-- Provas da cliente, scheduledAt desc, cada uma com todas as peças. → [FittingHistoryRow]
create function public.fittings_of_customer(p_customer uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.view');
  return coalesce((
    select jsonb_agg(public.fitting_history_json(f.id, null) order by f.scheduled_at desc, f.id desc)
      from public.fitting_session f
     where f.customer_id = p_customer
  ), '[]'::jsonb);
end
$$;

-- Provas em que a peça entrou, scheduledAt desc, `items` só com ela. → [FittingHistoryRow]
create function public.fittings_of_garment(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.view');
  return coalesce((
    select jsonb_agg(public.fitting_history_json(f.id, p_garment) order by f.scheduled_at desc, f.id desc)
      from public.fitting_session f
     where exists (select 1 from public.fitting_item i where i.fitting_session_id = f.id and i.garment_id = p_garment)
  ), '[]'::jsonb);
end
$$;

-- Conversão da peça (fittingStats de src/domain/fittings.ts): só itens provados (≠ nao_provou);
-- convertidos = sessão ligada a uma reserva que contém a peça; até 4 notas, da mais recente. → FittingGarmentStats
create function public.fitting_stats_of(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.view');
  return (
    with tried as (
      select i.*, f.reservation_id, coalesce(i.recorded_at, f.scheduled_at) as seen_at
        from public.fitting_item i
        join public.fitting_session f on f.id = i.fitting_session_id
       where i.garment_id = p_garment and i.outcome <> 'nao_provou'
    ),
    agg as (
      select count(*) as fittings,
             count(*) filter (where reservation_id is not null and public.reservation_has_garment(reservation_id, p_garment)) as converted,
             count(*) filter (where outcome = 'favorita') as favorites,
             count(*) filter (where outcome in ('descartada', 'nao_gostou')) as discards,
             count(*) filter (where needs_alteration or outcome = 'precisa_ajuste') as alterations
        from tried
    )
    select jsonb_build_object(
      'fittings', a.fittings,
      'converted', a.converted,
      'rate', case when a.fittings > 0 then a.converted::float8 / a.fittings end,
      'favorites', a.favorites,
      'discards', a.discards,
      'alterations', a.alterations,
      'reasons', coalesce((
        select jsonb_agg(jsonb_build_object('outcome', r.outcome, 'note', r.note) order by r.seen_at desc, r.fitting_session_id desc)
          from (
            select * from tried t where btrim(coalesce(t.note, '')) <> '' order by t.seen_at desc, t.fitting_session_id desc limit 4
          ) r
      ), '[]'::jsonb)
    )
    from agg a
  );
end
$$;

-- Escrita -------------------------------------------------------------------

-- `p` = AppointmentInput (atendimento, serviço ou interno). Responsável = quem cria. → Appointment
create function public.create_appointment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  perform public.require_perm('agenda.manage');
  perform public.appointment_validate(p);
  v_id := public.appointment_insert(
    public.jtext(p, 'kind')::public.appointment_kind, now(), null, null, null, null, null, null, public.current_app_user_id()
  );
  perform public.appointment_apply(v_id, p);
  return public.appointment_json(v_id);
end
$$;

-- Só compromissos manuais agendados (senão ESTADO_INVALIDO). → Appointment
create function public.update_appointment(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('agenda.manage');
  perform public.appointment_manual_lock(p_id);
  perform public.appointment_validate(p);
  perform public.appointment_apply(p_id, p);
  return public.appointment_json(p_id);
end
$$;

-- Só compromissos manuais agendados (senão ESTADO_INVALIDO). → Appointment
create function public.cancel_appointment(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('agenda.manage');
  perform public.appointment_manual_lock(p_id);
  update public.appointment set state = 'cancelado' where id = p_id;
  return public.appointment_json(p_id);
end
$$;

-- `p` = FittingInput. Cliente: `customerId` ou `newCustomer` (cadastrada por create_customer, mesma
-- transação: se a prova falhar, a cliente não fica). Horário vazio = 15:00. Atendente = usuário ativo
-- com o nome `attendantName`, senão quem agenda. Cria o compromisso `prova`. → FittingSession
create function public.create_fitting(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer uuid;
  v_date date;
  v_time time;
  v_event date;
  v_budget numeric;
  v_attendant uuid;
  v_when timestamptz;
  v_code text;
  v_id uuid;
  v_notes text;
begin
  perform public.require_perm('prova.manage');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  -- Mesma ordem de fittingIssues (src/data/validation.ts).
  if coalesce(public.jtext(p, 'customerId'), '') = '' and jsonb_typeof(p -> 'newCustomer') is distinct from 'object' then
    raise exception 'CLIENTE_OBRIGATORIA' using detail = 'customerId';
  end if;
  v_date := public.try_iso_date(public.jtext(p, 'date'));
  if v_date is null then
    raise exception 'DATA_OBRIGATORIA' using detail = 'date';
  end if;
  if coalesce(public.jtext(p, 'eventDate'), '') <> '' then
    v_event := public.try_iso_date(public.jtext(p, 'eventDate'));
    if v_event is null then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'eventDate';
    end if;
    if v_event < v_date then
      raise exception 'DATAS_INCOERENTES' using detail = 'eventDate';
    end if;
  end if;
  if coalesce(public.jtext(p, 'time'), '') = '' then
    v_time := '15:00';
  else
    v_time := public.try_hhmm(public.jtext(p, 'time'));
    if v_time is null then
      raise exception 'HORARIO_OBRIGATORIO' using detail = 'time';
    end if;
  end if;
  v_budget := public.jnum(p, 'budget');
  if v_budget < 0 then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'budget';
  end if;

  if coalesce(public.jtext(p, 'customerId'), '') <> '' then
    v_customer := public.try_uuid(public.jtext(p, 'customerId'));
    perform public.customer_must_exist(v_customer);
  else
    v_customer := (public.create_customer(p -> 'newCustomer') ->> 'id')::uuid;
  end if;

  select u.id into v_attendant
    from public.app_user u
   where u.is_active and u.full_name = public.jtext(p, 'attendantName')
   order by u.id
   limit 1;
  v_attendant := coalesce(v_attendant, public.current_app_user_id());
  v_when := public.store_at(v_date, v_time);
  v_notes := nullif(public.jtext(p, 'notes'), '');

  perform pg_advisory_xact_lock(hashtext('public.fitting_session.code'));
  select 'PR-' || to_char(v_date, 'YYYY') || '-'
         || lpad((coalesce(max(nullif(substring(code from '^PR-\d{4}-(\d+)$'), '')::int), 0) + 1)::text, 4, '0')
    into v_code
    from public.fitting_session
   where code like 'PR-' || to_char(v_date, 'YYYY') || '-%';

  insert into public.fitting_session (code, customer_id, scheduled_at, attendant_id, event_type, event_date, budget, notes, created_by)
  values (v_code, v_customer, v_when, v_attendant, nullif(public.jtext(p, 'eventType'), ''), v_event, v_budget, v_notes,
          public.current_app_user_id())
  returning id into v_id;

  perform public.appointment_insert('prova', v_when, 'Prova', v_notes, v_customer, null, v_id, null, v_attendant);
  return public.fitting_session_json(v_id);
end
$$;

-- Separa uma peça para a prova aberta (repetida = nada muda), no fim da lista. → FittingDetail
create function public.add_fitting_garment(p_id uuid, p_garment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.manage');
  perform public.fitting_open_lock(p_id);
  perform public.garment_must_exist(p_garment);
  insert into public.fitting_item (fitting_session_id, garment_id, position)
  select p_id, p_garment, coalesce(max(position), -1) + 1
    from public.fitting_item where fitting_session_id = p_id
  on conflict (fitting_session_id, garment_id) do nothing;
  return public.fitting_detail_json(p_id);
end
$$;

-- Tira a peça da prova aberta (ausente = nada muda). → FittingDetail
create function public.remove_fitting_garment(p_id uuid, p_garment uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.manage');
  perform public.fitting_open_lock(p_id);
  delete from public.fitting_item where fitting_session_id = p_id and garment_id = p_garment;
  return public.fitting_detail_json(p_id);
end
$$;

-- Resultado da peça. `p` = {outcome?, needsAlteration?, note?}: chave ausente preserva o valor anterior;
-- `note: null` apaga. A primeira marcação põe a prova `em_curso`. `favorita` grava/atualiza o favorito
-- da cliente com origem `prova` (nota = a da peça ou a anterior do favorito). → FittingDetail
create function public.set_fitting_outcome(p_id uuid, p_garment uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  f public.fitting_session;
  i public.fitting_item;
  v_now timestamptz := now();
begin
  perform public.require_perm('prova.manage');
  f := public.fitting_open_lock(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  select * into i from public.fitting_item where fitting_session_id = p_id and garment_id = p_garment for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if p ? 'outcome' and jsonb_typeof(p -> 'outcome') <> 'null' then
    perform public.jenum_check(coalesce(public.jtext(p, 'outcome'), '') in (select unnest(enum_range(null::public.fit_outcome))::text), 'outcome');
  end if;
  if p ? 'needsAlteration' and jsonb_typeof(p -> 'needsAlteration') not in ('boolean', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'needsAlteration';
  end if;
  if p ? 'note' and jsonb_typeof(p -> 'note') not in ('string', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'note';
  end if;

  update public.fitting_item set
    outcome = case when jsonb_typeof(p -> 'outcome') = 'string' then public.jtext(p, 'outcome')::public.fit_outcome else outcome end,
    needs_alteration = case when jsonb_typeof(p -> 'needsAlteration') = 'boolean' then (p ->> 'needsAlteration')::boolean else needs_alteration end,
    note = case when p ? 'note' then nullif(public.jtext(p, 'note'), '') else note end,
    recorded_by = public.current_app_user_id(),
    recorded_at = v_now
  where fitting_session_id = p_id and garment_id = p_garment
  returning * into i;

  if f.state = 'agendada' then
    update public.fitting_session set state = 'em_curso', started_at = v_now where id = p_id;
  end if;

  if i.outcome = 'favorita' then
    insert into public.customer_favorite (customer_id, garment_id, source, note, created_by)
    values (f.customer_id, p_garment, 'prova', i.note, public.current_app_user_id())
    on conflict (customer_id, garment_id) do update
      set source = 'prova', note = coalesce(excluded.note, public.customer_favorite.note);
  end if;
  return public.fitting_detail_json(p_id);
end
$$;

-- Encerra a prova aberta: concluida | perdida | no_show. Observação vazia mantém a anterior.
-- O compromisso `prova` agendado vira concluido (no_show → no_show). → FittingDetail
create function public.close_fitting(p_id uuid, p_state text, p_notes text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('prova.manage');
  perform public.fitting_open_lock(p_id);
  if coalesce(p_state, '') not in ('perdida', 'concluida', 'no_show') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'state';
  end if;
  update public.fitting_session
     set state = p_state::public.fitting_state,
         ended_at = now(),
         outcome_notes = coalesce(nullif(btrim(p_notes), ''), outcome_notes)
   where id = p_id;
  perform public.fitting_close_appointments(p_id, case when p_state = 'no_show' then 'no_show' else 'concluido' end::public.appointment_state);
  return public.fitting_detail_json(p_id);
end
$$;

-- Privilégios das funções ---------------------------------------------------
revoke all on function public.store_instant(timestamptz) from public, anon, authenticated;
revoke all on function public.store_at(date, time) from public, anon, authenticated;
revoke all on function public.try_hhmm(text) from public, anon, authenticated;
revoke all on function public.appointment_kind_label(public.appointment_kind) from public, anon, authenticated;
revoke all on function public.fit_outcome_positive(public.fit_outcome) from public, anon, authenticated;
revoke all on function public.appointment_reservation_json(uuid, public.appointment_kind) from public, anon, authenticated;
revoke all on function public.fitting_reservation_json(uuid) from public, anon, authenticated;
revoke all on function public.reservation_has_garment(uuid, uuid) from public, anon, authenticated;
revoke all on function public.appointment_json(uuid) from public, anon, authenticated;
revoke all on function public.agenda_item_json(uuid) from public, anon, authenticated;
revoke all on function public.appointment_insert(public.appointment_kind, timestamptz, text, text, uuid, uuid, uuid, uuid, uuid, public.appointment_state) from public, anon, authenticated;
revoke all on function public.appointment_validate(jsonb) from public, anon, authenticated;
revoke all on function public.appointment_apply(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.appointment_manual_lock(uuid) from public, anon, authenticated;
revoke all on function public.fitting_session_json(uuid) from public, anon, authenticated;
revoke all on function public.fitting_row_json(uuid) from public, anon, authenticated;
revoke all on function public.fitting_history_json(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fitting_detail_json(uuid) from public, anon, authenticated;
revoke all on function public.fitting_open_lock(uuid) from public, anon, authenticated;
revoke all on function public.fitting_close_appointments(uuid, public.appointment_state) from public, anon, authenticated;
revoke all on function public.fitting_convert(uuid, uuid, uuid) from public, anon, authenticated;

revoke all on function public.agenda_range(date, date) from public, anon;
revoke all on function public.agenda_month_days(text) from public, anon;
revoke all on function public.list_staff() from public, anon;
revoke all on function public.list_fittings(text, int, int) from public, anon;
revoke all on function public.fitting_kpis() from public, anon;
revoke all on function public.get_fitting(uuid) from public, anon;
revoke all on function public.fittings_of_customer(uuid) from public, anon;
revoke all on function public.fittings_of_garment(uuid) from public, anon;
revoke all on function public.fitting_stats_of(uuid) from public, anon;
revoke all on function public.create_appointment(jsonb) from public, anon;
revoke all on function public.update_appointment(uuid, jsonb) from public, anon;
revoke all on function public.cancel_appointment(uuid) from public, anon;
revoke all on function public.create_fitting(jsonb) from public, anon;
revoke all on function public.add_fitting_garment(uuid, uuid) from public, anon;
revoke all on function public.remove_fitting_garment(uuid, uuid) from public, anon;
revoke all on function public.set_fitting_outcome(uuid, uuid, jsonb) from public, anon;
revoke all on function public.close_fitting(uuid, text, text) from public, anon;

grant execute on function public.agenda_range(date, date) to authenticated;
grant execute on function public.agenda_month_days(text) to authenticated;
grant execute on function public.list_staff() to authenticated;
grant execute on function public.list_fittings(text, int, int) to authenticated;
grant execute on function public.fitting_kpis() to authenticated;
grant execute on function public.get_fitting(uuid) to authenticated;
grant execute on function public.fittings_of_customer(uuid) to authenticated;
grant execute on function public.fittings_of_garment(uuid) to authenticated;
grant execute on function public.fitting_stats_of(uuid) to authenticated;
grant execute on function public.create_appointment(jsonb) to authenticated;
grant execute on function public.update_appointment(uuid, jsonb) to authenticated;
grant execute on function public.cancel_appointment(uuid) to authenticated;
grant execute on function public.create_fitting(jsonb) to authenticated;
grant execute on function public.add_fitting_garment(uuid, uuid) to authenticated;
grant execute on function public.remove_fitting_garment(uuid, uuid) to authenticated;
grant execute on function public.set_fitting_outcome(uuid, uuid, jsonb) to authenticated;
grant execute on function public.close_fitting(uuid, text, text) to authenticated;

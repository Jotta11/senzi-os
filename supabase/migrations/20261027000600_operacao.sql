-- =====================================================================
-- Senzi OS · Operação: fila pós-devolução, inspeção, higienização,
-- manutenção/ajuste (ordens, fornecedores, custos), liberação e checklist.
--
-- Mesmo padrão das áreas anteriores: tabelas sem grant para anon/authenticated;
-- toda leitura e escrita pelas RPCs (security definer), que checam has_perm().
-- Regras e códigos de erro = fonte em memória (src/data/mock/operacao.ts):
-- PECA_NAO_ENCONTRADA, ORDEM_NAO_ENCONTRADA, ORDEM_JA_CONCLUIDA, CUSTO_INVALIDO
-- (campo cost) e ESTADO_INVALIDO.
--
-- Agenda da peça: blocos ativos nunca se sobrepõem (constraint do Acervo). O bloco
-- da Operação começa hoje e termina no dia anterior ao próximo bloco ativo da peça;
-- se hoje já está ocupado por outro bloco, a ordem nasce sem bloco (a fonte em
-- memória deixaria sobrepor). A locação da própria reserva que ainda cobre hoje
-- (devolução de hoje) vira histórico na inspeção, como na finalização.
--
-- Custos: concluir ordem com custo > 0 lança a conta a pagar paga (`operacao`,
-- categoria higienizacao | ajuste | manutencao) por payable_insert_auto. Quem tem
-- operacao.maintenance lança o custo; só quem tem acervo.cost o vê (custo da ordem,
-- custo dos últimos 30 dias e economia da peça saem null sem a permissão).
--
-- Pendência conhecida (igual à fonte em memória, 03v-pendencias): peça que nunca
-- saiu da loja e teve a reserva cancelada dentro da própria janela de higienização
-- fica em `higienizacao` (estado operacional, sem ordem) até ser liberada aqui.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.maintenance_kind as enum (
  'higienizacao', 'costura', 'barra', 'ziper', 'pedraria', 'ajuste', 'mancha', 'restauracao', 'outros'
);
create type public.maintenance_state as enum ('aberta', 'em_andamento', 'concluida', 'cancelada');
create type public.inspection_result as enum ('aprovada', 'ressalva', 'reprovada', 'perda');

-- Tabelas --------------------------------------------------------------
create table public.checklist_item (
  id uuid primary key default gen_random_uuid(),
  label text not null check (btrim(label) <> ''),
  sort_order int not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.inspection (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garment (id) on delete cascade,
  reservation_id uuid references public.reservation (id),
  inspected_at timestamptz not null default clock_timestamp(),
  inspector_id uuid references public.app_user (id),
  result public.inspection_result not null,
  -- [{label, ok: false, severity: leve|media|grave, note}] (InspectionFinding)
  findings jsonb not null default '[]'::jsonb check (jsonb_typeof(findings) = 'array'),
  notes text
);

create index inspection_garment_idx on public.inspection (garment_id, inspected_at desc);
create index inspection_reservation_idx on public.inspection (reservation_id);
create index inspection_inspector_idx on public.inspection (inspector_id);

-- Fotos da inspeção: o tipo sempre; o arquivo (bucket pecas-fotos, `<garment_id>/…`) quando houver.
-- A tela atual registra só o tipo (como a prévia), então storage_path fica nulo.
create table public.inspection_photo (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspection (id) on delete cascade,
  kind public.photo_kind not null check (kind in ('devolucao', 'dano', 'detalhe')),
  storage_path text,
  position int not null
);

create index inspection_photo_inspection_idx on public.inspection_photo (inspection_id, position);

create table public.maintenance (
  id uuid primary key default gen_random_uuid(),
  garment_id uuid not null references public.garment (id) on delete cascade,
  inspection_id uuid references public.inspection (id),
  reservation_id uuid references public.reservation (id),
  kind public.maintenance_kind not null,
  state public.maintenance_state not null,
  opened_at timestamptz not null default clock_timestamp(),
  due_at date,
  closed_at timestamptz,
  description text,
  provider text,
  cost numeric(12, 2) not null default 0 check (cost >= 0),
  -- true: higienização e dano grave; false: reparo leve.
  blocks_garment boolean not null,
  created_by uuid references public.app_user (id)
);

create index maintenance_garment_idx on public.maintenance (garment_id, opened_at desc);
create index maintenance_open_idx on public.maintenance (opened_at) where state in ('aberta', 'em_andamento');
create index maintenance_inspection_idx on public.maintenance (inspection_id);
create index maintenance_reservation_idx on public.maintenance (reservation_id);
create index maintenance_created_by_idx on public.maintenance (created_by);

-- FKs que as áreas anteriores deixaram para cá.
alter table public.payable
  add constraint payable_maintenance_fk foreign key (maintenance_id) references public.maintenance (id);
alter table public.garment_calendar_block
  add constraint garment_calendar_block_maintenance_fk foreign key (maintenance_id) references public.maintenance (id);
create index garment_calendar_block_maintenance_idx on public.garment_calendar_block (maintenance_id);

-- Auditoria (inspection_photo vai junto com a inspeção, que já é registro).
create trigger checklist_item_audit after insert or update or delete on public.checklist_item
  for each row execute function public.audit_trigger();
create trigger inspection_audit after insert or update or delete on public.inspection
  for each row execute function public.audit_trigger();
create trigger maintenance_audit after insert or update or delete on public.maintenance
  for each row execute function public.audit_trigger();

alter table public.checklist_item enable row level security;
alter table public.inspection enable row level security;
alter table public.inspection_photo enable row level security;
alter table public.maintenance enable row level security;

revoke all on table public.checklist_item, public.inspection, public.inspection_photo, public.maintenance
  from public, anon, authenticated, service_role;
grant select on table public.checklist_item, public.inspection, public.inspection_photo, public.maintenance
  to service_role;

-- Checklist do fixture (CHECKLIST de src/data/fixture/world.ts).
insert into public.checklist_item (label, sort_order)
select label, ord - 1
  from unnest(array[
    'Manchas', 'Rasgos e furos', 'Costuras', 'Zíper e fechos', 'Aplicações e pedrarias',
    'Barra', 'Odor', 'Desgaste do tecido', 'Forro', 'Alças e sustentação'
  ]) with ordinality as t (label, ord);

-- =====================================================================
-- Funções internas (sem execute para a API)
-- =====================================================================

-- Leitura da Operação: qualquer permissão de operação (a fila exige operacao.view; o modal de
-- inspeção lê checklist, reserva da devolução e fornecedores).
create function public.operacao_require_any()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.has_perm('operacao.view') or public.has_perm('operacao.inspect')
          or public.has_perm('operacao.maintenance') or public.has_perm('operacao.release')) then
    raise exception 'SEM_PERMISSAO';
  end if;
end
$$;

-- Rótulo do tipo de ordem (MAINTENANCE_KIND de src/data/labels-ops.ts).
create function public.maintenance_kind_label(p public.maintenance_kind)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p
    when 'higienizacao' then 'Higienização'
    when 'costura' then 'Costura'
    when 'barra' then 'Barra'
    when 'ziper' then 'Zíper'
    when 'pedraria' then 'Pedraria'
    when 'ajuste' then 'Ajuste'
    when 'mancha' then 'Mancha'
    when 'restauracao' then 'Restauração'
    when 'outros' then 'Outros'
  end
$$;

-- Ordem → Maintenance. Custo só com acervo.cost (null sem a permissão).
create function public.maintenance_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', m.id,
    'garmentId', m.garment_id,
    'inspectionId', m.inspection_id,
    'reservationId', m.reservation_id,
    'kind', m.kind,
    'state', m.state,
    'openedAt', public.store_instant(m.opened_at),
    'dueAt', m.due_at,
    'closedAt', case when m.closed_at is not null then public.store_instant(m.closed_at) end,
    'description', m.description,
    'provider', m.provider,
    'cost', case when public.has_perm('acervo.cost') then m.cost end,
    'blocksGarment', m.blocks_garment,
    'createdBy', coalesce(m.created_by::text, '')
  )
  from public.maintenance m
  where m.id = p_id
$$;

-- Inspeção → Inspection. Fotos com `path` (o app assina a URL; sem arquivo, path nulo).
create function public.inspection_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', i.id,
    'garmentId', i.garment_id,
    'reservationId', i.reservation_id,
    'inspectedAt', public.store_instant(i.inspected_at),
    'inspectorId', coalesce(i.inspector_id::text, ''),
    'inspectorName', coalesce(u.full_name, 'Sistema'),
    'result', i.result,
    'findings', i.findings,
    'notes', i.notes,
    'photos', coalesce((
      select jsonb_agg(jsonb_build_object('id', ph.id, 'kind', ph.kind, 'path', ph.storage_path) order by ph.position)
        from public.inspection_photo ph
       where ph.inspection_id = i.id
    ), '[]'::jsonb)
  )
  from public.inspection i
  left join public.app_user u on u.id = i.inspector_id
  where i.id = p_id
$$;

-- Estado da peça recalculado a partir de `disponivel` (recompute da fonte em memória): mesmas regras
-- de garment_rederive, sem a trava dos estados operacionais — é o que a liberação usa.
create function public.garment_free_state(p_garment uuid)
returns public.garment_state
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_out public.reservation_state;
begin
  select r.state into v_out
    from public.reservation_item i
    join public.reservation r on r.id = i.reservation_id
   where i.garment_id = p_garment and i.item_state = 'retirado' and r.state = any (public.reservation_states('out'))
   order by r.created_at
   limit 1;
  if v_out is not null then
    return case when v_out = 'aguardando_devolucao' then 'aguardando_devolucao' else 'em_uso' end;
  end if;

  return (
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
    end::public.garment_state
  );
end
$$;

-- Bloco da Operação a partir de p_from, sem sobrepor: termina no dia anterior ao próximo bloco ativo
-- da peça; se p_from já está ocupado, não cria (devolve null). → id do bloco
create function public.operacao_block(
  p_garment uuid, p_kind public.block_kind, p_from date, p_to date, p_note text, p_maintenance uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next date;
  v_id uuid;
begin
  if exists (select 1 from public.garment_calendar_block k
              where k.garment_id = p_garment and k.released_at is null and k.period @> p_from) then
    return null;
  end if;
  select min(lower(k.period)) into v_next
    from public.garment_calendar_block k
   where k.garment_id = p_garment and k.released_at is null and lower(k.period) > p_from;
  insert into public.garment_calendar_block (garment_id, maintenance_id, kind, period, note, created_by)
  values (p_garment, p_maintenance, p_kind,
          daterange(p_from, least(p_to, coalesce(v_next - 1, p_to)), '[]'), p_note, public.current_app_user_id())
  returning id into v_id;
  return v_id;
end
$$;

-- Encerra a ordem (closeOrder): custo, fornecedor, observação, libera os blocos dela e, com custo > 0,
-- lança a despesa paga da Operação (pix) na categoria higienizacao | ajuste | manutencao.
create function public.operacao_close_order(p_id uuid, p_cost numeric, p_provider text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  m public.maintenance;
begin
  update public.maintenance
     set state = 'concluida',
         closed_at = clock_timestamp(),
         cost = round(p_cost, 2),
         provider = coalesce(p_provider, provider),
         description = case when p_note is null then description
                            when description is null then p_note
                            else description || ' · ' || p_note end
   where id = p_id
  returning * into m;
  update public.garment_calendar_block set released_at = now()
   where maintenance_id = p_id and released_at is null;
  if m.cost > 0 then
    perform public.payable_insert_auto(
      'operacao',
      case when m.kind in ('higienizacao', 'ajuste') then m.kind::text else 'manutencao' end,
      coalesce(m.description, public.maintenance_kind_label(m.kind)),
      coalesce(m.provider, 'Sem fornecedor'),
      m.cost, m.garment_id, m.id, m.reservation_id, 'pix'
    );
  end if;
end
$$;

-- Liberação (release): encerra as ordens abertas, tira os blocos operacionais que ainda valem (menos os
-- planejados de reservas vivas — decisão 9 do 03v) e, se bloqueada, o bloqueio manual/editorial que já
-- começou; recalcula o estado a partir de `disponivel` e registra sempre no histórico.
create function public.operacao_release(p_garment uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_state public.garment_state;
  v_m uuid;
begin
  for v_m in select m.id from public.maintenance m
              where m.garment_id = p_garment and m.state in ('aberta', 'em_andamento')
              order by m.opened_at
              for update loop
    perform public.operacao_close_order(v_m, (select cost from public.maintenance where id = v_m), null, null);
  end loop;
  select state into v_state from public.garment where id = p_garment;
  update public.garment_calendar_block k
     set released_at = now()
    from public.garment_calendar_block k0
    left join public.reservation r on r.id = k0.reservation_id
   where k.id = k0.id and k.garment_id = p_garment and k.released_at is null and upper(k.period) - 1 >= v_today
     and (
       (k.kind in ('higienizacao', 'manutencao', 'ajuste', 'inspecao')
         and (k.reservation_id is null or r.state = any (public.reservation_states('closed'))))
       or (v_state = 'bloqueado' and k.kind in ('bloqueio_manual', 'editorial') and lower(k.period) <= v_today)
     );
  perform public.garment_log_state(p_garment, public.garment_free_state(p_garment), p_note);
end
$$;

-- Linha da fila (QueueRow). A peça vem como em garment_json (fotos com `path`).
create function public.operacao_queue_row(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  g public.garment;
  v_order public.maintenance;
  v_entered timestamptz;
begin
  select * into g from public.garment where id = p_garment;
  select * into v_order from public.maintenance m
   where m.garment_id = p_garment and m.state in ('aberta', 'em_andamento')
   order by m.opened_at desc
   limit 1;
  if g.state = 'inspecao' then
    select h.occurred_at into v_entered from public.garment_state_history h
     where h.garment_id = p_garment and h.to_state = 'inspecao'
     order by h.occurred_at desc, h.id desc
     limit 1;
  end if;
  return jsonb_build_object(
    'garment', public.garment_json(p_garment),
    'order', case when v_order.id is not null then public.maintenance_json(v_order.id) end,
    'blockNote', (
      select k.note from public.garment_calendar_block k
       where k.garment_id = p_garment and k.released_at is null
         and k.kind in ('bloqueio_manual', 'editorial') and k.period @> v_today
       order by lower(k.period) limit 1
    ),
    'nextRentalStart', (
      select min(lower(k.period)) from public.garment_calendar_block k
       where k.garment_id = p_garment and k.released_at is null and k.kind = 'locacao' and lower(k.period) > v_today
    ),
    'daysOpen', case when v_order.id is not null then v_today - public.store_day(v_order.opened_at) end,
    'waitingDays', case when v_entered is not null then greatest(0, v_today - public.store_day(v_entered)) end
  );
end
$$;

-- =====================================================================
-- RPCs
-- =====================================================================

-- Fila: peças por estado (por código), ordens em aberto (mais antigas primeiro) e custo dos últimos
-- 30 dias (contas `operacao` não canceladas; null sem acervo.cost). → OperacaoQueue
create function public.operacao_queue()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_out jsonb := '{}'::jsonb;
  s public.garment_state;
begin
  perform public.require_perm('operacao.view');
  foreach s in array array['inspecao', 'higienizacao', 'ajuste', 'manutencao', 'bloqueado']::public.garment_state[] loop
    v_out := v_out || jsonb_build_object(s::text, coalesce((
      select jsonb_agg(public.operacao_queue_row(g.id) order by g.code)
        from public.garment g
       where g.state = s
    ), '[]'::jsonb));
  end loop;
  return v_out || jsonb_build_object(
    'openOrders', coalesce((
      select jsonb_agg(public.maintenance_json(m.id) || jsonb_build_object('garmentCode', g.code, 'garmentName', g.name)
                       order by m.opened_at, m.id)
        from public.maintenance m
        join public.garment g on g.id = m.garment_id
       where m.state in ('aberta', 'em_andamento')
    ), '[]'::jsonb),
    'costLast30d', case when public.has_perm('acervo.cost') then (
      select round(coalesce(sum(coalesce(p.paid_amount, p.amount)), 0), 2)
        from public.payable p
       where p.source = 'operacao' and p.status <> 'cancelada' and p.due_date >= v_today - 30
    ) end
  );
end
$$;

-- Itens ativos do checklist, em ordem. → ChecklistItem[]
create function public.operacao_checklist()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.operacao_require_any();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'label', c.label, 'sortOrder', c.sort_order, 'isActive', c.is_active)
                     order by c.sort_order, c.created_at)
      from public.checklist_item c
     where c.is_active
  ), '[]'::jsonb);
end
$$;

-- Reserva da devolução da peça: em inspeção, devolvida ou aguardando devolução, com a peça `devolvido`;
-- a de devolução mais recente. → {reservationId, customerName} | null
create function public.inspection_target(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.operacao_require_any();
  return (
    select jsonb_build_object('reservationId', r.id, 'customerName', c.full_name)
      from public.reservation r
      join public.reservation_item i on i.reservation_id = r.id
      join public.customer c on c.id = r.customer_id
     where i.garment_id = p_garment and i.item_state = 'devolvido'
       and r.state in ('em_inspecao', 'devolvida', 'aguardando_devolucao')
     order by coalesce(r.returned_at, i.returned_at) desc nulls last, r.created_at desc
     limit 1
  );
end
$$;

-- Inspeção (registerInspection): só peça em `inspecao`. Resultado pela severidade: perda (grave + perda)
-- bloqueia 30 dias para avaliação gerencial; reprovada (grave) abre manutenção bloqueante de 5 dias; senão
-- higienização em andamento (dias da peça, mín. 1) e, com ressalva + openRepair, reparo leve que não bloqueia.
-- A higienização planejada da reserva dá lugar ao bloco da ordem. O item da reserva vira `inspecionado`; o
-- último item inspecionado finaliza a reserva. → {result, garment}
create function public.register_inspection(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_garment uuid;
  v_res uuid;
  v_state public.garment_state;
  v_findings jsonb := '[]'::jsonb;
  v_photos jsonb;
  f jsonb;
  v_perda boolean;
  v_open_repair boolean;
  v_kind public.maintenance_kind;
  v_provider text;
  v_notes text;
  v_grave boolean;
  v_n int;
  v_result public.inspection_result;
  v_text text;
  v_insp uuid;
  v_m uuid;
  v_clean int;
  v_next public.garment_state;
  v_reason text;
  r public.reservation;
begin
  perform public.require_perm('operacao.inspect');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_garment := public.try_uuid(p ->> 'garmentId');
  select state into v_state from public.garment where id = v_garment;
  if not found then
    raise exception 'PECA_NAO_ENCONTRADA';
  end if;

  -- Entrada.
  if jsonb_typeof(p -> 'reservationId') = 'string' then
    v_res := public.try_uuid(p ->> 'reservationId');
    if v_res is null or not exists (select 1 from public.reservation where id = v_res) then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'reservationId';
    end if;
  elsif coalesce(jsonb_typeof(p -> 'reservationId'), 'null') <> 'null' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'reservationId';
  end if;
  if coalesce(jsonb_typeof(p -> 'findings'), 'null') not in ('array', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'findings';
  end if;
  for f in select x from jsonb_array_elements(coalesce(p -> 'findings', '[]'::jsonb)) x loop
    if jsonb_typeof(f) <> 'object' or jsonb_typeof(f -> 'label') <> 'string' or btrim(f ->> 'label') = ''
       or coalesce(f ->> 'severity', '') not in ('leve', 'media', 'grave')
       or coalesce(jsonb_typeof(f -> 'note'), 'null') not in ('string', 'null') then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'findings';
    end if;
    v_findings := v_findings || jsonb_build_array(jsonb_build_object(
      'label', btrim(f ->> 'label'), 'ok', false, 'severity', f ->> 'severity', 'note', nullif(btrim(coalesce(f ->> 'note', '')), '')
    ));
  end loop;
  v_photos := coalesce(p -> 'photos', '[]'::jsonb);
  if jsonb_typeof(v_photos) <> 'array' or exists (
       select 1 from jsonb_array_elements(v_photos) x
        where jsonb_typeof(x) <> 'object' or coalesce(x ->> 'kind', '') not in ('devolucao', 'dano', 'detalhe')
           or coalesce(jsonb_typeof(x -> 'path'), 'null') not in ('string', 'null')
           or (jsonb_typeof(x -> 'path') = 'string' and not starts_with(x ->> 'path', v_garment::text || '/'))
     ) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'photos';
  end if;
  if coalesce(jsonb_typeof(p -> 'perda'), 'null') not in ('boolean', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'perda';
  end if;
  if coalesce(jsonb_typeof(p -> 'openRepair'), 'null') not in ('boolean', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'openRepair';
  end if;
  perform public.jenum_check(
    coalesce(p ->> 'maintenanceKind', 'costura') = any (enum_range(null::public.maintenance_kind)::text[]), 'maintenanceKind');
  v_kind := coalesce(p ->> 'maintenanceKind', 'costura')::public.maintenance_kind;
  v_perda := coalesce((p ->> 'perda')::boolean, false);
  v_open_repair := coalesce((p ->> 'openRepair')::boolean, false);
  v_provider := nullif(public.jtext(p, 'provider'), '');

  -- Travas: reserva antes da peça (mesma ordem da devolução).
  if v_res is not null then
    r := public.reservation_lock(v_res);
  end if;
  select state into v_state from public.garment where id = v_garment for update;
  if v_state <> 'inspecao' then
    raise exception 'ESTADO_INVALIDO';
  end if;

  v_n := jsonb_array_length(v_findings);
  v_grave := exists (select 1 from jsonb_array_elements(v_findings) x where x ->> 'severity' = 'grave');
  v_result := case when v_grave and v_perda then 'perda' when v_n = 0 then 'aprovada' when v_grave then 'reprovada' else 'ressalva' end;
  v_notes := coalesce(nullif(public.jtext(p, 'notes'), ''),
                      case when v_n > 0 then 'Ressalvas registradas na inspeção.' else 'Peça devolvida em boas condições.' end);
  select string_agg(x ->> 'label' || ' (' || case x ->> 'severity' when 'media' then 'média' else x ->> 'severity' end || ')'
                    || coalesce(' — ' || (x ->> 'note'), ''), '; ' order by o)
    into v_text
    from jsonb_array_elements(v_findings) with ordinality as t (x, o);

  insert into public.inspection (garment_id, reservation_id, inspector_id, result, findings, notes)
  values (v_garment, v_res, public.current_app_user_id(), v_result, v_findings, v_notes)
  returning id into v_insp;
  insert into public.inspection_photo (inspection_id, kind, storage_path, position)
  select v_insp, (x ->> 'kind')::public.photo_kind, x ->> 'path', o::int
    from jsonb_array_elements(v_photos) with ordinality as t (x, o);

  -- A higienização planejada da reserva dá lugar ao bloco da ordem; a locação que ainda cobre hoje vira histórico.
  if v_res is not null then
    update public.garment_calendar_block set released_at = now()
     where garment_id = v_garment and reservation_id = v_res and released_at is null
       and (kind = 'higienizacao' or (kind = 'locacao' and upper(period) - 1 >= v_today));
  end if;

  if v_result = 'perda' then
    perform public.operacao_block(v_garment, 'bloqueio_manual', v_today, v_today + 30, 'Avaliação gerencial — possível perda da peça', null);
    v_next := 'bloqueado';
    v_reason := 'Dano grave — bloqueada para avaliação gerencial';
  elsif v_result = 'reprovada' then
    insert into public.maintenance (garment_id, inspection_id, reservation_id, kind, state, due_at, description, provider, blocks_garment, created_by)
    values (v_garment, v_insp, v_res, v_kind, 'aberta', v_today + 5, coalesce(v_text, v_notes), v_provider, true, public.current_app_user_id())
    returning id into v_m;
    perform public.operacao_block(v_garment, 'manutencao', v_today, v_today + 5, 'Manutenção aberta na inspeção', v_m);
    v_next := 'manutencao';
    v_reason := 'Dano identificado na inspeção';
  else
    v_clean := greatest(1, coalesce(public.garment_cleaning_days(v_garment), 0));
    insert into public.maintenance (garment_id, inspection_id, reservation_id, kind, state, due_at, description, provider, blocks_garment, created_by)
    values (v_garment, v_insp, v_res, 'higienizacao', 'em_andamento', v_today + v_clean, 'Higienização pós-locação', v_provider, true, public.current_app_user_id())
    returning id into v_m;
    perform public.operacao_block(v_garment, 'higienizacao', v_today, v_today + v_clean, 'Higienização', v_m);
    if v_result = 'ressalva' and v_open_repair then
      insert into public.maintenance (garment_id, inspection_id, reservation_id, kind, state, due_at, description, provider, blocks_garment, created_by)
      values (v_garment, v_insp, v_res, v_kind, 'aberta', v_today + greatest(2, v_clean + 1),
              coalesce(v_text, 'Reparo leve identificado na inspeção'), v_provider, false, public.current_app_user_id());
    end if;
    v_next := 'higienizacao';
    v_reason := 'Enviada para higienização';
  end if;
  perform public.garment_log_state(v_garment, v_next, v_reason);

  if v_res is not null then
    update public.reservation_item set item_state = 'inspecionado'
     where reservation_id = v_res and garment_id = v_garment and item_state = 'devolvido';
    if r.state <> all (public.reservation_states('closed'))
       and not exists (select 1 from public.reservation_item i
                        where i.reservation_id = v_res and i.item_state not in ('cancelado', 'inspecionado', 'nao_entregue')) then
      perform public.reservation_transition(v_res, 'finalizada', 'Todas as peças inspecionadas');
    end if;
  end if;

  return jsonb_build_object('result', v_result, 'garment', public.garment_json(v_garment));
end
$$;

-- Conclui a ordem (closeMaintenance). Custo (≥ 0) vira conta a pagar paga se > 0; `release` libera a peça
-- (exige também operacao.release). → Garment
create function public.close_maintenance(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_garment uuid;
  v_state public.maintenance_state;
  v_release boolean;
begin
  perform public.require_perm('operacao.maintenance');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_id := public.try_uuid(p ->> 'maintenanceId');
  select garment_id into v_garment from public.maintenance where id = v_id;
  if v_garment is null then
    raise exception 'ORDEM_NAO_ENCONTRADA';
  end if;
  perform 1 from public.garment where id = v_garment for update;
  select state into v_state from public.maintenance where id = v_id for update;
  if v_state not in ('aberta', 'em_andamento') then
    raise exception 'ORDEM_JA_CONCLUIDA';
  end if;
  if jsonb_typeof(p -> 'cost') <> 'number' or (p ->> 'cost')::numeric < 0 then
    raise exception 'CUSTO_INVALIDO' using detail = 'cost';
  end if;
  if coalesce(jsonb_typeof(p -> 'release'), 'null') not in ('boolean', 'null') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'release';
  end if;
  v_release := coalesce((p ->> 'release')::boolean, false);
  if v_release then
    perform public.require_perm('operacao.release');
  end if;
  perform public.operacao_close_order(v_id, (p ->> 'cost')::numeric, nullif(public.jtext(p, 'provider'), ''), nullif(public.jtext(p, 'note'), ''));
  if v_release then
    perform public.operacao_release(v_garment, 'Liberada pela Operação');
  end if;
  return public.garment_json(v_garment);
end
$$;

-- Libera a peça (releaseGarment): só em higienização, ajuste, manutenção ou bloqueada (bloqueada exige
-- também acervo.block — tira o bloqueio manual/editorial). → Garment
create function public.release_garment(p_garment uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state public.garment_state;
begin
  perform public.require_perm('operacao.release');
  select state into v_state from public.garment where id = p_garment for update;
  if not found then
    raise exception 'PECA_NAO_ENCONTRADA';
  end if;
  if v_state not in ('higienizacao', 'ajuste', 'manutencao', 'bloqueado') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if v_state = 'bloqueado' then
    perform public.require_perm('acervo.block');
  end if;
  perform public.operacao_release(p_garment, coalesce(nullif(btrim(coalesce(p_note, '')), ''), 'Liberada pela Operação'));
  return public.garment_json(p_garment);
end
$$;

-- Ordens e inspeções da peça, mais recentes primeiro. → {maintenances, inspections}
create function public.maintenances_of(p_garment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('operacao.view');
  return jsonb_build_object(
    'maintenances', coalesce((
      select jsonb_agg(public.maintenance_json(m.id) order by m.opened_at desc, m.id)
        from public.maintenance m where m.garment_id = p_garment
    ), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(public.inspection_json(i.id) order by i.inspected_at desc, i.id)
        from public.inspection i where i.garment_id = p_garment
    ), '[]'::jsonb)
  );
end
$$;

-- Fornecedores sugeridos: os de sempre + os já usados em ordens (na ordem em que apareceram). → text[]
create function public.operacao_suppliers()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_base text[] := array['Lavanderia Branca Neve', 'Ateliê Dona Neuza', 'Ateliê próprio', 'Tinturaria Aurora'];
begin
  perform public.operacao_require_any();
  return to_jsonb(v_base) || coalesce((
    select jsonb_agg(x.provider order by x.first)
      from (
        select m.provider, min(m.opened_at) as first
          from public.maintenance m
         where m.provider is not null and not (m.provider = any (v_base))
         group by m.provider
      ) x
  ), '[]'::jsonb);
end
$$;

-- Economia da peça (garmentEconomics de src/domain/economics.ts): a de Reservas + higienização e manutenção
-- (contas `operacao` da peça não canceladas, paidAmount ?? amount; categorias higienizacao / ajuste+manutencao).
drop function public.garment_costs(uuid[]);
create function public.garment_costs(p_ids uuid[])
returns table (garment_id uuid, acquisition_cost numeric, rentals int, revenue numeric, last_rental date,
               cleaning numeric, maintenance numeric)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('acervo.cost');
  return query
    select g.id, g.acquisition_cost, u.rentals, u.revenue, u.last_rental, o.cleaning, o.maintenance
      from public.garment g
      cross join lateral (
        select count(i.net_revenue)::int as rentals, round(coalesce(sum(i.net_revenue), 0), 2) as revenue,
               max(coalesce(r.event_date, r.pickup_date)) as last_rental
          from public.reservation_item i
          join public.reservation r on r.id = i.reservation_id
         where i.garment_id = g.id
           and r.state = any (public.reservation_states('realized'))
           and i.item_state not in ('cancelado', 'nao_entregue')
      ) u
      cross join lateral (
        select round(coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (where c.system_key = 'higienizacao'), 0), 2) as cleaning,
               round(coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (where c.system_key in ('manutencao', 'ajuste')), 0), 2) as maintenance
          from public.payable p
          join public.fin_category c on c.id = p.category_id
         where p.garment_id = g.id and p.source = 'operacao' and p.status <> 'cancelada'
      ) o
     where g.id = any (p_ids);
end
$$;

-- Privilégios ---------------------------------------------------------------
revoke all on function public.operacao_require_any() from public, anon, authenticated;
revoke all on function public.maintenance_kind_label(public.maintenance_kind) from public, anon, authenticated;
revoke all on function public.maintenance_json(uuid) from public, anon, authenticated;
revoke all on function public.inspection_json(uuid) from public, anon, authenticated;
revoke all on function public.garment_free_state(uuid) from public, anon, authenticated;
revoke all on function public.operacao_block(uuid, public.block_kind, date, date, text, uuid) from public, anon, authenticated;
revoke all on function public.operacao_close_order(uuid, numeric, text, text) from public, anon, authenticated;
revoke all on function public.operacao_release(uuid, text) from public, anon, authenticated;
revoke all on function public.operacao_queue_row(uuid) from public, anon, authenticated;

revoke all on function public.operacao_queue() from public, anon;
revoke all on function public.operacao_checklist() from public, anon;
revoke all on function public.inspection_target(uuid) from public, anon;
revoke all on function public.register_inspection(jsonb) from public, anon;
revoke all on function public.close_maintenance(jsonb) from public, anon;
revoke all on function public.release_garment(uuid, text) from public, anon;
revoke all on function public.maintenances_of(uuid) from public, anon;
revoke all on function public.operacao_suppliers() from public, anon;
revoke all on function public.garment_costs(uuid[]) from public, anon;

grant execute on function public.operacao_queue() to authenticated;
grant execute on function public.operacao_checklist() to authenticated;
grant execute on function public.inspection_target(uuid) to authenticated;
grant execute on function public.register_inspection(jsonb) to authenticated;
grant execute on function public.close_maintenance(jsonb) to authenticated;
grant execute on function public.release_garment(uuid, text) to authenticated;
grant execute on function public.maintenances_of(uuid) to authenticated;
grant execute on function public.operacao_suppliers() to authenticated;
grant execute on function public.garment_costs(uuid[]) to authenticated;

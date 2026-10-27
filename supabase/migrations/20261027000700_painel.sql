-- =====================================================================
-- Senzi OS · Dashboard e Inteligência: leituras agregadas (src/data/source-painel.ts).
--
-- Sem tabelas novas: tudo é derivado ao vivo das áreas anteriores, com as mesmas
-- regras da fonte em memória (src/data/mock/painel.ts, src/domain/alerts.ts,
-- src/domain/intel*.ts). "Hoje" = public.store_today() (devolvido em `today` /
-- `period.to`, então as telas não dependem do relógio do navegador).
--
-- Permissões (escondidas no próprio banco, além da tela):
--   dashboard_summary — dashboard.view; `finance` sai null sem financeiro.consolidated;
--     alertas filtrados como visibleAlerts (src/features/dashboard/alertAccess.ts):
--     pagamento_pendente exige financeiro.view; os demais, a permissão da rota de destino.
--   intel_report — inteligencia.view; sem acervo.cost: `idleCapital[].cost` null,
--     `paidBack` vazio e os insights de custo (pecas-paradas, payback) não saem.
--     idle_alert_days é lido direto de app_settings (get_settings exige reserva.view).
--
-- Desempates (a fonte em memória usa a ordem dos arrays do mundo): reservas por
-- criação (created_at, code), peças e clientes por código, ordens por abertura,
-- provas por horário. Ordenações por nome/rótulo (localeCompare pt-BR) usam
-- norm(texto) e depois o texto.
-- =====================================================================

-- Formatação (textos dos alertas e insights) ----------------------------

-- "R$ 1.234" (brl(n, { cents: false }) de src/lib/format.ts).
create function public.brl0(p numeric)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when round(coalesce(p, 0)) < 0 then '-' else '' end || 'R$ '
         || translate(to_char(abs(round(coalesce(p, 0))), 'FM999,999,999,990'), ',', '.')
$$;

-- "1 dia" / "3 dias".
create function public.plural_pt(p_n bigint, p_one text, p_many text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select p_n || ' ' || case when p_n = 1 then p_one else p_many end
$$;

-- "37%" (Math.round(x * 100), em float8 como no JS).
create function public.pct_pt(p float8)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select floor(coalesce(p, 0) * 100 + 0.5)::bigint || '%'
$$;

-- "2,5" (toLocaleString pt-BR com uma casa).
create function public.num1_pt(p float8)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select translate(to_char(round(coalesce(p, 0)::numeric, 1), 'FM999,999,990.0'), ',.', '.,')
$$;

-- "dd/mm".
create function public.dm_pt(p date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select to_char(p, 'DD/MM')
$$;

-- relativeDay de src/domain/dates.ts.
create function public.relative_day_pt(p date, p_today date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p - p_today = 0 then 'hoje'
    when p - p_today = 1 then 'amanhã'
    when p - p_today = -1 then 'ontem'
    when p - p_today > 0 then 'em ' || (p - p_today) || ' dias'
    else 'há ' || (p_today - p) || ' dias'
  end
$$;

-- Abreviação do mês ("out").
create function public.month_abbr(p date)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select (array['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'])[extract(month from p)::int]
$$;

-- Próximo aniversário a partir de hoje (inclusive); 29/02 vira 28/02 em ano não bissexto (nextBirthday).
create function public.next_birthday(p_birth date, p_today date)
returns date
language sql
immutable
set search_path = public, pg_temp
as $$
  with y as (select extract(year from p_today)::int as ty, extract(month from p_birth)::int as m, extract(day from p_birth)::int as d),
  c as (
    select make_date(y.ty, y.m, case when y.m = 2 and y.d = 29 and not ((y.ty % 4 = 0 and y.ty % 100 <> 0) or y.ty % 400 = 0) then 28 else y.d end) as this_year,
           make_date(y.ty + 1, y.m, case when y.m = 2 and y.d = 29 and not (((y.ty + 1) % 4 = 0 and (y.ty + 1) % 100 <> 0) or (y.ty + 1) % 400 = 0) then 28 else y.d end) as next_year
      from y
  )
  select case when c.this_year < p_today then c.next_year else c.this_year end from c
$$;

-- Rótulo do estado da peça em minúsculas (GARMENT_STATE[...].label.toLowerCase()).
create function public.garment_state_lower(p public.garment_state)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p
    when 'disponivel' then 'disponível'
    when 'reservado' then 'reservado'
    when 'retirado' then 'retirado'
    when 'em_uso' then 'em uso'
    when 'aguardando_devolucao' then 'aguardando devolução'
    when 'higienizacao' then 'higienização'
    when 'inspecao' then 'inspeção'
    when 'ajuste' then 'ajuste'
    when 'manutencao' then 'manutenção'
    when 'bloqueado' then 'bloqueado'
    when 'baixado' then 'baixado do acervo'
  end
$$;

-- =====================================================================
-- Dashboard
-- =====================================================================

-- Alertas (computeAlerts de src/domain/alerts.ts), já ordenados por severidade e, dentro dela,
-- pela ordem de geração: reservas, peças em inspeção, ordens longas, aniversários, peças em risco,
-- atrasos com fila, provas sem resultado. Sem filtro de permissão (quem chama filtra). → [Alert]
create function public.painel_alerts(p_today date)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with res as (
    select r.*, row_number() over (order by r.created_at, r.code) as ord,
           coalesce(c.full_name, '—') as cname,
           coalesce((
             select string_agg(g.code, ', ' order by i.position)
               from public.reservation_item i join public.garment g on g.id = i.garment_id
              where i.reservation_id = r.id and i.item_state <> 'cancelado'
           ), '') as codes
      from public.reservation r
      left join public.customer c on c.id = r.customer_id
  ),
  -- Locações vivas da agenda das peças (ativas, de reserva não encerrada).
  rentals as (
    select b.garment_id, b.reservation_id, lower(b.period) as d_from, upper(b.period) - 1 as d_to
      from public.garment_calendar_block b
      left join public.reservation r on r.id = b.reservation_id
     where b.released_at is null and b.kind = 'locacao'
       and not coalesce(r.state = any (public.reservation_states('closed')), false)
  ),
  a as (
    -- 1. reservas: devolução atrasada / hoje
    select case when p_today - r.return_due_date > 0 then 'critico' else 'atencao' end as sev, 1 as sec, r.ord as o1, 1 as o2, 0 as o3,
           case when p_today - r.return_due_date > 0 then
             jsonb_build_object('kind', 'devolucao_atrasada', 'icon', 'alerta', 'title', 'Devolução atrasada — ' || r.cname,
               'detail', r.codes || ' · ' || public.plural_pt(p_today - r.return_due_date, 'dia', 'dias') || ' · prevista ' || public.dm_pt(r.return_due_date),
               'route', '/reservas/' || r.id)
           else
             jsonb_build_object('kind', 'devolucao_hoje', 'icon', 'relogio', 'title', 'Devolução hoje — ' || r.cname,
               'detail', r.codes, 'route', '/reservas/' || r.id)
           end as j
      from res r
     where r.state = any (public.reservation_states('out')) and p_today - r.return_due_date >= 0
    union all
    -- retirada amanhã
    select 'info', 1, r.ord, 2, 0,
           jsonb_build_object('kind', 'retirada_amanha', 'icon', 'presente', 'title', 'Retirada amanhã — ' || r.cname,
             'detail', r.codes || ' · ' || public.dm_pt(r.pickup_date), 'route', '/reservas/' || r.id)
      from res r
     where r.state in ('confirmada', 'pronta_retirada') and r.pickup_date - p_today = 1
    union all
    -- pagamento pendente (até 3 dias da retirada)
    select case when r.pickup_date - p_today <= 1 then 'critico' else 'atencao' end, 1, r.ord, 3, 0,
           jsonb_build_object('kind', 'pagamento_pendente', 'icon', 'moeda', 'title', 'Pagamento pendente — ' || r.cname,
             'detail', r.codes || ' · falta ' || public.brl(d.due) || ' · retirada ' || public.dm_pt(r.pickup_date), 'route', '/reservas/' || r.id)
      from res r
      cross join lateral (select public.reservation_open_due(r.id) as due) d
     where r.state in ('confirmada', 'pronta_retirada') and r.pickup_date - p_today <= 3 and d.due > 0.005
    union all
    -- peça não entregue na retirada
    select 'atencao', 1, r.ord, 4, i.position,
           jsonb_build_object('kind', 'item_nao_entregue', 'icon', 'alerta', 'title', coalesce(g.code, 'Peça') || ' não foi entregue na retirada',
             'detail', r.code || ' — ' || r.cname || coalesce(' · ' || nullif(i.pickup_note, ''), ''), 'route', '/reservas/' || r.id)
      from res r
      join public.reservation_item i on i.reservation_id = r.id and i.item_state = 'nao_entregue'
      left join public.garment g on g.id = i.garment_id
     where r.state = any (public.reservation_states('active'))
    union all
    -- 2. peças aguardando inspeção
    select case when x.days >= 1 then 'atencao' else 'info' end, 2, 0, 0, 0,
           case when x.days >= 1 then
             jsonb_build_object('kind', 'inspecao_parada', 'icon', 'alerta', 'title', x.code || ' aguarda inspeção há ' || public.plural_pt(x.days, 'dia', 'dias'),
               'detail', x.name, 'route', '/acervo/' || x.id)
           else
             jsonb_build_object('kind', 'inspecao_pendente', 'icon', 'operacao', 'title', x.code || ' devolvida — aguardando inspeção',
               'detail', x.name, 'route', '/operacao')
           end || jsonb_build_object('_code', x.code)
      from (
        select g.id, g.code, g.name,
               coalesce(greatest(0, p_today - (select max(public.store_day(h.occurred_at)) from public.garment_state_history h
                                                where h.garment_id = g.id and h.to_state = 'inspecao')), 0) as days
          from public.garment g
         where g.state = 'inspecao'
      ) x
    union all
    -- 3. ordens de serviço abertas há 7 dias ou mais
    select 'atencao', 3, row_number() over (order by m.opened_at, m.id), 0, 0,
           jsonb_build_object('kind', 'manutencao_longa', 'icon', 'costura',
             'title', coalesce(g.code, 'Peça') || ' há ' || (p_today - public.store_day(m.opened_at)) || ' dias em ' || public.maintenance_kind_label(m.kind),
             'detail', coalesce(m.description, ''), 'route', '/operacao')
      from public.maintenance m
      left join public.garment g on g.id = m.garment_id
     where m.state in ('aberta', 'em_andamento') and p_today - public.store_day(m.opened_at) >= 7
    union all
    -- 4. aniversários (hoje e próximos 3 dias)
    select 'info', 4, 0, 0, 0,
           case when b.d = p_today then
             jsonb_build_object('kind', 'aniversario', 'icon', 'presente', 'title', 'Aniversário hoje — ' || c.full_name,
               'detail', 'Boa hora para um contato', 'route', '/clientes/' || c.id)
           else
             jsonb_build_object('kind', 'aniversario', 'icon', 'presente', 'title', 'Aniversário em ' || public.plural_pt(b.d - p_today, 'dia', 'dias') || ' — ' || c.full_name,
               'detail', public.dm_pt(b.d), 'route', '/clientes/' || c.id)
           end || jsonb_build_object('_code', c.code)
      from public.customer c
      cross join lateral (select public.next_birthday(c.birth_date, p_today) as d) b
     where c.birth_date is not null and b.d - p_today <= 3
    union all
    -- 5. peça parada em estado operacional com retirada em até 7 dias
    select case when n.d_from - p_today <= 2 then 'critico' else 'atencao' end, 5, 0, 0, 0,
           jsonb_build_object('kind', 'peca_em_risco', 'icon', 'alerta',
             'title', g.code || ' está em ' || public.garment_state_lower(g.state) || ' e tem retirada ' || public.relative_day_pt(n.d_from, p_today),
             'detail', g.name || coalesce(' · ' || nr.code || ' — ' || coalesce(nc.full_name, '—'), '') || ' · retirada ' || public.dm_pt(n.d_from),
             'route', '/acervo/' || g.id, '_code', g.code)
      from public.garment g
      cross join lateral (
        select x.* from rentals x where x.garment_id = g.id and x.d_to >= p_today order by x.d_from limit 1
      ) n
      left join public.reservation nr on nr.id = n.reservation_id
      left join public.customer nc on nc.id = nr.customer_id
     where g.state in ('inspecao', 'higienizacao', 'ajuste', 'manutencao', 'bloqueado') and n.d_from - p_today <= 7
    union all
    -- 6. atraso que compromete a próxima reserva da peça (um por reserva: a 1ª peça com fila)
    select 'critico', 6, q.ord, 0, 0,
           jsonb_build_object('kind', 'atraso_com_fila', 'icon', 'alerta',
             'title', 'Atraso de ' || split_part(q.cname, ' ', 1) || ' compromete a próxima reserva de ' || q.gcode,
             'detail', q.gcode || ' venceu ' || public.dm_pt(q.return_due_date) || ' · ' || q.ocode || ' — ' || q.oname || ' retira ' || public.dm_pt(q.d_from),
             'route', '/reservas/' || q.id)
      from (
        select distinct on (r.id) r.id, r.ord, r.cname, r.return_due_date, g.code as gcode, o.code as ocode,
               coalesce(oc.full_name, '—') as oname, nx.d_from
          from res r
          join public.reservation_item i on i.reservation_id = r.id
          join public.garment g on g.id = i.garment_id
          cross join lateral (
            select x.* from rentals x
             where x.garment_id = i.garment_id and x.reservation_id is distinct from r.id and x.d_from >= p_today
             order by x.d_from limit 1
          ) nx
          join public.reservation o on o.id = nx.reservation_id
          left join public.customer oc on oc.id = o.customer_id
         where r.state = any (public.reservation_states('out')) and r.return_due_date < p_today
         order by r.id, i.position
      ) q
    union all
    -- 7. provas de hoje ou atrasadas sem resultado
    select case when public.store_day(f.scheduled_at) < p_today then 'atencao' else 'info' end, 7,
           row_number() over (order by f.scheduled_at, f.code), 0, 0,
           jsonb_build_object('kind', 'prova_sem_resultado', 'icon', 'prova',
             'title', 'Prova de ' || coalesce(c.full_name, '—') || ' sem resultado registrado',
             'detail', f.code || ' · ' || to_char(f.scheduled_at at time zone 'America/Araguaina', 'DD/MM HH24:MI')
                       || case when p.n > 0 then ' · ' || p.n || ' peça(s) sem avaliação' else '' end,
             'route', '/provas/' || f.id)
      from public.fitting_session f
      left join public.customer c on c.id = f.customer_id
      cross join lateral (
        select count(*) as n from public.fitting_item i where i.fitting_session_id = f.id and i.outcome = 'nao_provou'
      ) p
     where f.state in ('agendada', 'em_curso') and public.store_day(f.scheduled_at) <= p_today
  )
  select coalesce(jsonb_agg(
           jsonb_build_object('sev', a.sev) || (a.j - '_code')
           order by array_position(array['critico', 'atencao', 'info'], a.sev), a.sec, a.o1, a.j ->> '_code', a.o2, a.o3
         ), '[]'::jsonb)
    from a
$$;

-- Dashboard "Hoje" (dashboardSummary de src/data/mock/painel.ts). `p_range` = '7' (últimos 7 dias),
-- '30' (do dia 1 do mês até hoje) ou '90' (últimos 90 dias). → DashboardSummary
create function public.dashboard_summary(p_range text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_from date;
  v_month date := date_trunc('month', v_today::timestamp)::date;
  v_tiles jsonb;
  v_cycle jsonb;
  v_alerts jsonb;
  v_agenda jsonb;
  v_days jsonb;
  v_finance jsonb;
  v_fittings jsonb;
  v_fin_view boolean;
  v_perm jsonb;
begin
  perform public.require_perm('dashboard.view');
  if coalesce(p_range, '') not in ('7', '30', '90') then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'range';
  end if;
  v_from := case when p_range = '30' then v_month else v_today - (p_range::int - 1) end;

  with live as (select g.state from public.garment g where g.state <> 'baixado')
  select jsonb_build_object(
           'pickupsToday', (
             select jsonb_build_object('count', count(*),
                      'firstNames', coalesce(jsonb_agg(split_part(coalesce(c.full_name, ''), ' ', 1) order by r.created_at, r.code), '[]'::jsonb))
               from public.reservation r left join public.customer c on c.id = r.customer_id
              where r.pickup_date = v_today and r.state in ('confirmada', 'pronta_retirada')),
           'returnsToday', (select count(*) from public.reservation r
                             where r.state = any (public.reservation_states('out')) and r.return_due_date = v_today),
           'overdue', (select count(*) from public.reservation r
                        where r.state = any (public.reservation_states('out')) and r.return_due_date < v_today),
           'eventsToday', (select count(*) from public.reservation r
                            where r.event_date = v_today and r.state = any (public.reservation_states('active'))),
           'availableGarments', (select count(*) from live where state = 'disponivel'),
           'totalGarments', (select count(*) from live)
         ),
         jsonb_build_object(
           'inspecao', count(*) filter (where state = 'inspecao'),
           'higienizacao', count(*) filter (where state = 'higienizacao'),
           'ajuste', count(*) filter (where state = 'ajuste'),
           'manutencao', count(*) filter (where state = 'manutencao'),
           'bloqueado', count(*) filter (where state = 'bloqueado'),
           'reservado', count(*) filter (where state = 'reservado'),
           'foraDaLoja', count(*) filter (where state in ('em_uso', 'retirado', 'aguardando_devolucao')),
           'occupancyRate', 1 - (count(*) filter (where state = 'disponivel'))::float8 / greatest(1, count(*))
         )
    into v_tiles, v_cycle
    from live;

  -- Alertas que o perfil pode ver (a mesma regra de visibleAlerts na tela).
  v_fin_view := public.has_perm('financeiro.view');
  v_perm := jsonb_build_object(
    '/reservas', public.has_perm('reserva.view'),
    '/acervo', public.has_perm('acervo.view'),
    '/clientes', public.has_perm('cliente.view'),
    '/provas', public.has_perm('prova.view'),
    '/operacao', public.has_perm('operacao.view'));
  select coalesce(jsonb_agg(x.a order by x.n), '[]'::jsonb)
    into v_alerts
    from jsonb_array_elements(public.painel_alerts(v_today)) with ordinality as x(a, n)
   where (x.a ->> 'kind' <> 'pagamento_pendente' or v_fin_view)
     and coalesce((v_perm ->> substring(x.a ->> 'route' from '^/[a-z]+'))::boolean, true);

  -- Agenda de hoje (o mesmo item da agenda) e dias do mês com compromisso.
  select coalesce(jsonb_agg(public.agenda_item_json(a.id) order by a.starts_at, a.created_at, a.id), '[]'::jsonb)
    into v_agenda
    from public.appointment a
   where a.state <> 'cancelado'
     and a.starts_at >= public.store_at(v_today, '00:00')
     and a.starts_at < public.store_at(v_today + 1, '00:00');
  select coalesce(jsonb_agg(x.day order by x.day), '[]'::jsonb)
    into v_days
    from (
      select distinct (a.starts_at at time zone 'America/Araguaina')::date as day
        from public.appointment a
       where a.state <> 'cancelado'
         and a.starts_at >= public.store_at(v_month, '00:00')
         and a.starts_at < public.store_at((v_month + interval '1 month')::date, '00:00')
    ) x;

  -- Faturamento (regime de caixa, caução fora) e locações realizadas do período: só com o consolidado.
  if public.has_perm('financeiro.consolidated') then
    select jsonb_build_object(
             'range', p_range,
             'revenue', (select round(coalesce(sum(x.amount), 0), 2) from public.fin_receipts() x where x.day between v_from and v_today),
             'ticket', case when count(*) > 0 then round(sum(r.total_net) / count(*), 2) else 0 end,
             'rentals', count(*),
             'series', (
               select jsonb_agg(jsonb_build_object(
                        'label', public.month_abbr(m.start), 'month', to_char(m.start, 'YYYY-MM'),
                        'value', (select round(coalesce(sum(x.amount), 0), 2) from public.fin_receipts() x where x.day between m.start and m.finish)
                      ) order by m.start)
                 from (
                   select s.start, case when s.i = 6 then v_today else (s.start + interval '1 month' - interval '1 day')::date end as finish
                     from (select i, (v_month - make_interval(months => 6 - i))::date as start from generate_series(0, 6) i) s
                 ) m
             ))
      into v_finance
      from public.reservation r
     where r.state = any (public.reservation_states('realized')) and r.pickup_date between v_from and v_today;
  end if;

  -- Provas abertas até amanhã (o card do lugar do faturamento).
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', f.id, 'code', f.code, 'at', public.store_instant(f.scheduled_at), 'customerName', coalesce(c.full_name, '—'),
           'itemCount', (select count(*) from public.fitting_item i where i.fitting_session_id = f.id), 'state', f.state
         ) order by f.scheduled_at, f.code), '[]'::jsonb)
    into v_fittings
    from public.fitting_session f
    left join public.customer c on c.id = f.customer_id
   where f.state in ('agendada', 'em_curso') and public.store_day(f.scheduled_at) <= v_today + 1;

  return jsonb_build_object(
    'today', v_today,
    'tiles', v_tiles,
    'alerts', v_alerts,
    'agendaToday', v_agenda,
    'agendaMonthDays', v_days,
    'cycle', v_cycle,
    'finance', v_finance,
    'fittingsSoon', v_fittings
  );
end
$$;

-- =====================================================================
-- Inteligência
-- =====================================================================

-- Uma peça do escopo (filtro de categoria) com a economia (todo o histórico), as provas (todas as
-- sessões) e os números do período. `cost` null sem acervo.cost.
create type public.intel_garment as (
  id uuid,
  code text,
  name text,
  hex text,
  color text,
  size text,
  cat text,
  state public.garment_state,
  active boolean,
  cost numeric,
  rental_price numeric,
  born date,
  rentals int,
  revenue numeric,
  last_rental date,
  fittings int,
  converted int,
  alterations int,
  discards int,
  last_note text,
  p_rentals int,
  p_revenue numeric,
  occupied int,
  p_fittings int
);

-- Um item-locação com retirada no período (`ord` = ordem de criação da reserva, posição do item).
create type public.intel_line as (
  garment_id uuid,
  ord bigint,
  pickup_date date,
  net numeric,
  hex text,
  color text,
  size text,
  cat text
);

-- Pressão por segmento (pressure de src/domain/intel-pressure.ts) sobre as peças do acervo do escopo,
-- ordenada por pressão (desc). `p_dim` = size | category | color. → [PressureRow]
create function public.intel_pressure(p_g public.intel_garment[], p_dim text, p_days int)
returns jsonb
language sql
immutable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', s.key, 'garments', s.n, 'rentals', s.rentals, 'fittings', s.fittings, 'occupiedDays', s.occupied,
           'revenue', s.revenue, 'pressure', s.pressure, 'occupancy', s.occupancy
         ) order by s.pressure desc, s.rentals desc, public.norm(s.key), s.key), '[]'::jsonb)
    from (
      select k.key, count(*)::int as n, sum(g.p_rentals)::int as rentals, sum(g.p_fittings)::int as fittings,
             sum(g.occupied)::int as occupied, round(sum(g.p_revenue), 2) as revenue,
             (sum(g.p_rentals) + 0.5 * sum(g.p_fittings))::float8 / count(*) as pressure,
             least(1, greatest(0, sum(g.occupied)::float8 / (count(*) * p_days))) as occupancy
        from unnest(p_g) g
        cross join lateral (select case p_dim when 'size' then g.size when 'category' then g.cat else g.color end as key) k
       where g.active
       group by k.key
    ) s
$$;

-- Relatório da Inteligência (intelReport de src/domain/intel.ts). `p_days` = 90 | 180 | 365 (janela
-- [hoje − dias + 1, hoje]); `p_category` = slug (null = todas). O filtro de categoria vale para tudo menos
-- clientes e provas globais (tile, taxa e funil). → IntelReport
create function public.intel_report(p_days int, p_category text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_from date;
  v_cost boolean;
  v_idle int;
  v_g public.intel_garment[];
  v_l public.intel_line[];
  v_n int;
  v_revenue numeric;
  v_avg numeric;
  v_acervo int;
  v_cust jsonb;
  v_monthly jsonb;
  v_top jsonb;
  v_bottom jsonb;
  v_colors jsonb;
  v_sizes jsonb;
  v_ticket jsonb;
  v_size_p jsonb;
  v_cat_p jsonb;
  v_occ jsonb;
  v_conv_g jsonb;
  v_fnr jsonb;
  v_rare jsonb;
  v_funnel jsonb;
  v_conv float8;
  v_idle_rows jsonb;
  v_paid jsonb;
  v_customers jsonb;
  v_ins jsonb := '[]'::jsonb;
  v_x jsonb;
  v_k int;
  v_s text;
begin
  perform public.require_perm('inteligencia.view');
  if p_days is null or p_days not in (90, 180, 365) then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'days';
  end if;
  v_from := v_today - p_days + 1;
  v_cost := public.has_perm('acervo.cost');
  select s.idle_alert_days into v_idle from public.app_settings s where s.id;

  -- Bases: peças do escopo e itens-locação (reserva realizada, item não cancelado nem "não entregue").
  with scope as (
    select g.id, g.code, g.name, g.color_hex, coalesce(nullif(g.color_primary, ''), '—') as color, g.size_equiv::text as size,
           coalesce(nullif(c.name, ''), '—') as cat, g.state, g.acquisition_cost, g.rental_price,
           coalesce(
             (select public.store_day(h.occurred_at) from public.garment_state_history h
               where h.garment_id = g.id and h.from_state is null order by h.occurred_at desc, h.id desc limit 1),
             (select public.store_day(h.occurred_at) from public.garment_state_history h
               where h.garment_id = g.id order by h.occurred_at, h.id limit 1)
           ) as born
      from public.garment g
      join public.garment_category c on c.id = g.category_id
     where p_category is null or c.slug = p_category
  ),
  lines as (
    select i.garment_id, r.pickup_date, i.net_revenue as net, coalesce(r.event_date, r.pickup_date) as used_on,
           row_number() over (order by r.created_at, r.code, i.position) as ord,
           -- fim da locação: devolução real; ainda fora, até hoje (ou a prevista, se futura); senão a prevista
           greatest(r.pickup_date, case
             when coalesce(i.returned_at, r.returned_at) is not null then public.store_day(coalesce(i.returned_at, r.returned_at))
             when r.state = any (public.reservation_states('out')) then greatest(r.return_due_date, v_today)
             else r.return_due_date end) as span_to
      from public.reservation_item i
      join public.reservation r on r.id = i.reservation_id
     where i.garment_id in (select id from scope)
       and r.state = any (public.reservation_states('realized'))
       and i.item_state not in ('cancelado', 'nao_entregue')
  ),
  tried as (
    select i.garment_id, i.outcome, i.needs_alteration, i.note, f.reservation_id, f.id as session_id,
           coalesce(i.recorded_at, f.scheduled_at) as seen_at,
           public.store_day(f.scheduled_at) between v_from and v_today as in_period
      from public.fitting_item i
      join public.fitting_session f on f.id = i.fitting_session_id
     where i.outcome <> 'nao_provou' and i.garment_id in (select id from scope)
  ),
  g as (
    select row(
             s.id, s.code, s.name, s.color_hex, s.color, s.size, s.cat, s.state, s.state <> 'baixado',
             case when v_cost then s.acquisition_cost end, s.rental_price, s.born,
             e.rentals, e.revenue, e.last_rental,
             ft.fittings, ft.converted, ft.alterations, ft.discards,
             (select t.note from tried t
               where t.garment_id = s.id and regexp_replace(coalesce(t.note, ''), '^\s+|\s+$', '', 'g') <> ''
               order by t.seen_at desc, t.session_id desc limit 1),
             e.p_rentals, e.p_revenue,
             coalesce((
               select sum(upper(x) - lower(x))
                 from unnest((
                   select range_agg(daterange(greatest(l.pickup_date, v_from), least(l.span_to, v_today), '[]'))
                     from lines l
                    where l.garment_id = s.id and greatest(l.pickup_date, v_from) <= least(l.span_to, v_today)
                 )) x
             ), 0)::int,
             ft.p_fittings
           )::public.intel_garment as rec, s.code
      from scope s
      cross join lateral (
        select count(*)::int as rentals, round(coalesce(sum(l.net), 0), 2) as revenue, max(l.used_on) as last_rental,
               (count(*) filter (where l.pickup_date between v_from and v_today))::int as p_rentals,
               round(coalesce(sum(l.net) filter (where l.pickup_date between v_from and v_today), 0), 2) as p_revenue
          from lines l where l.garment_id = s.id
      ) e
      cross join lateral (
        select count(*)::int as fittings,
               (count(*) filter (where t.reservation_id is not null and public.reservation_has_garment(t.reservation_id, s.id)))::int as converted,
               (count(*) filter (where t.needs_alteration or t.outcome = 'precisa_ajuste'))::int as alterations,
               (count(*) filter (where t.outcome in ('descartada', 'nao_gostou')))::int as discards,
               (count(*) filter (where t.in_period))::int as p_fittings
          from tried t where t.garment_id = s.id
      ) ft
  ),
  pl as (
    select row(l.garment_id, l.ord, l.pickup_date, l.net, s.color_hex, s.color, s.size, s.cat)::public.intel_line as rec, l.ord
      from lines l join scope s on s.id = l.garment_id
     where l.pickup_date between v_from and v_today
  )
  select (select array_agg(g.rec order by g.code) from g), (select array_agg(pl.rec order by pl.ord) from pl)
    into v_g, v_l;
  v_g := coalesce(v_g, '{}');
  v_l := coalesce(v_l, '{}');

  select count(*)::int, round(coalesce(sum(l.net), 0), 2) into v_n, v_revenue from unnest(v_l) l;
  v_avg := case when v_n > 0 then round(v_revenue / v_n, 2) else 0 end;
  select count(*)::int into v_acervo from unnest(v_g) g where g.active;

  -- Clientes (todo o histórico, sem filtro): reservas realizadas e Σ líquido delas.
  select jsonb_build_object(
           'active', count(*) filter (where x.rentals > 0),
           'total', count(*),
           'recurrent', count(*) filter (where x.rentals >= 2),
           'single', count(*) filter (where x.rentals = 1),
           'recurrentSpent', round(coalesce(sum(x.spent) filter (where x.rentals >= 2), 0), 2),
           'singleSpent', round(coalesce(sum(x.spent) filter (where x.rentals = 1), 0), 2),
           'allSpent', coalesce(sum(x.spent), 0),
           'top', coalesce((
             select jsonb_agg(jsonb_build_object('customerId', t.id, 'name', t.full_name, 'city', t.city, 'rentals', t.rentals,
                                                 'spent', t.spent, 'ticket', round(t.spent / t.rentals, 2)) order by t.spent desc, t.code)
               from (
                 select y.* from (
                   select c.id, c.code, c.full_name, c.city,
                          (count(r.id) filter (where r.state = any (public.reservation_states('realized'))))::int as rentals,
                          round(coalesce(sum(r.total_net) filter (where r.state = any (public.reservation_states('realized'))), 0), 2) as spent
                     from public.customer c left join public.reservation r on r.customer_id = c.id
                    group by c.id
                 ) y where y.rentals > 0 order by y.spent desc, y.code limit 8
               ) t
           ), '[]'::jsonb)
         )
    into v_cust
    from (
      select c.id,
             (count(r.id) filter (where r.state = any (public.reservation_states('realized'))))::int as rentals,
             round(coalesce(sum(r.total_net) filter (where r.state = any (public.reservation_states('realized'))), 0), 2) as spent
        from public.customer c left join public.reservation r on r.customer_id = c.id
       group by c.id
    ) x;

  -- Meses do período (rótulo com o ano quando a abreviação se repete).
  select jsonb_agg(jsonb_build_object(
           'month', to_char(m.start, 'YYYY-MM'),
           'label', case when m.dup > 1 then public.month_abbr(m.start) || '/' || to_char(m.start, 'YY') else public.month_abbr(m.start) end,
           'rentals', (select count(*) from unnest(v_l) l where date_trunc('month', l.pickup_date::timestamp)::date = m.start),
           'revenue', (select round(coalesce(sum(l.net), 0), 2) from unnest(v_l) l where date_trunc('month', l.pickup_date::timestamp)::date = m.start)
         ) order by m.start)
    into v_monthly
    from (
      select d.start, count(*) over (partition by public.month_abbr(d.start)) as dup
        from (select x::date as start
                from generate_series(date_trunc('month', v_from::timestamp), date_trunc('month', v_today::timestamp), interval '1 month') x) d
    ) m;

  -- Receita por peça: top 8 (com locação no período) e as 8 do acervo de menor receita.
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', t.id, 'name', t.name, 'hex', t.hex, 'rentals', t.p_rentals, 'revenue', t.p_revenue)
                            order by t.p_revenue desc, t.p_rentals desc, t.code), '[]'::jsonb)
    into v_top
    from (select g.* from unnest(v_g) g where g.p_rentals > 0 order by g.p_revenue desc, g.p_rentals desc, g.code limit 8) t;
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', t.id, 'name', t.name, 'hex', t.hex, 'rentals', t.p_rentals, 'revenue', t.p_revenue)
                            order by t.p_revenue, t.p_rentals, public.norm(t.name), t.name, t.code), '[]'::jsonb)
    into v_bottom
    from (select g.* from unnest(v_g) g where g.active order by g.p_revenue, g.p_rentals, public.norm(g.name), g.name, g.code limit 8) t;

  -- Cores, tamanhos e ticket por categoria do período.
  select coalesce(jsonb_agg(jsonb_build_object('color', c.color, 'hex', c.hex, 'rentals', c.rentals,
                                               'inStock', (select count(*) from unnest(v_g) g where g.active and g.color = c.color),
                                               'revenue', c.revenue)
                            order by c.rentals desc, c.revenue desc, c.first), '[]'::jsonb)
    into v_colors
    from (
      select l.color, (array_agg(l.hex order by l.ord))[1] as hex, count(*)::int as rentals, round(sum(l.net), 2) as revenue, min(l.ord) as first
        from unnest(v_l) l group by l.color
    ) c;
  select coalesce(jsonb_agg(jsonb_build_object('size', s.size, 'rentals', s.rentals)
                            order by s.rentals desc, array_position(array['PP', 'P', 'M', 'G', 'GG', 'U'], s.size)), '[]'::jsonb)
    into v_sizes
    from (select l.size, count(*)::int as rentals from unnest(v_l) l group by l.size) s;
  select coalesce(jsonb_agg(jsonb_build_object('category', c.cat, 'rentals', c.rentals, 'avgTicket', c.avg)
                            order by c.avg desc, c.first), '[]'::jsonb)
    into v_ticket
    from (
      select l.cat, count(*)::int as rentals, round(round(sum(l.net), 2) / count(*), 2) as avg, min(l.ord) as first
        from unnest(v_l) l group by l.cat
    ) c;

  -- Ocupação e pressão.
  v_size_p := public.intel_pressure(v_g, 'size', p_days);
  v_cat_p := public.intel_pressure(v_g, 'category', p_days);
  select coalesce(jsonb_agg(jsonb_build_object('category', p ->> 'key', 'garments', (p ->> 'garments')::int,
                                               'occupiedDays', (p ->> 'occupiedDays')::int, 'rate', (p ->> 'occupancy')::float8)
                            order by (p ->> 'occupancy')::float8 desc, public.norm(p ->> 'key'), p ->> 'key'), '[]'::jsonb)
    into v_occ
    from jsonb_array_elements(v_cat_p) p;

  -- Provas por peça (todo o histórico) e funil do período (global).
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', t.id, 'name', t.name, 'hex', t.hex, 'fittings', t.fittings,
                                               'converted', t.converted, 'rate', t.converted::float8 / nullif(t.fittings, 0))
                            order by t.converted::float8 / nullif(t.fittings, 0) desc, t.fittings desc, t.code), '[]'::jsonb)
    into v_conv_g
    from (
      select g.* from unnest(v_g) g where g.active and g.fittings >= 3
       order by g.converted::float8 / nullif(g.fittings, 0) desc, g.fittings desc, g.code limit 6
    ) t;
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', g.id, 'code', g.code, 'name', g.name, 'fittings', g.fittings,
                                               'converted', g.converted, 'rate', g.converted::float8 / nullif(g.fittings, 0),
                                               'alterations', g.alterations, 'discards', g.discards, 'lastNote', g.last_note)
                            order by g.fittings desc, g.code), '[]'::jsonb)
    into v_fnr
    from unnest(v_g) g
   where g.active and g.fittings >= 4 and g.converted::float8 / nullif(g.fittings, 0) < 0.35;
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', g.id, 'code', g.code, 'name', g.name, 'fittings', g.fittings, 'rentals', g.rentals)
                            order by g.code), '[]'::jsonb)
    into v_rare
    from unnest(v_g) g
   where g.active and g.fittings <= 1 and g.rentals <= 1;
  select jsonb_build_object(
           'scheduled', count(*),
           'held', count(*) filter (where f.state not in ('agendada', 'no_show')),
           'converted', count(*) filter (where f.state = 'convertida'),
           'closed', count(*) filter (where f.state in ('convertida', 'perdida', 'no_show'))
         )
    into v_funnel
    from public.fitting_session f
   where public.store_day(f.scheduled_at) between v_from and v_today;
  v_conv := case when (v_funnel ->> 'closed')::int > 0 then (v_funnel ->> 'converted')::float8 / (v_funnel ->> 'closed')::int end;

  -- Capital parado (peças com 30+ dias de cadastro sem locação ou paradas além do parâmetro) e payback.
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', g.id, 'code', g.code, 'name', g.name, 'state', g.state, 'cost', g.cost,
                                               'revenue', g.revenue, 'idleDays', case when g.rentals = 0 then null else v_today - g.last_rental end)
                            order by coalesce(g.cost, 0) desc, g.code), '[]'::jsonb)
    into v_idle_rows
    from unnest(v_g) g
   where g.active
     and not (g.born is not null and g.born > v_today - 30)
     and (g.rentals = 0 or coalesce(v_today - g.last_rental, 0) > v_idle);
  select coalesce(jsonb_agg(jsonb_build_object('garmentId', g.id, 'code', g.code, 'name', g.name, 'revenue', g.revenue, 'cost', g.cost,
                                               'payback', g.revenue::float8 / g.cost::float8,
                                               'rentalsToPayback', ceil(g.cost::float8 / coalesce(nullif(case when g.rentals > 0 then g.revenue::float8 / g.rentals else 0 end, 0),
                                                                                                   nullif(g.rental_price::float8, 0), 1))::int)
                            order by g.code), '[]'::jsonb)
    into v_paid
    from unnest(v_g) g
   where v_cost and g.active and g.cost > 0 and g.revenue >= g.cost;

  -- Insights (intelInsights de src/domain/intel-insights.ts), na ordem das regras 1–11.
  -- 1. tamanho com mais locações
  v_x := v_sizes -> 0;
  if v_n > 0 and v_x is not null then
    select count(*) into v_k from unnest(v_g) g where g.active and g.size = v_x ->> 'size';
    v_ins := v_ins || jsonb_build_object('id', 'tamanho-top', 'tone', 'green', 'icon', 'subir', 'group', 'comprar', 'ref', 'card-tamanhos',
      'html', 'Tamanho <b>' || (v_x ->> 'size') || '</b> concentra <b>' || public.pct_pt((v_x ->> 'rentals')::float8 / v_n)
              || '</b> das locações do período (' || (v_x ->> 'rentals') || ' de ' || v_n || ').',
      'why', 'O acervo tem ' || public.plural_pt(v_k, 'peça', 'peças') || ' nesse tamanho, de ' || v_acervo
             || '. Próximas compras deveriam respeitar essa proporção.');
  end if;
  -- 2. cores que giram ≥ 2,5× por peça (as 2 mais locadas)
  for v_x in select c from jsonb_array_elements(v_colors) with ordinality as e(c, n) where e.n <= 2 order by e.n loop
    if (v_x ->> 'inStock')::int = 0 then
      continue when (v_x ->> 'rentals')::int < 3;
      v_ins := v_ins || jsonb_build_object('id', 'cor-giro', 'tone', 'amber', 'icon', 'raio', 'group', 'comprar', 'ref', 'card-cores',
        'html', '<b>' || (v_x ->> 'color') || '</b> gira ' || (v_x ->> 'rentals') || '× sem estoque ativo — alta procura com estoque baixo.',
        'why', public.plural_pt((v_x ->> 'rentals')::int, 'locação', 'locações')
               || ' e nenhuma peça ativa nessa cor no acervo. Cada nova peça nessa cor tende a alugar sozinha.');
      continue;
    end if;
    continue when (v_x ->> 'rentals')::float8 / (v_x ->> 'inStock')::int < 2.5;
    v_ins := v_ins || jsonb_build_object('id', 'cor-giro', 'tone', 'amber', 'icon', 'raio', 'group', 'comprar', 'ref', 'card-cores',
      'html', '<b>' || (v_x ->> 'color') || '</b> gira ' || public.num1_pt((v_x ->> 'rentals')::float8 / (v_x ->> 'inStock')::int)
              || '× por peça — alta procura com estoque baixo.',
      'why', public.plural_pt((v_x ->> 'rentals')::int, 'locação', 'locações') || ' distribuídas em apenas '
             || public.plural_pt((v_x ->> 'inStock')::int, 'peça', 'peças') || '. Cada nova peça nessa cor tende a alugar sozinha.');
  end loop;
  -- 3. categorias com ocupação acima de 14% (as 2 maiores)
  for v_x in select c from jsonb_array_elements(v_occ) with ordinality as e(c, n) where e.n <= 2 order by e.n loop
    continue when (v_x ->> 'rate')::float8 <= 0.14;
    v_ins := v_ins || jsonb_build_object('id', 'ocupacao-categoria', 'tone', 'green', 'icon', 'inteligencia', 'group', 'comprar', 'ref', 'card-ocupacao',
      'html', 'Categoria <b>' || (v_x ->> 'category') || '</b> está com <b>' || public.pct_pt((v_x ->> 'rate')::float8)
              || '</b> de ocupação nos últimos ' || p_days || ' dias.',
      'why', (v_x ->> 'occupiedDays') || ' dias de peça alugados sobre ' || ((v_x ->> 'garments')::int * p_days) || ' dias disponíveis ('
             || public.plural_pt((v_x ->> 'garments')::int, 'peça', 'peças') || '). Faixas: atenção > 14%, falta acervo > 25%.');
  end loop;
  -- 4. peças paradas (só com acervo.cost: o texto traz o capital parado)
  if v_cost and jsonb_array_length(v_idle_rows) > 0 then
    select string_agg(c, ', ' order by c) filter (where n <= 4) || case when count(*) > 4 then '…' else '' end
      into v_s
      from (select e ->> 'code' as c, row_number() over (order by e ->> 'code') as n from jsonb_array_elements(v_idle_rows) e) x;
    v_ins := v_ins || jsonb_build_object('id', 'pecas-paradas', 'tone', 'red', 'icon', 'descer', 'group', 'rendimento', 'ref', 'card-capital',
      'requires', 'acervo.cost',
      'html', '<b>' || public.plural_pt(jsonb_array_length(v_idle_rows), 'peça', 'peças') || '</b> sem locação nos últimos ' || v_idle || ' dias.',
      'why', v_s || ' — ' || public.brl0((select sum(coalesce((e ->> 'cost')::numeric, 0)) from jsonb_array_elements(v_idle_rows) e))
             || ' de capital parado. Avaliar redução de preço, reposicionamento na vitrine ou baixa.');
  end if;
  -- 5. payback (as 2 primeiras)
  for v_x in select c from jsonb_array_elements(v_paid) with ordinality as e(c, n) where e.n <= 2 order by e.n loop
    v_ins := v_ins || jsonb_build_object('id', 'payback', 'tone', 'green', 'icon', 'moeda', 'group', 'rendimento', 'ref', 'card-pagas',
      'requires', 'acervo.cost',
      'html', '<b>' || (v_x ->> 'code') || ' — ' || (v_x ->> 'name') || '</b> recuperou o investimento após ' || (v_x ->> 'rentalsToPayback') || ' locações.',
      'why', public.brl0((v_x ->> 'revenue')::numeric) || ' de receita sobre ' || public.brl0((v_x ->> 'cost')::numeric)
             || ' de custo. A partir daqui, cada locação é margem quase integral.');
  end loop;
  -- 6. recorrência
  if (v_cust ->> 'recurrent')::int > 0 then
    v_ins := v_ins || jsonb_build_object('id', 'recorrencia', 'tone', 'green', 'icon', 'clientes', 'group', 'clientes', 'ref', 'card-recorrentes',
      'html', '<b>' || public.pct_pt((v_cust ->> 'recurrent')::float8 / (v_cust ->> 'active')::int)
              || '</b> das clientes que já alugaram voltaram pelo menos uma segunda vez.',
      'why', (v_cust ->> 'recurrent') || ' de ' || (v_cust ->> 'active') || '. Clientes recorrentes respondem por '
             || public.brl0((v_cust ->> 'recurrentSpent')::numeric) || ' — '
             || public.pct_pt((v_cust ->> 'recurrentSpent')::float8 / greatest(1, (v_cust ->> 'allSpent')::float8)) || ' da receita acumulada.');
  end if;
  -- 7. muito provada, pouco alugada (até 2)
  for v_x in select c from jsonb_array_elements(v_fnr) with ordinality as e(c, n) where e.n <= 2 order by e.n loop
    v_ins := v_ins || jsonb_build_object('id', 'prova-sem-conversao', 'tone', 'amber', 'icon', 'descer', 'group', 'provas', 'ref', 'card-encanta',
      'html', '<b>' || (v_x ->> 'code') || ' — ' || (v_x ->> 'name') || '</b>: ' || (v_x ->> 'fittings') || ' provas e '
              || case when (v_x ->> 'converted')::int = 0 then '<b>nenhuma</b> virou locação' else 'apenas ' || (v_x ->> 'converted') || ' virou locação' end
              || ' — ' || public.pct_pt(coalesce((v_x ->> 'rate')::float8, 0)) || ' de conversão.',
      'why', 'Alta experimentação e baixa conversão. '
             || case when (v_x ->> 'alterations')::int > 0 then (v_x ->> 'alterations') || ' clientes precisaram de ajuste. ' else '' end
             || case when coalesce(v_x ->> 'lastNote', '') <> ''
                     then 'A equipe registrou: “' || regexp_replace(regexp_replace(v_x ->> 'lastNote', '^\s+|\s+$', '', 'g'), '\.$', '') || '”. '
                     else '' end
             || 'Revisar caimento, preço, conservação ou posicionamento na arara.');
  end loop;
  -- 8. tamanho de maior pressão (com ≥ 2 peças)
  select p into v_x from jsonb_array_elements(v_size_p) with ordinality as e(p, n) where (p ->> 'garments')::int >= 2 order by e.n limit 1;
  if v_x is not null and (v_x ->> 'pressure')::float8 > 0 then
    v_ins := v_ins || jsonb_build_object('id', 'pressao-tamanho', 'tone', 'amber', 'icon', 'raio', 'group', 'comprar', 'ref', 'card-pressao-tamanho',
      'html', 'Tamanho <b>' || (v_x ->> 'key') || '</b> tem a maior pressão do acervo: ' || public.num1_pt((v_x ->> 'pressure')::float8) || ' procuras por peça.',
      'why', (v_x ->> 'rentals') || ' locações e ' || (v_x ->> 'fittings') || ' provas distribuídas em ' || (v_x ->> 'garments') || ' peças, com '
             || translate(to_char(round(((v_x ->> 'occupancy')::float8 * 100)::numeric, 1), 'FM999,999,990.0'), ',.', '.,') || '%'
             || ' de ocupação. Pressão mede procura por peça — não volume absoluto, que só reflete quantas peças existem naquele tamanho.');
  end if;
  -- 9. quase nunca provadas
  if jsonb_array_length(v_rare) >= 2 then
    select string_agg(e ->> 'code', ', ' order by n) filter (where n <= 4) || case when count(*) > 4 then '…' else '' end
      into v_s
      from jsonb_array_elements(v_rare) with ordinality as x(e, n);
    v_ins := v_ins || jsonb_build_object('id', 'pouco-provadas', 'tone', 'stone', 'icon', 'olhoOff', 'group', 'provas', 'ref', 'card-pouco-provadas',
      'html', '<b>' || public.plural_pt(jsonb_array_length(v_rare), 'peça', 'peças') || '</b> quase nunca são sequer provadas.',
      'why', v_s || ' — pouca prova costuma indicar exposição ruim, foto fraca ou posição desfavorável na loja, não falta de demanda.'
             || ' Antes de baixar do acervo, vale testar reposicionamento.');
  end if;
  -- 10. conversão de prova do período
  if v_conv is not null then
    v_ins := v_ins || jsonb_build_object('id', 'taxa-prova', 'tone', case when v_conv >= 0.5 then 'green' else 'amber' end, 'icon', 'prova',
      'group', 'provas', 'ref', 'card-funil',
      'html', '<b>' || public.pct_pt(v_conv) || '</b> das provas encerradas no período viraram reserva.',
      'why', (v_funnel ->> 'converted') || ' conversões em ' || (v_funnel ->> 'closed') || ' provas encerradas.'
             || ' Cada ponto dessa taxa vale mais que um ponto de tráfego: a cliente já está na loja e já vestiu a peça.');
  end if;
  -- 11. categoria de maior ticket
  v_x := v_ticket -> 0;
  if v_x is not null then
    v_ins := v_ins || jsonb_build_object('id', 'ticket-categoria', 'tone', 'stone', 'icon', 'tag', 'group', 'negocio', 'ref', 'card-ticket-categoria',
      'html', 'Maior valor médio por locação: <b>' || (v_x ->> 'category') || '</b>, a ' || public.brl0((v_x ->> 'avgTicket')::numeric) || '.',
      'why', public.plural_pt((v_x ->> 'rentals')::int, 'locação', 'locações') || ' no período. Comparar com o ticket médio geral de '
             || public.brl0(v_avg) || ' ao decidir a próxima compra.');
  end if;

  return jsonb_build_object(
    'period', jsonb_build_object('days', p_days, 'from', v_from, 'to', v_today),
    'category', p_category,
    'idleAlertDays', v_idle,
    'kpis', jsonb_build_object(
      'rentals', v_n,
      'revenue', v_revenue,
      'avgTicket', v_avg,
      'activeCustomers', (v_cust ->> 'active')::int,
      'totalCustomers', (v_cust ->> 'total')::int,
      'recurrenceRate', case when (v_cust ->> 'active')::int > 0 then (v_cust ->> 'recurrent')::float8 / (v_cust ->> 'active')::int else 0 end,
      'recurrentCount', (v_cust ->> 'recurrent')::int,
      'idleGarments', jsonb_array_length(v_idle_rows),
      'fittingConversion', v_conv,
      'closedFittings', (v_funnel ->> 'closed')::int
    ),
    'insights', v_ins,
    'monthly', v_monthly,
    'revenueByGarment', v_top,
    'revenueByGarmentBottom', v_bottom,
    'fittingFunnel', v_funnel,
    'customerRevenue', jsonb_build_object(
      'recurrent', (v_cust ->> 'recurrentSpent')::numeric, 'recurrentCount', (v_cust ->> 'recurrent')::int,
      'single', (v_cust ->> 'singleSpent')::numeric, 'singleCount', (v_cust ->> 'single')::int),
    'colors', v_colors,
    'sizes', v_sizes,
    'occupancyByCategory', v_occ,
    'fittingConversionByGarment', v_conv_g,
    'fittedNotRented', v_fnr,
    'rarelyFitted', v_rare,
    'pressureBySize', v_size_p,
    'pressureByCategory', v_cat_p,
    'topCustomers', v_cust -> 'top',
    'idleCapital', v_idle_rows,
    'paidBack', v_paid,
    'ticketByCategory', v_ticket
  );
end
$$;

-- Privilégios ---------------------------------------------------------------
revoke all on function public.brl0(numeric) from public, anon, authenticated;
revoke all on function public.plural_pt(bigint, text, text) from public, anon, authenticated;
revoke all on function public.pct_pt(float8) from public, anon, authenticated;
revoke all on function public.num1_pt(float8) from public, anon, authenticated;
revoke all on function public.dm_pt(date) from public, anon, authenticated;
revoke all on function public.relative_day_pt(date, date) from public, anon, authenticated;
revoke all on function public.month_abbr(date) from public, anon, authenticated;
revoke all on function public.next_birthday(date, date) from public, anon, authenticated;
revoke all on function public.garment_state_lower(public.garment_state) from public, anon, authenticated;
revoke all on function public.painel_alerts(date) from public, anon, authenticated;
revoke all on function public.intel_pressure(public.intel_garment[], text, int) from public, anon, authenticated;

revoke all on function public.dashboard_summary(text) from public, anon;
revoke all on function public.intel_report(int, text) from public, anon;

grant execute on function public.dashboard_summary(text) to authenticated;
grant execute on function public.intel_report(int, text) to authenticated;

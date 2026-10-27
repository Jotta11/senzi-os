-- =====================================================================
-- Senzi OS · Financeiro: categorias, contas a pagar (com recorrência), contas a
-- receber (parcelas das reservas + avulsos) e visão geral em regime de caixa.
--
-- Regras e códigos de erro = fonte em memória (src/data/mock/financeiro*.ts e
-- src/domain/finance.ts). A base (fin_category, receivable) nasceu com as Reservas
-- (20261027000400_reservas.sql); aqui entram payable, as RPCs e a compra da peça.
--
--   · Parcelas de reserva NÃO ficam guardadas: fin_receivable_rows() as deriva de
--     reservation_payment (sinal, saldo, integral, caução = custódia, multa) e junta
--     os avulsos de `receivable`. O id da parcela é o id do pagamento da reserva.
--   · Contas a pagar: manuais (editáveis enquanto abertas) e automáticas
--     (`aquisicao` — compra da peça em create_garment; `operacao` — custos da
--     Operação, área 5, por payable_insert_auto), sempre pagas e somente leitura.
--     Pagar uma ocorrência recorrente cria a próxima (mesma família, até o fim).
--
-- Permissões (catálogo de 20261023000100_acesso.sql):
--   visão geral                                  → financeiro.view
--     · pago, custo, margem, aquisição, resultados e `monthly.paid` saem null
--       sem financeiro.consolidated
--   contas a receber, categorias e escritas      → financeiro.geral
--   lista de contas a pagar                      → financeiro.geral ou financeiro.consolidated
--     (a visão geral conta as contas pagas do período com financeiro.consolidated)
-- O atendimento (financeiro.view + financeiro.payment) vê a visão geral sem os
-- consolidados e lança pagamentos na reserva; o resto é SEM_PERMISSAO.
-- =====================================================================

-- Tipos ----------------------------------------------------------------
create type public.payable_status as enum ('aberta', 'paga', 'cancelada');
create type public.payable_recurrence as enum ('nenhuma', 'semanal', 'mensal', 'anual');
create type public.payable_source as enum ('manual', 'operacao', 'aquisicao');

-- Contas a pagar -------------------------------------------------------------
create table public.payable (
  id uuid primary key default gen_random_uuid(),
  description text not null check (btrim(description) <> ''),
  supplier text,
  category_id uuid not null references public.fin_category (id),
  amount numeric(12, 2) not null check (amount > 0),
  due_date date not null,
  status public.payable_status not null default 'aberta',
  paid_at timestamptz,
  -- Valor efetivamente pago (juros/desconto).
  paid_amount numeric(12, 2) check (paid_amount > 0),
  method public.payment_method,
  recurrence public.payable_recurrence not null default 'nenhuma',
  recurrence_end date,
  -- Raiz da família recorrente (a 1ª ocorrência). Sem FK de propósito: excluir a raiz manual não
  -- apaga nem desliga as ocorrências seguintes (como a fonte em memória).
  recurrence_parent_id uuid,
  source public.payable_source not null default 'manual',
  garment_id uuid references public.garment (id),
  -- Ordem da Operação: a área 5 cria a tabela e acrescenta a FK.
  maintenance_id uuid,
  reservation_id uuid references public.reservation (id),
  notes text,
  created_by uuid references public.app_user (id),
  created_at timestamptz not null default clock_timestamp(),
  check ((status = 'paga') = (paid_at is not null and paid_amount is not null))
);

create index payable_category_idx on public.payable (category_id);
create index payable_due_idx on public.payable (due_date);
create index payable_family_idx on public.payable (recurrence_parent_id);
create index payable_garment_idx on public.payable (garment_id);
create index payable_maintenance_idx on public.payable (maintenance_id);
create index payable_reservation_idx on public.payable (reservation_id);
create index payable_created_by_idx on public.payable (created_by);

create trigger payable_audit after insert or update or delete on public.payable
for each row execute function public.audit_trigger();

alter table public.payable enable row level security;
revoke all on table public.payable from public, anon, authenticated, service_role;
grant select on table public.payable to service_role;

-- =====================================================================
-- Funções internas (sem execute para a API)
-- =====================================================================

-- Rótulo da forma de pagamento (PAYMENT_METHOD de src/data/labels-ops.ts).
create function public.payment_method_label(p text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p
    when 'pix' then 'PIX'
    when 'credito' then 'Cartão de crédito'
    when 'debito' then 'Cartão de débito'
    when 'dinheiro' then 'Dinheiro'
    when 'link' then 'Link de pagamento'
    when 'transferencia' then 'Transferência'
    when 'outro' then 'Outros'
  end
$$;

-- Dia de um instante no fuso da loja.
create function public.store_day(p timestamptz)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select (p at time zone 'America/Araguaina')::date
$$;

-- Baixa numa data: o dia informado com a hora atual da loja (`at(data, storeTime())` da fonte em memória).
create function public.fin_settle_at(p_date date)
returns timestamptz
language sql
stable
set search_path = public, pg_temp
as $$
  select public.store_at(p_date, date_trunc('minute', (now() at time zone 'America/Araguaina')::time)::time)
$$;

-- Período do filtro (inWindow de financeiro-shared.ts): em aberto só tem limite inferior; quitada, a baixa
-- dentro de [hoje − dias + 1, hoje]. `tudo` não filtra.
create function public.fin_in_window(p_day date, p_settled boolean, p_range text, p_today date)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_range = 'tudo' then true
    when p_settled then p_day between p_today - (p_range::int - 1) and p_today
    else p_day >= p_today - (p_range::int - 1)
  end
$$;

-- Próximo vencimento (nextRecurrence de src/domain/finance.ts): mensal/anual preservam o dia e caem no último
-- dia do mês quando ele não existe; `p_anchor` (dia da 1ª ocorrência) devolve o dia 31 em março.
create function public.fin_next_recurrence(p_due date, p_rec public.payable_recurrence, p_anchor int)
returns date
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_first date;
  v_days int;
  v_day int := greatest(coalesce(p_anchor, 0), extract(day from p_due)::int);
begin
  if p_rec = 'nenhuma' then
    return null;
  end if;
  if p_rec = 'semanal' then
    return p_due + 7;
  end if;
  v_first := (date_trunc('month', p_due) + case when p_rec = 'anual' then interval '1 year' else interval '1 month' end)::date;
  v_days := extract(day from (v_first + interval '1 month' - interval '1 day'))::int;
  return v_first + (least(v_day, v_days) - 1);
end
$$;

-- Lançamento financeiro (commonIssues de financeiro-shared.ts / finEntryIssues de src/data/validation.ts):
-- levanta o primeiro problema na mesma ordem — descrição, categoria (do tipo, não arquivada), valor > 0, vencimento.
create function public.fin_entry_check(p_description text, p_category uuid, p_type public.fin_category_type, p_amount numeric, p_due date)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(btrim(p_description), '') = '' then
    raise exception 'DESCRICAO_OBRIGATORIA' using detail = 'description';
  end if;
  if not exists (select 1 from public.fin_category c where c.id = p_category and c.type = p_type and not c.archived) then
    raise exception 'CATEGORIA_OBRIGATORIA' using detail = 'categoryId';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'amount';
  end if;
  if p_due is null then
    raise exception 'VENCIMENTO_OBRIGATORIO' using detail = 'dueDate';
  end if;
end
$$;

-- Data de baixa (settleDateIssue): obrigatória e não futura.
create function public.fin_settle_check(p_date date, p_field text)
returns void
language plpgsql
stable
set search_path = public, pg_temp
as $$
begin
  if p_date is null then
    raise exception 'DATA_OBRIGATORIA' using detail = p_field;
  end if;
  if p_date > public.store_today() then
    raise exception 'DATA_FUTURA' using detail = p_field;
  end if;
end
$$;

-- Número de um jsonb para valores de dinheiro: não-número → null (a regra decide o erro).
create function public.jmoney(p jsonb, k text)
returns numeric
language sql
immutable
set search_path = public, pg_temp
as $$
  select case when jsonb_typeof(p -> k) = 'number' then (p ->> k)::numeric end
$$;

-- Forma de pagamento válida (senão PARAMETRO_INVALIDO no campo `method`).
create function public.payment_method_of(p text)
returns public.payment_method
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  perform public.jenum_check(coalesce(p, '') in ('pix', 'credito', 'debito', 'dinheiro', 'link', 'transferencia', 'outro'), 'method');
  return p::public.payment_method;
end
$$;

-- Categoria → FinCategory.
create function public.fin_category_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', c.id, 'name', c.name, 'type', c.type, 'color', c.color,
    'isSystem', c.is_system, 'systemKey', c.system_key, 'archived', c.archived
  )
  from public.fin_category c
  where c.id = p_id
$$;

-- Lançamentos de uma categoria: contas a pagar + avulsos + (na `locacao`) as parcelas das reservas.
create function public.fin_category_usage(p_id uuid)
returns int
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select ((select count(*) from public.payable p where p.category_id = p_id)
        + (select count(*) from public.receivable r where r.category_id = p_id)
        + case when (select c.system_key from public.fin_category c where c.id = p_id) = 'locacao'
            then (select count(*) from public.reservation_payment p join public.reservation r on r.id = p.reservation_id
                   where r.state <> 'rascunho' and p.kind <> 'estorno')
            else 0 end)::int
$$;

-- Nome já usado por outra categoria do mesmo tipo (sem acento/caixa/espaços nas pontas).
create function public.fin_category_duplicated(p_name text, p_type public.fin_category_type, p_ignore uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.fin_category c
     where c.id is distinct from p_ignore and c.type = p_type
       and btrim(public.norm(c.name)) = btrim(public.norm(p_name))
  )
$$;

-- Categoria livre para mexer: NAO_ENCONTRADO / CATEGORIA_SISTEMA. Trava a linha.
create function public.fin_category_lock(p_id uuid)
returns public.fin_category
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.fin_category;
begin
  select * into c from public.fin_category where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if c.is_system then
    raise exception 'CATEGORIA_SISTEMA';
  end if;
  return c;
end
$$;

-- Conta a pagar → Payable.
create function public.payable_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', p.id,
    'description', p.description,
    'supplier', p.supplier,
    'categoryId', p.category_id,
    'amount', p.amount,
    'dueDate', p.due_date,
    'status', p.status,
    'paidAt', case when p.paid_at is not null then public.store_instant(p.paid_at) end,
    'paidAmount', p.paid_amount,
    'method', p.method,
    'recurrence', p.recurrence,
    'recurrenceEnd', p.recurrence_end,
    'recurrenceParentId', p.recurrence_parent_id,
    'source', p.source,
    'garmentId', p.garment_id,
    'maintenanceId', p.maintenance_id,
    'reservationId', p.reservation_id,
    'notes', p.notes,
    'createdBy', coalesce(p.created_by::text, ''),
    'createdAt', public.store_instant(p.created_at)
  )
  from public.payable p
  where p.id = p_id
$$;

-- Ao pagar uma ocorrência recorrente nasce a próxima (mesma descrição, valor e categoria), até a data final;
-- não duplica (spawnNext de financeiro-pagar.ts).
create function public.payable_spawn_next(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  p public.payable;
  v_root uuid;
  v_anchor int;
  v_next date;
begin
  select * into p from public.payable where id = p_id;
  if p.recurrence = 'nenhuma' then
    return;
  end if;
  v_root := coalesce(p.recurrence_parent_id, p.id);
  perform pg_advisory_xact_lock(hashtext('public.payable.family:' || v_root::text));
  select extract(day from x.due_date)::int into v_anchor from public.payable x where x.id = v_root;
  v_next := public.fin_next_recurrence(p.due_date, p.recurrence, coalesce(v_anchor, extract(day from p.due_date)::int));
  if v_next is null or (p.recurrence_end is not null and v_next > p.recurrence_end) then
    return;
  end if;
  if exists (select 1 from public.payable x
              where (x.id = v_root or x.recurrence_parent_id = v_root) and x.due_date = v_next and x.status <> 'cancelada') then
    return;
  end if;
  insert into public.payable (description, supplier, category_id, amount, due_date, recurrence, recurrence_end,
                              recurrence_parent_id, source, garment_id, maintenance_id, reservation_id, notes, created_by)
  values (p.description, p.supplier, p.category_id, p.amount, v_next, p.recurrence, p.recurrence_end,
          v_root, p.source, p.garment_id, p.maintenance_id, p.reservation_id, p.notes, public.current_app_user_id());
end
$$;

-- Despesa automática (nasce paga, somente leitura): compra da peça (`aquisicao`, categoria de sistema
-- `aquisicao`) e custos da Operação (`operacao`, categorias `higienizacao` / `ajuste` / `manutencao` — área 5,
-- como addOperationExpense da fonte em memória). Valor ≤ 0 não lança nada (devolve null). → id da conta
create function public.payable_insert_auto(
  p_source public.payable_source,
  p_category_key text,
  p_description text,
  p_supplier text,
  p_amount numeric,
  p_garment uuid,
  p_maintenance uuid default null,
  p_reservation uuid default null,
  p_method public.payment_method default null,
  p_paid_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cat uuid;
  v_id uuid;
begin
  if p_source = 'manual' then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'source';
  end if;
  select c.id into v_cat from public.fin_category c where c.system_key = p_category_key and c.type = 'despesa';
  if v_cat is null then
    raise exception 'PARAMETRO_INVALIDO' using detail = 'categoryId';
  end if;
  if coalesce(p_amount, 0) <= 0 then
    return null;
  end if;
  insert into public.payable (description, supplier, category_id, amount, due_date, status, paid_at, paid_amount, method,
                              source, garment_id, maintenance_id, reservation_id, created_by, created_at)
  values (p_description, p_supplier, v_cat, round(p_amount, 2), public.store_day(p_paid_at), 'paga', p_paid_at, round(p_amount, 2),
          p_method, p_source, p_garment, p_maintenance, p_reservation, public.current_app_user_id(), p_paid_at)
  returning id into v_id;
  return v_id;
end
$$;

-- Contas a receber unificadas (allReceivables de src/domain/finance.ts): parcelas das reservas fora de
-- rascunho (estorno não é parcela) + avulsos. `j` = Receivable; as demais colunas servem aos filtros.
-- `p_id` restringe a uma linha. Ordem de desempate: parcelas (reserva mais antiga, ordem do lançamento) e avulsos.
create function public.fin_receivable_rows(p_id uuid default null)
returns table (id uuid, source text, kind text, category_id uuid, reservation_id uuid, amount numeric, paid_amount numeric,
               due_date date, status text, received_at timestamptz, is_custody boolean, search text, ord1 timestamptz, ord2 bigint, j jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with parcel as (
    select p.id, p.kind::text as kind, r.id as reservation_id, r.code, r.customer_id, cu.full_name as customer_name,
           case p.kind when 'sinal' then 'Sinal' when 'saldo' then 'Saldo' when 'integral' then 'Integral'
                       when 'caucao' then 'Caução' else 'Multa por atraso' end || ' · ' || r.code as description,
           case when p.kind = 'caucao' then null else (select c.id from public.fin_category c where c.system_key = 'locacao') end as category_id,
           p.amount,
           case when p.state = 'pago' then p.amount else 0 end as paid_amount,
           case when p.state = 'pago' then public.store_day(coalesce(p.paid_at, p.created_at)) else coalesce(p.due_at, r.pickup_date) end as due_date,
           case when p.state in ('cancelado', 'estornado') or (p.state = 'pendente' and r.state = any (public.reservation_states('no_receivable'))) then 'cancelado'
                when p.state = 'pago' then 'pago' else 'aberto' end as status,
           case when p.state = 'pago' then p.paid_at end as received_at,
           case when p.state = 'pago' then p.method::text end as method,
           p.kind = 'caucao' as is_custody,
           p.notes, r.created_at as ord1, p.seq as ord2
      from public.reservation_payment p
      join public.reservation r on r.id = p.reservation_id
      left join public.customer cu on cu.id = r.customer_id
     where r.state <> 'rascunho' and p.kind <> 'estorno'
       and (p_id is null or p.id = p_id)
  ),
  loose as (
    select a.id, a.description, a.category_id, a.reservation_id, r.code, a.customer_id, cu.full_name as customer_name, a.payer_name,
           a.amount, a.paid_amount, a.due_date, a.status::text as status, a.received_at, a.method::text as method, a.notes, a.created_at
      from public.receivable a
      left join public.reservation r on r.id = a.reservation_id
      left join public.customer cu on cu.id = a.customer_id
     where p_id is null or a.id = p_id
  )
  select x.id, 'reserva', x.kind, x.category_id, x.reservation_id, x.amount, x.paid_amount, x.due_date, x.status, x.received_at, x.is_custody,
         public.norm(concat_ws(' ', x.description, x.customer_name, x.code)), x.ord1, x.ord2,
         jsonb_build_object(
           'id', x.id, 'source', 'reserva', 'kind', x.kind, 'description', x.description, 'categoryId', x.category_id,
           'reservationId', x.reservation_id, 'reservationCode', x.code, 'customerId', x.customer_id, 'customerName', x.customer_name,
           'payerName', null, 'amount', x.amount, 'paidAmount', x.paid_amount, 'dueDate', x.due_date, 'status', x.status,
           'receivedAt', case when x.received_at is not null then public.store_instant(x.received_at) end,
           'method', x.method, 'isCustody', x.is_custody, 'notes', x.notes
         )
    from parcel x
  union all
  select a.id, 'avulso', 'avulso', a.category_id, a.reservation_id, a.amount, a.paid_amount, a.due_date, a.status, a.received_at, false,
         public.norm(concat_ws(' ', a.description, a.customer_name, a.payer_name, a.code)), a.created_at, null,
         jsonb_build_object(
           'id', a.id, 'source', 'avulso', 'kind', 'avulso', 'description', a.description, 'categoryId', a.category_id,
           'reservationId', a.reservation_id, 'reservationCode', a.code, 'customerId', a.customer_id, 'customerName', a.customer_name,
           'payerName', a.payer_name, 'amount', a.amount, 'paidAmount', a.paid_amount, 'dueDate', a.due_date, 'status', a.status,
           'receivedAt', case when a.received_at is not null then public.store_instant(a.received_at) end,
           'method', a.method, 'isCustody', false, 'notes', a.notes
         )
    from loose a
$$;

-- Avulso para mexer (trava a linha). Parcela de reserva → ESTADO_INVALIDO (use o pagamento da reserva);
-- inexistente → NAO_ENCONTRADO; fora de aberto/parcial → ESTADO_INVALIDO.
create function public.receivable_lock_open(p_id uuid)
returns public.receivable
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.receivable;
begin
  select * into a from public.receivable where id = p_id for update;
  if not found then
    if exists (select 1 from public.fin_receivable_rows(p_id)) then
      raise exception 'ESTADO_INVALIDO';
    end if;
    raise exception 'NAO_ENCONTRADO';
  end if;
  if a.status not in ('aberto', 'parcial') then
    raise exception 'ESTADO_INVALIDO';
  end if;
  return a;
end
$$;

create function public.receivable_json(p_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.j from public.fin_receivable_rows(p_id) x
$$;

-- Entradas de receita (receipts de src/domain/finance.ts): pagamentos de reserva sinal/saldo/integral/multa,
-- estornos de receita (negativos; o da caução não entra) e avulsos com algo recebido. Caução nunca é receita.
create function public.fin_receipts()
returns table (day date, method text, amount numeric, counted boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.store_day(p.paid_at), p.method::text,
         case when p.kind = 'estorno' then -p.amount else p.amount end,
         p.kind <> 'estorno'
    from public.reservation_payment p
   where p.state = 'pago' and p.paid_at is not null
     and (p.kind in ('sinal', 'saldo', 'integral', 'multa') or (p.kind = 'estorno' and p.refers_to is null))
  union all
  select public.store_day(a.received_at), a.method::text, a.paid_amount, true
    from public.receivable a
   where a.paid_amount > 0 and a.method is not null and a.received_at is not null
$$;

-- Contas a receber em aberto (sem caução) e quanto falta de cada uma; `kind` = origem (reserva | avulso).
-- Σ das parcelas de reserva = "a receber" das reservas (= Σ reservation_open_due, por construção).
create function public.fin_open_receivables()
returns table (reservation_id uuid, kind text, falta numeric)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select x.reservation_id, x.source, greatest(0, round(x.amount - x.paid_amount, 2))
    from public.fin_receivable_rows() x
   where not x.is_custody and x.status in ('aberto', 'parcial')
$$;

-- Filtro de lista: período válido.
create function public.fin_range_check(p_range text, p_all boolean)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  perform public.jenum_check(coalesce(p_range, '') in ('30', '90', '365') or (p_all and p_range = 'tudo'), 'range');
end
$$;

-- =====================================================================
-- Compra da peça: create_garment com custo > 0 lança a conta paga "Compra da peça — <nome>"
-- (aquisicao, fornecedor "Aquisição de acervo"), como createGarment da fonte em memória.
-- Sem acervo.cost o custo é ignorado (garment_apply) e nada é lançado.
-- =====================================================================
create or replace function public.create_garment(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_code text;
  v_cat uuid;
  v_cost numeric;
  v_name text;
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

  select g.acquisition_cost, g.name into v_cost, v_name from public.garment g where g.id = v_id;
  if coalesce(v_cost, 0) > 0 then
    perform public.payable_insert_auto('aquisicao', 'aquisicao', 'Compra da peça — ' || v_name, 'Aquisição de acervo', v_cost, v_id);
  end if;

  return public.garment_json(v_id);
end
$$;

-- =====================================================================
-- Visão geral
-- =====================================================================

-- financeOverview de src/domain/finance.ts (`p_range` = '30' | '90' | '365'). → FinanceOverview
create function public.finance_overview(p_range text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_from date;
  v_cons boolean;
  v_received numeric;
  v_count int;
  v_paid numeric;
  v_operating numeric;
  v_acq numeric;
  v_to_res numeric;
  v_to_loose numeric;
  v_custody numeric;
  v_monthly jsonb;
  v_methods jsonb;
  v_rows jsonb;
  v_pending jsonb;
  v_latest jsonb;
begin
  perform public.require_perm('financeiro.view');
  perform public.fin_range_check(p_range, false);
  v_cons := public.has_perm('financeiro.consolidated');
  v_from := v_today - (p_range::int - 1);

  select round(coalesce(sum(x.amount), 0), 2), count(*) filter (where x.counted)
    into v_received, v_count
    from public.fin_receipts() x where x.day between v_from and v_today;

  select round(coalesce(sum(coalesce(p.paid_amount, p.amount)), 0), 2),
         round(coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (where c.system_key in ('higienizacao', 'ajuste', 'manutencao')), 0), 2),
         round(coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (where c.system_key = 'aquisicao'), 0), 2)
    into v_paid, v_operating, v_acq
    from public.payable p
    join public.fin_category c on c.id = p.category_id
   where p.status = 'paga' and public.store_day(p.paid_at) between v_from and v_today;

  select round(coalesce(sum(o.falta) filter (where o.kind = 'reserva'), 0), 2),
         round(coalesce(sum(o.falta) filter (where o.kind = 'avulso'), 0), 2)
    into v_to_res, v_to_loose
    from public.fin_open_receivables() o;

  -- 12 meses (o atual até hoje).
  select jsonb_agg(jsonb_build_object(
           'k', to_char(m.start, 'YYYY-MM'),
           'v', (select round(coalesce(sum(x.amount), 0), 2) from public.fin_receipts() x where x.day between m.start and m.finish),
           'paid', case when v_cons then (
             select round(coalesce(sum(coalesce(p.paid_amount, p.amount)), 0), 2) from public.payable p
              where p.status = 'paga' and public.store_day(p.paid_at) between m.start and m.finish) end
         ) order by m.start)
    into v_monthly
    from (
      select s.start, case when s.i = 11 then v_today else (s.start + interval '1 month' - interval '1 day')::date end as finish
        from (select i, (date_trunc('month', v_today) - make_interval(months => 11 - i))::date as start from generate_series(0, 11) i) s
    ) m;

  select coalesce(jsonb_agg(jsonb_build_object('method', t.method, 'label', public.payment_method_label(t.method), 'total', t.total, 'count', t.n)
                            order by t.total desc, t.enum_pos), '[]'::jsonb)
    into v_methods
    from (
      select x.method, round(sum(x.amount), 2) as total, count(*) filter (where x.amount > 0)::int as n,
             array_position(enum_range(null::public.payment_method)::text[], x.method) as enum_pos
        from public.fin_receipts() x
       where x.day between v_from and v_today
       group by x.method
    ) t
   where t.total > 0;

  -- Uma linha por reserva com parcela em aberto; "Falta" = Σ dessas parcelas.
  select coalesce(jsonb_agg(jsonb_build_object(
           'reservationId', r.id, 'code', r.code, 'customerName', coalesce(cu.full_name, '—'), 'pickupDate', r.pickup_date,
           'devido', round(r.total_net + r.late_fee, 2), 'due', d.due
         ) order by r.pickup_date, r.created_at, r.code), '[]'::jsonb)
    into v_rows
    from (select o.reservation_id, round(sum(o.falta), 2) as due from public.fin_open_receivables() o where o.kind = 'reserva' group by o.reservation_id) d
    join public.reservation r on r.id = d.reservation_id
    left join public.customer cu on cu.id = r.customer_id
   where d.due > 0;

  -- Cobranças lançadas e pendentes que a "Falta" das linhas não cobre (caução pendente, custódia).
  select coalesce(jsonb_agg(jsonb_build_object('kind', p.kind, 'customerName', coalesce(cu.full_name, '—'), 'notes', p.notes, 'amount', p.amount)
                            order by r.pickup_date, r.created_at, p.seq), '[]'::jsonb)
    into v_pending
    from public.reservation_payment p
    join public.reservation r on r.id = p.reservation_id
    left join public.customer cu on cu.id = r.customer_id
   where not (r.state = any (public.reservation_states('no_receivable')))
     and p.state = 'pendente' and p.kind <> 'estorno'
     and (p.kind = 'caucao' or not exists (
       select 1 from public.fin_open_receivables() o where o.kind = 'reserva' and o.reservation_id = r.id and o.falta > 0));

  select coalesce(jsonb_agg(jsonb_build_object(
           'paidAt', public.store_instant(t.paid_at), 'reservationId', t.rid, 'code', t.code, 'customerName', coalesce(t.full_name, '—'),
           'kind', t.kind, 'method', t.method, 'amount', t.amount
         ) order by t.paid_at desc, t.seq desc), '[]'::jsonb)
    into v_latest
    from (
      select p.paid_at, p.seq, r.id as rid, r.code, cu.full_name, p.kind, p.method,
             case when p.kind = 'estorno' then -p.amount else p.amount end as amount
        from public.reservation_payment p
        join public.reservation r on r.id = p.reservation_id
        left join public.customer cu on cu.id = r.customer_id
       where p.state = 'pago' and p.paid_at is not null and public.store_day(p.paid_at) between v_from and v_today
       order by p.paid_at desc, p.seq desc
       limit 30
    ) t;

  select round(coalesce(sum(m.caucao), 0), 2) into v_custody
    from public.reservation r cross join lateral public.reservation_money(r.id) m
   where r.state <> 'rascunho';

  return jsonb_build_object(
    'range', p_range,
    'from', v_from,
    'to', v_today,
    'received', v_received,
    'receivedCount', v_count,
    'toReceive', round(v_to_res + v_to_loose, 2),
    'toReceiveReservations', v_to_res,
    'paid', case when v_cons then v_paid end,
    'operatingCost', case when v_cons then v_operating end,
    'operatingMargin', case when v_cons and v_received > 0 then (1 - v_operating / v_received)::float8 end,
    'acquisitionInvested', case when v_cons then v_acq end,
    'result', case when v_cons then round(v_received - v_paid, 2) end,
    'operatingResult', case when v_cons then round(v_received - (v_paid - v_acq), 2) end,
    'custody', v_custody,
    'monthly', v_monthly,
    'byMethod', v_methods,
    'receivableRows', v_rows,
    'pendingCharges', v_pending,
    'latest', v_latest
  );
end
$$;

-- =====================================================================
-- Contas a receber
-- =====================================================================

-- ReceivableFilter → {rows, total, totals, today}. Abertas/vencidas ignoram o período; recebidas e todas
-- filtram pela data do recebimento (quitadas) ou do vencimento. Ordem: recebidas pelo recebimento (mais
-- recente antes), todas pelo vencimento (mais recente antes), as demais pelo vencimento (mais antigo antes).
create function public.list_receivables(p_filter jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_status text := public.jtext(p_filter, 'status');
  v_origin text := public.jtext(p_filter, 'origin');
  v_range text := public.jtext(p_filter, 'range');
  v_cat_text text := nullif(public.jtext(p_filter, 'categoryId'), '');
  v_cat uuid;
  v_q text := btrim(public.norm(public.jtext(p_filter, 'q')));
  v_rows jsonb;
  v_total int;
  v_totals jsonb;
begin
  perform public.require_perm('financeiro.geral');
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  perform public.jenum_check(coalesce(v_status, '') in ('abertas', 'vencidas', 'recebidas', 'todas'), 'status');
  perform public.jenum_check(coalesce(v_origin, '') in ('todas', 'reservas', 'avulsas'), 'origin');
  perform public.fin_range_check(v_range, true);
  v_cat := public.try_uuid(v_cat_text);
  perform public.jenum_check(v_cat_text is null or v_cat is not null, 'categoryId');

  with hits as (
    select x.*
      from public.fin_receivable_rows() x
     where case v_status
             when 'abertas' then not x.is_custody and x.status in ('aberto', 'parcial')
             when 'vencidas' then not x.is_custody and x.status in ('aberto', 'parcial') and x.due_date < v_today
             when 'recebidas' then x.status = 'pago'
             else true
           end
       and (v_origin = 'todas' or (v_origin = 'reservas') = (x.source = 'reserva'))
       and (v_cat is null or x.category_id = v_cat)
       and (v_status not in ('recebidas', 'todas')
            or public.fin_in_window(coalesce(public.store_day(x.received_at), x.due_date), x.status = 'pago', v_range, v_today))
       and (v_q = '' or strpos(x.search, v_q) > 0)
  )
  select count(*)::int,
         coalesce(jsonb_agg(h.j order by
           case when v_status = 'recebidas' then h.received_at end desc nulls last,
           case when v_status = 'todas' then h.due_date end desc,
           case when v_status in ('abertas', 'vencidas') then h.due_date end,
           h.source = 'avulso', h.ord1, h.ord2, h.id), '[]'::jsonb)
    into v_total, v_rows
    from hits h;

  select jsonb_build_object(
           'open', round(coalesce(sum(greatest(0, x.amount - x.paid_amount)) filter (where x.status in ('aberto', 'parcial')), 0), 2),
           'overdue', round(coalesce(sum(greatest(0, x.amount - x.paid_amount)) filter (where x.status in ('aberto', 'parcial') and x.due_date < v_today), 0), 2),
           'dueIn7', round(coalesce(sum(greatest(0, x.amount - x.paid_amount)) filter (
             where x.status in ('aberto', 'parcial') and x.due_date between v_today and v_today + 7), 0), 2),
           'receivedInRange', round(coalesce(sum(x.paid_amount) filter (
             where x.paid_amount > 0 and x.status <> 'cancelado'
               and public.fin_in_window(coalesce(public.store_day(x.received_at), x.due_date), true, v_range, v_today)), 0), 2)
         )
    into v_totals
    from public.fin_receivable_rows() x
   where not x.is_custody;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'totals', v_totals, 'today', v_today);
end
$$;

-- ReceivableInput → Receivable (avulso; "já recebido" nasce pago na data/forma informadas).
create function public.create_receivable(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_received boolean;
  v_amount numeric := public.jmoney(p, 'amount');
  v_at date;
  v_cust_text text;
  v_cust uuid;
  v_id uuid;
begin
  perform public.require_perm('financeiro.geral');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_received := case when jsonb_typeof(p -> 'received') = 'boolean' then (p ->> 'received')::boolean else false end;
  perform public.fin_entry_check(public.jtext(p, 'description'), public.try_uuid(public.jtext(p, 'categoryId')), 'receita', v_amount,
                                 public.try_iso_date(public.jtext(p, 'dueDate')));
  if v_received then
    v_at := public.try_iso_date(public.jtext(p, 'receivedAt'));
    perform public.fin_settle_check(v_at, 'receivedAt');
  end if;
  v_cust_text := nullif(public.jtext(p, 'customerId'), '');
  if v_cust_text is not null then
    select c.id into v_cust from public.customer c where c.id = public.try_uuid(v_cust_text);
    if v_cust is null then
      raise exception 'NAO_ENCONTRADO' using detail = 'customerId';
    end if;
  end if;

  insert into public.receivable (description, category_id, customer_id, payer_name, amount, paid_amount, due_date, status,
                                 received_at, method, notes, created_by)
  values (
    public.jtext(p, 'description'),
    public.try_uuid(public.jtext(p, 'categoryId')),
    v_cust,
    case when v_cust is null then nullif(public.jtext(p, 'payerName'), '') end,
    round(v_amount, 2),
    case when v_received then round(v_amount, 2) else 0 end,
    public.try_iso_date(public.jtext(p, 'dueDate')),
    case when v_received then 'pago' else 'aberto' end::public.receivable_status,
    case when v_received then public.fin_settle_at(v_at) end,
    case when v_received then public.payment_method_of(coalesce(public.jtext(p, 'method'), 'pix')) end,
    nullif(public.jtext(p, 'notes'), ''),
    public.current_app_user_id()
  )
  returning id into v_id;
  return public.receivable_json(v_id);
end
$$;

-- Edição parcial do avulso em aberto/parcial (só as chaves enviadas mudam). Valor abaixo do já recebido →
-- VALOR_INVALIDO; cobrindo o recebido vira pago. → Receivable
create function public.update_receivable(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.receivable;
  v_desc text;
  v_cat uuid;
  v_amount numeric;
  v_due date;
  v_cust uuid;
  v_cust_text text;
begin
  perform public.require_perm('financeiro.geral');
  a := public.receivable_lock_open(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_desc := case when p ? 'description' then public.jtext(p, 'description') else a.description end;
  v_cat := case when p ? 'categoryId' then public.try_uuid(public.jtext(p, 'categoryId')) else a.category_id end;
  v_amount := case when p ? 'amount' then public.jmoney(p, 'amount') else a.amount end;
  v_due := case when p ? 'dueDate' then public.try_iso_date(public.jtext(p, 'dueDate')) else a.due_date end;
  perform public.fin_entry_check(v_desc, v_cat, 'receita', v_amount, v_due);
  if v_amount < a.paid_amount then
    raise exception 'VALOR_INVALIDO' using detail = 'amount';
  end if;
  v_cust := a.customer_id;
  if p ? 'customerId' then
    v_cust_text := nullif(public.jtext(p, 'customerId'), '');
    v_cust := null;
    if v_cust_text is not null then
      select c.id into v_cust from public.customer c where c.id = public.try_uuid(v_cust_text);
      if v_cust is null then
        raise exception 'NAO_ENCONTRADO' using detail = 'customerId';
      end if;
    end if;
  end if;

  update public.receivable set
    description = v_desc,
    category_id = v_cat,
    amount = round(v_amount, 2),
    due_date = v_due,
    customer_id = v_cust,
    payer_name = case when p ? 'payerName' then nullif(public.jtext(p, 'payerName'), '') else payer_name end,
    notes = case when p ? 'notes' then nullif(public.jtext(p, 'notes'), '') else notes end,
    status = case when paid_amount >= round(v_amount, 2) - 0.005 then 'pago' else status end
  where id = a.id;
  return public.receivable_json(a.id);
end
$$;

-- Baixa (total ou parcial) do avulso: valor > 0 e até o que falta (HINT = quanto falta), data não futura. → Receivable
create function public.receive_receivable(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.receivable;
  v_amount numeric;
  v_falta numeric;
  v_at date;
  v_method public.payment_method;
begin
  perform public.require_perm('financeiro.geral');
  a := public.receivable_lock_open(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_amount := public.jmoney(p, 'amount');
  v_falta := greatest(0, round(a.amount - a.paid_amount, 2));
  v_at := public.try_iso_date(public.jtext(p, 'receivedAt'));
  if v_amount is null or v_amount <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'amount', hint = public.brl(v_falta);
  end if;
  if v_amount > v_falta + 0.005 then
    raise exception 'VALOR_EXCEDE_SALDO' using detail = 'amount', hint = public.brl(v_falta);
  end if;
  if v_at is null then
    raise exception 'DATA_OBRIGATORIA' using detail = 'receivedAt', hint = public.brl(v_falta);
  end if;
  if v_at > public.store_today() then
    raise exception 'DATA_FUTURA' using detail = 'receivedAt', hint = public.brl(v_falta);
  end if;
  v_method := public.payment_method_of(public.jtext(p, 'method'));

  update public.receivable set
    paid_amount = round(paid_amount + v_amount, 2),
    status = case when round(paid_amount + v_amount, 2) >= amount - 0.005 then 'pago' else 'parcial' end::public.receivable_status,
    received_at = public.fin_settle_at(v_at),
    method = v_method,
    notes = coalesce(nullif(public.jtext(p, 'notes'), ''), notes)
  where id = a.id;
  return public.receivable_json(a.id);
end
$$;

create function public.cancel_receivable(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.receivable;
begin
  perform public.require_perm('financeiro.geral');
  a := public.receivable_lock_open(p_id);
  update public.receivable set status = 'cancelado' where id = a.id;
  return public.receivable_json(a.id);
end
$$;

-- =====================================================================
-- Contas a pagar
-- =====================================================================

-- PayableFilter → {rows, total, totals, today}. Mesmas regras de período e ordem das contas a receber
-- (pagas pela data do pagamento). Com financeiro.geral ou financeiro.consolidated.
create function public.list_payables(p_filter jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_today date := public.store_today();
  v_status text := public.jtext(p_filter, 'status');
  v_rec text := public.jtext(p_filter, 'recurrence');
  v_range text := public.jtext(p_filter, 'range');
  v_cat_text text := nullif(public.jtext(p_filter, 'categoryId'), '');
  v_cat uuid;
  v_q text := btrim(public.norm(public.jtext(p_filter, 'q')));
  v_rows jsonb;
  v_total int;
  v_totals jsonb;
begin
  if not (public.has_perm('financeiro.geral') or public.has_perm('financeiro.consolidated')) then
    raise exception 'SEM_PERMISSAO';
  end if;
  if p_filter is null or jsonb_typeof(p_filter) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  perform public.jenum_check(coalesce(v_status, '') in ('abertas', 'vencidas', 'pagas', 'todas'), 'status');
  perform public.jenum_check(coalesce(v_rec, '') in ('todas', 'unica', 'recorrente'), 'recurrence');
  perform public.fin_range_check(v_range, true);
  v_cat := public.try_uuid(v_cat_text);
  perform public.jenum_check(v_cat_text is null or v_cat is not null, 'categoryId');

  with hits as (
    select p.*
      from public.payable p
     where case v_status
             when 'abertas' then p.status = 'aberta'
             when 'vencidas' then p.status = 'aberta' and p.due_date < v_today
             when 'pagas' then p.status = 'paga'
             else true
           end
       and (v_cat is null or p.category_id = v_cat)
       and (v_rec = 'todas' or (v_rec = 'recorrente') = (p.recurrence <> 'nenhuma'))
       and (v_status not in ('pagas', 'todas')
            or public.fin_in_window(coalesce(public.store_day(p.paid_at), p.due_date), p.status = 'paga', v_range, v_today))
       and (v_q = '' or strpos(public.norm(concat_ws(' ', p.description, p.supplier)), v_q) > 0)
  )
  select count(*)::int,
         coalesce(jsonb_agg(public.payable_json(h.id) order by
           case when v_status = 'pagas' then h.paid_at end desc nulls last,
           case when v_status = 'todas' then h.due_date end desc,
           case when v_status in ('abertas', 'vencidas') then h.due_date end,
           h.created_at, h.id), '[]'::jsonb)
    into v_total, v_rows
    from hits h;

  select jsonb_build_object(
           'open', round(coalesce(sum(p.amount) filter (where p.status = 'aberta'), 0), 2),
           'overdue', round(coalesce(sum(p.amount) filter (where p.status = 'aberta' and p.due_date < v_today), 0), 2),
           'dueIn7', round(coalesce(sum(p.amount) filter (where p.status = 'aberta' and p.due_date between v_today and v_today + 7), 0), 2),
           'paidInRange', round(coalesce(sum(coalesce(p.paid_amount, p.amount)) filter (
             where p.status = 'paga' and public.fin_in_window(coalesce(public.store_day(p.paid_at), p.due_date), true, v_range, v_today)), 0), 2)
         )
    into v_totals
    from public.payable p;

  return jsonb_build_object('rows', v_rows, 'total', v_total, 'totals', v_totals, 'today', v_today);
end
$$;

-- Recorrência: enum válido; data final (opcional) anterior ao vencimento → RECORRENCIA_FIM_INVALIDO.
create function public.payable_recurrence_check(p_rec text, p_end_text text, p_due date)
returns void
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  perform public.jenum_check(coalesce(p_rec, '') in ('nenhuma', 'semanal', 'mensal', 'anual'), 'recurrence');
  if p_rec <> 'nenhuma' and p_end_text is not null then
    if public.try_iso_date(p_end_text) is null then
      raise exception 'PARAMETRO_INVALIDO' using detail = 'recurrenceEnd';
    end if;
    if p_due is not null and public.try_iso_date(p_end_text) < p_due then
      raise exception 'RECORRENCIA_FIM_INVALIDO' using detail = 'recurrenceEnd';
    end if;
  end if;
end
$$;

-- PayableInput → Payable (manual; "já paga" nasce paga e gera a próxima ocorrência).
create function public.create_payable(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_paid boolean;
  v_amount numeric := public.jmoney(p, 'amount');
  v_due date;
  v_rec text;
  v_end text;
  v_at date;
  v_id uuid;
begin
  perform public.require_perm('financeiro.geral');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_paid := case when jsonb_typeof(p -> 'paid') = 'boolean' then (p ->> 'paid')::boolean else false end;
  v_due := public.try_iso_date(public.jtext(p, 'dueDate'));
  v_rec := coalesce(public.jtext(p, 'recurrence'), 'nenhuma');
  v_end := nullif(public.jtext(p, 'recurrenceEnd'), '');
  perform public.fin_entry_check(public.jtext(p, 'description'), public.try_uuid(public.jtext(p, 'categoryId')), 'despesa', v_amount, v_due);
  perform public.payable_recurrence_check(v_rec, v_end, v_due);
  if v_paid then
    v_at := public.try_iso_date(public.jtext(p, 'paidAt'));
    perform public.fin_settle_check(v_at, 'paidAt');
  end if;

  insert into public.payable (description, supplier, category_id, amount, due_date, status, paid_at, paid_amount, method,
                              recurrence, recurrence_end, notes, created_by)
  values (
    public.jtext(p, 'description'),
    nullif(public.jtext(p, 'supplier'), ''),
    public.try_uuid(public.jtext(p, 'categoryId')),
    round(v_amount, 2),
    v_due,
    case when v_paid then 'paga' else 'aberta' end::public.payable_status,
    case when v_paid then public.fin_settle_at(v_at) end,
    case when v_paid then round(v_amount, 2) end,
    case when v_paid then public.payment_method_of(coalesce(public.jtext(p, 'method'), 'pix')) end,
    v_rec::public.payable_recurrence,
    case when v_rec <> 'nenhuma' then public.try_iso_date(v_end) end,
    nullif(public.jtext(p, 'notes'), ''),
    public.current_app_user_id()
  )
  returning id into v_id;
  if v_paid then
    perform public.payable_spawn_next(v_id);
  end if;
  return public.payable_json(v_id);
end
$$;

-- Edição parcial da conta manual em aberto (automática ou já paga → ESTADO_INVALIDO). → Payable
create function public.update_payable(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x public.payable;
  v_desc text;
  v_cat uuid;
  v_amount numeric;
  v_due date;
  v_rec text;
  v_end text;
begin
  perform public.require_perm('financeiro.geral');
  select * into x from public.payable where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if x.source <> 'manual' or x.status <> 'aberta' then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_desc := case when p ? 'description' then public.jtext(p, 'description') else x.description end;
  v_cat := case when p ? 'categoryId' then public.try_uuid(public.jtext(p, 'categoryId')) else x.category_id end;
  v_amount := case when p ? 'amount' then public.jmoney(p, 'amount') else x.amount end;
  v_due := case when p ? 'dueDate' then public.try_iso_date(public.jtext(p, 'dueDate')) else x.due_date end;
  v_rec := case when p ? 'recurrence' then coalesce(public.jtext(p, 'recurrence'), 'nenhuma') else x.recurrence::text end;
  v_end := case when p ? 'recurrenceEnd' then nullif(public.jtext(p, 'recurrenceEnd'), '') else x.recurrence_end::text end;
  perform public.fin_entry_check(v_desc, v_cat, 'despesa', v_amount, v_due);
  perform public.payable_recurrence_check(v_rec, v_end, v_due);

  update public.payable set
    description = v_desc,
    supplier = case when p ? 'supplier' then nullif(public.jtext(p, 'supplier'), '') else supplier end,
    category_id = v_cat,
    amount = round(v_amount, 2),
    due_date = v_due,
    recurrence = v_rec::public.payable_recurrence,
    recurrence_end = case when v_rec <> 'nenhuma' then public.try_iso_date(v_end) end,
    notes = case when p ? 'notes' then nullif(public.jtext(p, 'notes'), '') else notes end
  where id = x.id;
  return public.payable_json(x.id);
end
$$;

-- Baixa integral (valor editável para juros/desconto; > 0), data não futura; gera a próxima ocorrência. → Payable
create function public.pay_payable(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x public.payable;
  v_amount numeric;
  v_at date;
begin
  perform public.require_perm('financeiro.geral');
  select * into x from public.payable where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if x.status <> 'aberta' then
    raise exception 'ESTADO_INVALIDO';
  end if;
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_amount := public.jmoney(p, 'paidAmount');
  if v_amount is null or v_amount <= 0 then
    raise exception 'VALOR_INVALIDO' using detail = 'paidAmount';
  end if;
  v_at := public.try_iso_date(public.jtext(p, 'paidAt'));
  perform public.fin_settle_check(v_at, 'paidAt');

  update public.payable set
    status = 'paga',
    paid_at = public.fin_settle_at(v_at),
    paid_amount = round(v_amount, 2),
    method = public.payment_method_of(public.jtext(p, 'method')),
    notes = coalesce(nullif(public.jtext(p, 'notes'), ''), notes)
  where id = x.id;
  perform public.payable_spawn_next(x.id);
  return public.payable_json(x.id);
end
$$;

-- Só conta manual (automática → ESTADO_INVALIDO).
create function public.delete_payable(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  x public.payable;
begin
  perform public.require_perm('financeiro.geral');
  select * into x from public.payable where id = p_id for update;
  if not found then
    raise exception 'NAO_ENCONTRADO';
  end if;
  if x.source <> 'manual' then
    raise exception 'ESTADO_INVALIDO';
  end if;
  delete from public.payable where id = x.id;
end
$$;

-- =====================================================================
-- Categorias
-- =====================================================================

-- Todas (inclusive arquivadas), na ordem do cadastro, com a contagem de lançamentos. → (FinCategory & {usageCount})[]
create function public.list_fin_categories()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_perm('financeiro.geral');
  return coalesce((
    select jsonb_agg(public.fin_category_json(c.id) || jsonb_build_object('usageCount', public.fin_category_usage(c.id))
                     order by c.sort_order, c.created_at, c.id)
      from public.fin_category c
  ), '[]'::jsonb);
end
$$;

-- FinCategoryInput → FinCategory. Nome único por tipo; cor padrão = paleta pela posição.
create function public.create_fin_category(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_name text := public.jtext(p, 'name');
  v_type text := public.jtext(p, 'type');
  v_color text := nullif(public.jtext(p, 'color'), '');
  v_n int;
  v_id uuid;
begin
  perform public.require_perm('financeiro.geral');
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  if coalesce(v_name, '') = '' then
    raise exception 'NOME_CATEGORIA_OBRIGATORIO' using detail = 'name';
  end if;
  perform public.jenum_check(coalesce(v_type, '') in ('receita', 'despesa'), 'type');
  perform public.jenum_check(v_color is null or v_color ~ '^#[0-9A-Fa-f]{6}$', 'color');
  perform pg_advisory_xact_lock(hashtext('public.fin_category.name'));
  if public.fin_category_duplicated(v_name, v_type::public.fin_category_type, null) then
    raise exception 'CATEGORIA_DUPLICADA' using detail = 'name';
  end if;
  select count(*)::int into v_n from public.fin_category;
  insert into public.fin_category (name, type, color, sort_order, created_by)
  values (
    v_name,
    v_type::public.fin_category_type,
    coalesce(v_color, (array['#7A2E3A', '#5E6B3C', '#1D4E63', '#B4633F', '#A98BC4', '#C9A961', '#3C3F46', '#C98A99'])[v_n % 8 + 1]),
    coalesce((select max(sort_order) from public.fin_category), 0) + 1,
    public.current_app_user_id()
  )
  returning id into v_id;
  return public.fin_category_json(v_id);
end
$$;

-- Edição parcial (nome, tipo, cor). Sistema → CATEGORIA_SISTEMA; mudar o tipo de categoria em uso → CATEGORIA_EM_USO.
create function public.update_fin_category(p_id uuid, p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.fin_category;
  v_name text;
  v_type text;
  v_color text;
begin
  perform public.require_perm('financeiro.geral');
  c := public.fin_category_lock(p_id);
  if p is null or jsonb_typeof(p) <> 'object' then
    raise exception 'PARAMETRO_INVALIDO';
  end if;
  v_name := coalesce(public.jtext(p, 'name'), c.name);
  v_type := coalesce(public.jtext(p, 'type'), c.type::text);
  v_color := coalesce(nullif(public.jtext(p, 'color'), ''), c.color);
  if v_name = '' then
    raise exception 'NOME_CATEGORIA_OBRIGATORIO' using detail = 'name';
  end if;
  perform public.jenum_check(v_type in ('receita', 'despesa'), 'type');
  perform public.jenum_check(v_color ~ '^#[0-9A-Fa-f]{6}$', 'color');
  if v_type <> c.type::text and public.fin_category_usage(c.id) > 0 then
    raise exception 'CATEGORIA_EM_USO' using detail = 'type';
  end if;
  perform pg_advisory_xact_lock(hashtext('public.fin_category.name'));
  if public.fin_category_duplicated(v_name, v_type::public.fin_category_type, c.id) then
    raise exception 'CATEGORIA_DUPLICADA' using detail = 'name';
  end if;
  update public.fin_category set name = v_name, type = v_type::public.fin_category_type, color = v_color where id = c.id;
  return public.fin_category_json(c.id);
end
$$;

-- Arquivar some das escolhas dos formulários (os lançamentos ficam). `p_archived` null = true.
create function public.archive_fin_category(p_id uuid, p_archived boolean)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.fin_category;
begin
  perform public.require_perm('financeiro.geral');
  c := public.fin_category_lock(p_id);
  update public.fin_category set archived = coalesce(p_archived, true) where id = c.id;
  return public.fin_category_json(c.id);
end
$$;

-- Só sem lançamentos (CATEGORIA_EM_USO).
create function public.delete_fin_category(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.fin_category;
begin
  perform public.require_perm('financeiro.geral');
  c := public.fin_category_lock(p_id);
  if public.fin_category_usage(c.id) > 0 then
    raise exception 'CATEGORIA_EM_USO';
  end if;
  delete from public.fin_category where id = c.id;
end
$$;

-- Privilégios ---------------------------------------------------------------
revoke all on function public.payment_method_label(text) from public, anon, authenticated;
revoke all on function public.store_day(timestamptz) from public, anon, authenticated;
revoke all on function public.fin_settle_at(date) from public, anon, authenticated;
revoke all on function public.fin_in_window(date, boolean, text, date) from public, anon, authenticated;
revoke all on function public.fin_next_recurrence(date, public.payable_recurrence, int) from public, anon, authenticated;
revoke all on function public.fin_entry_check(text, uuid, public.fin_category_type, numeric, date) from public, anon, authenticated;
revoke all on function public.fin_settle_check(date, text) from public, anon, authenticated;
revoke all on function public.jmoney(jsonb, text) from public, anon, authenticated;
revoke all on function public.payment_method_of(text) from public, anon, authenticated;
revoke all on function public.fin_category_json(uuid) from public, anon, authenticated;
revoke all on function public.fin_category_usage(uuid) from public, anon, authenticated;
revoke all on function public.fin_category_duplicated(text, public.fin_category_type, uuid) from public, anon, authenticated;
revoke all on function public.fin_category_lock(uuid) from public, anon, authenticated;
revoke all on function public.payable_json(uuid) from public, anon, authenticated;
revoke all on function public.payable_spawn_next(uuid) from public, anon, authenticated;
revoke all on function public.payable_insert_auto(public.payable_source, text, text, text, numeric, uuid, uuid, uuid, public.payment_method, timestamptz) from public, anon, authenticated;
revoke all on function public.fin_receivable_rows(uuid) from public, anon, authenticated;
revoke all on function public.receivable_lock_open(uuid) from public, anon, authenticated;
revoke all on function public.receivable_json(uuid) from public, anon, authenticated;
revoke all on function public.fin_receipts() from public, anon, authenticated;
revoke all on function public.fin_open_receivables() from public, anon, authenticated;
revoke all on function public.fin_range_check(text, boolean) from public, anon, authenticated;
revoke all on function public.payable_recurrence_check(text, text, date) from public, anon, authenticated;

revoke all on function public.finance_overview(text) from public, anon;
revoke all on function public.list_receivables(jsonb) from public, anon;
revoke all on function public.create_receivable(jsonb) from public, anon;
revoke all on function public.update_receivable(uuid, jsonb) from public, anon;
revoke all on function public.receive_receivable(uuid, jsonb) from public, anon;
revoke all on function public.cancel_receivable(uuid) from public, anon;
revoke all on function public.list_payables(jsonb) from public, anon;
revoke all on function public.create_payable(jsonb) from public, anon;
revoke all on function public.update_payable(uuid, jsonb) from public, anon;
revoke all on function public.pay_payable(uuid, jsonb) from public, anon;
revoke all on function public.delete_payable(uuid) from public, anon;
revoke all on function public.list_fin_categories() from public, anon;
revoke all on function public.create_fin_category(jsonb) from public, anon;
revoke all on function public.update_fin_category(uuid, jsonb) from public, anon;
revoke all on function public.archive_fin_category(uuid, boolean) from public, anon;
revoke all on function public.delete_fin_category(uuid) from public, anon;

grant execute on function public.finance_overview(text) to authenticated;
grant execute on function public.list_receivables(jsonb) to authenticated;
grant execute on function public.create_receivable(jsonb) to authenticated;
grant execute on function public.update_receivable(uuid, jsonb) to authenticated;
grant execute on function public.receive_receivable(uuid, jsonb) to authenticated;
grant execute on function public.cancel_receivable(uuid) to authenticated;
grant execute on function public.list_payables(jsonb) to authenticated;
grant execute on function public.create_payable(jsonb) to authenticated;
grant execute on function public.update_payable(uuid, jsonb) to authenticated;
grant execute on function public.pay_payable(uuid, jsonb) to authenticated;
grant execute on function public.delete_payable(uuid) to authenticated;
grant execute on function public.list_fin_categories() to authenticated;
grant execute on function public.create_fin_category(jsonb) to authenticated;
grant execute on function public.update_fin_category(uuid, jsonb) to authenticated;
grant execute on function public.archive_fin_category(uuid, boolean) to authenticated;
grant execute on function public.delete_fin_category(uuid) to authenticated;

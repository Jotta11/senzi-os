/**
 * Carrega o mundo da fonte em memória (`buildWorld`) no banco de teste, para comparar as leituras agregadas do banco
 * (Dashboard, Inteligência) com as funções de domínio sobre o mesmo mundo. Insere direto nas tabelas como superusuário,
 * sem triggers (`session_replication_role = replica`): histórico, blocos e estados vêm prontos do mundo.
 * Os ids do mundo (`sz-0107`, `res-0001`…) viram uuids determinísticos (`uid`); `fromUuids` faz o caminho de volta.
 */
import { createHash } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import type { World } from '@/data/types-world'

export const uid = (id: string): string => {
  const h = createHash('md5').update(id).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Troca, em qualquer valor JSON, os uuids gerados por `uid` pelos ids originais do mundo. */
export function fromUuids<T>(value: T, world: World): T {
  const ids = [
    ...world.garments.flatMap((g) => [g.id, ...g.blocks.map((b) => b.id)]),
    ...world.customers.map((c) => c.id),
    ...world.reservations.flatMap((r) => [r.id, ...r.items.map((i) => i.id), ...r.payments.map((p) => p.id)]),
    ...world.fittings.map((f) => f.id),
    ...world.maintenances.map((m) => m.id),
    ...world.appointments.map((a) => a.id),
  ]
  const back = new Map(ids.map((id) => [uid(id), id]))
  return JSON.parse(JSON.stringify(value).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (u) => back.get(u) ?? u)) as T
}

const j = (rows: unknown[]) => JSON.stringify(rows)
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)

/**
 * No banco os blocos ativos de uma peça não se sobrepõem (a fonte em memória deixa): um bloco que invade o seguinte termina
 * no dia anterior a ele, como a Operação faz no banco (área 5). Some se ficar vazio.
 */
function noOverlap<B extends { from: string; to: string }>(blocks: B[]): B[] {
  const sorted = [...blocks].sort((a, b) => a.from.localeCompare(b.from))
  return sorted.flatMap((b, i) => {
    const next = sorted[i + 1]
    const to = next && b.to >= next.from ? dayBefore(next.from) : b.to
    return to >= b.from ? [{ ...b, to }] : []
  })
}
const u = (id: string | null | undefined) => (id ? uid(id) : null)

export async function loadWorld(db: PGlite, w: World): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(`set local session_replication_role = replica`)
    const ins = (sql: string, rows: unknown[]) => tx.query(sql, [j(rows)])

    await tx.query(
      `update public.app_settings set default_cleaning_days = $1, default_prep_days = $2, late_fee_daily_percent = $3, deposit_percent = $4,
              discount_limit_percent = $5, min_signal_percent = $6, idle_alert_days = $7 where id`,
      [w.settings.defaultCleaningDays, w.settings.defaultPrepDays, w.settings.lateFeeDailyPercent, w.settings.depositPercent,
        w.settings.discountLimitPercent, w.settings.minSignalPercent, w.settings.idleAlertDays],
    )

    await ins(
      `insert into public.garment (id, code, name, category_id, label_size, size_equiv, color_primary, color_hex, fabric, length,
              rental_price, acquisition_cost, retail_reference, cleaning_days, state)
       select x.id, x.code, x.name, c.id, x.label_size, x.size_equiv::public.size_equiv, x.color_primary, x.color_hex, x.fabric,
              x.length::public.garment_length, x.rental_price, x.acquisition_cost, x.retail_reference, x.cleaning_days, x.state::public.garment_state
         from jsonb_to_recordset($1::jsonb) as x(id uuid, code text, name text, slug text, label_size text, size_equiv text, color_primary text,
              color_hex text, fabric text, length text, rental_price numeric, acquisition_cost numeric, retail_reference numeric, cleaning_days int, state text)
         join public.garment_category c on c.slug = x.slug`,
      w.garments.map((g) => ({
        id: uid(g.id), code: g.code, name: g.name, slug: g.categorySlug, label_size: g.labelSize, size_equiv: g.sizeEquiv,
        color_primary: g.colorPrimary, color_hex: g.colorHex, fabric: g.fabric, length: g.length, rental_price: g.rentalPrice,
        acquisition_cost: g.acquisitionCost, retail_reference: g.retailReference, cleaning_days: g.cleaningDays, state: g.state,
      })),
    )
    await ins(
      `insert into public.garment_state_history (garment_id, from_state, to_state, reason, occurred_at)
       select x.garment_id, x.from_state::public.garment_state, x.to_state::public.garment_state, x.reason, x.at
         from jsonb_to_recordset($1::jsonb) as x(garment_id uuid, from_state text, to_state text, reason text, at timestamptz, n int)
        order by x.n`,
      // O histórico do mundo vem do mais recente para o mais antigo: grava na ordem cronológica.
      w.garments.flatMap((g) => [...g.history].reverse().map((h, n) => ({ garment_id: uid(g.id), from_state: h.from, to_state: h.to, reason: h.reason, at: h.at, n }))),
    )

    await ins(
      `insert into public.customer (id, code, full_name, phone, instagram, email, birth_date, cpf, city, state, vip, created_at)
       select x.id, x.code, x.full_name, x.phone, x.instagram, x.email, x.birth_date, x.cpf, x.city, x.state, x.vip, x.created_at
         from jsonb_to_recordset($1::jsonb) as x(id uuid, code text, full_name text, phone text, instagram text, email text, birth_date date,
              cpf text, city text, state text, vip boolean, created_at timestamptz)`,
      w.customers.map((c) => ({
        id: uid(c.id), code: c.code, full_name: c.fullName, phone: c.phone, instagram: c.instagram, email: c.email, birth_date: c.birthDate,
        cpf: c.cpf, city: c.city, state: c.state, vip: c.vip, created_at: c.createdAt,
      })),
    )

    await ins(
      `insert into public.reservation (id, code, customer_id, state, event_date, event_type, event_venue, pickup_date, return_due_date,
              picked_up_at, returned_at, channel, total_gross, discount, total_net, deposit_amount, late_fee, created_at)
       select x.id, x.code, x.customer_id, x.state::public.reservation_state, x.event_date, x.event_type, x.event_venue, x.pickup_date,
              x.return_due_date, x.picked_up_at, x.returned_at, x.channel::public.reservation_channel, x.total_gross, x.discount, x.total_net,
              x.deposit_amount, x.late_fee, x.created_at
         from jsonb_to_recordset($1::jsonb) as x(id uuid, code text, customer_id uuid, state text, event_date date, event_type text,
              event_venue text, pickup_date date, return_due_date date, picked_up_at timestamptz, returned_at timestamptz, channel text,
              total_gross numeric, discount numeric, total_net numeric, deposit_amount numeric, late_fee numeric, created_at timestamptz)`,
      w.reservations.map((r) => ({
        id: uid(r.id), code: r.code, customer_id: uid(r.customerId), state: r.state, event_date: r.eventDate, event_type: r.eventType,
        event_venue: r.eventVenue, pickup_date: r.pickupDate, return_due_date: r.returnDueDate, picked_up_at: r.pickedUpAt,
        returned_at: r.returnedAt, channel: r.channel, total_gross: r.totalGross, discount: r.discount, total_net: r.totalNet,
        deposit_amount: r.depositAmount, late_fee: r.lateFee, created_at: r.createdAt,
      })),
    )
    await ins(
      `insert into public.reservation_item (id, reservation_id, garment_id, position, unit_price, gross_amount, item_discount,
              allocated_order_discount, net_revenue, item_state, picked_up_at, returned_at, pickup_note, return_note)
       select x.id, x.reservation_id, x.garment_id, x.position, x.unit_price, x.gross_amount, x.item_discount, x.allocated_order_discount,
              x.net_revenue, x.item_state::public.reservation_item_state, x.picked_up_at, x.returned_at, x.pickup_note, x.return_note
         from jsonb_to_recordset($1::jsonb) as x(id uuid, reservation_id uuid, garment_id uuid, position int, unit_price numeric,
              gross_amount numeric, item_discount numeric, allocated_order_discount numeric, net_revenue numeric, item_state text,
              picked_up_at timestamptz, returned_at timestamptz, pickup_note text, return_note text)`,
      w.reservations.flatMap((r) =>
        r.items.map((i, position) => ({
          id: uid(i.id), reservation_id: uid(r.id), garment_id: uid(i.garmentId), position, unit_price: i.unitPrice, gross_amount: i.grossAmount,
          item_discount: i.itemDiscount, allocated_order_discount: i.allocatedOrderDiscount, net_revenue: i.netRevenue, item_state: i.itemState,
          picked_up_at: i.pickedUpAt, returned_at: i.returnedAt, pickup_note: i.pickupNote, return_note: i.returnNote,
        })),
      ),
    )
    await ins(
      `insert into public.reservation_payment (id, reservation_id, kind, method, amount, state, paid_at, due_at, reference, notes, refers_to, created_at)
       select x.id, x.reservation_id, x.kind::public.payment_kind, x.method::public.payment_method, x.amount, x.state::public.payment_state,
              x.paid_at, x.due_at, x.reference, x.notes, x.refers_to, x.created_at
         from jsonb_to_recordset($1::jsonb) as x(id uuid, reservation_id uuid, kind text, method text, amount numeric, state text,
              paid_at timestamptz, due_at date, reference text, notes text, refers_to text, created_at timestamptz, n int)
        order by x.n`,
      w.reservations.flatMap((r) => r.payments).map((p, n) => ({
        id: uid(p.id), reservation_id: uid(p.reservationId), kind: p.kind, method: p.method, amount: p.amount, state: p.state, paid_at: p.paidAt,
        due_at: p.dueAt, reference: p.reference, notes: p.notes, refers_to: p.refersTo ?? null, created_at: p.createdAt, n,
      })),
    )
    await ins(
      `insert into public.garment_calendar_block (id, garment_id, reservation_id, kind, period, note)
       select x.id, x.garment_id, x.reservation_id, x.kind::public.block_kind, daterange(x.d_from, x.d_to, '[]'), x.note
         from jsonb_to_recordset($1::jsonb) as x(id uuid, garment_id uuid, reservation_id uuid, kind text, d_from date, d_to date, note text)
       on conflict do nothing`,
      w.garments.flatMap((g) => noOverlap(g.blocks).map((b) => ({ id: uid(b.id), garment_id: uid(g.id), reservation_id: u(b.reservationId), kind: b.kind, d_from: b.from, d_to: b.to, note: b.note }))),
    )

    await ins(
      `insert into public.fitting_session (id, code, customer_id, state, scheduled_at, started_at, ended_at, event_type, event_date, budget,
              notes, outcome_notes, reservation_id)
       select x.id, x.code, x.customer_id, x.state::public.fitting_state, x.scheduled_at, x.started_at, x.ended_at, x.event_type, x.event_date,
              x.budget, x.notes, x.outcome_notes, x.reservation_id
         from jsonb_to_recordset($1::jsonb) as x(id uuid, code text, customer_id uuid, state text, scheduled_at timestamptz, started_at timestamptz,
              ended_at timestamptz, event_type text, event_date date, budget numeric, notes text, outcome_notes text, reservation_id uuid)`,
      w.fittings.map((f) => ({
        id: uid(f.id), code: f.code, customer_id: uid(f.customerId), state: f.state, scheduled_at: f.scheduledAt, started_at: f.startedAt,
        ended_at: f.endedAt, event_type: f.eventType, event_date: f.eventDate, budget: f.budget, notes: f.notes, outcome_notes: f.outcomeNotes,
        reservation_id: u(f.reservationId),
      })),
    )
    await ins(
      `insert into public.fitting_item (fitting_session_id, garment_id, position, outcome, needs_alteration, note, recorded_at)
       select x.fitting_session_id, x.garment_id, x.position, x.outcome::public.fit_outcome, x.needs_alteration, x.note, x.recorded_at
         from jsonb_to_recordset($1::jsonb) as x(fitting_session_id uuid, garment_id uuid, position int, outcome text, needs_alteration boolean,
              note text, recorded_at timestamptz)`,
      w.fittingItems.map((i) => ({
        fitting_session_id: uid(i.fittingSessionId), garment_id: uid(i.garmentId), position: i.position, outcome: i.outcome,
        needs_alteration: i.needsAlteration, note: i.note, recorded_at: i.recordedAt,
      })),
    )

    await ins(
      `insert into public.appointment (id, kind, starts_at, title, notes, state, customer_id, reservation_id, fitting_id, garment_id, created_at)
       select x.id, x.kind::public.appointment_kind, x.starts_at, x.title, x.notes, x.state::public.appointment_state, x.customer_id,
              x.reservation_id, x.fitting_id, x.garment_id, clock_timestamp()
         from jsonb_to_recordset($1::jsonb) as x(id uuid, kind text, starts_at timestamptz, title text, notes text, state text, customer_id uuid,
              reservation_id uuid, fitting_id uuid, garment_id uuid, n int)
        order by x.n`,
      w.appointments.map((a, n) => ({
        id: uid(a.id), kind: a.kind, starts_at: a.startsAt, title: a.title, notes: a.notes, state: a.state, customer_id: u(a.customerId),
        reservation_id: u(a.reservationId), fitting_id: u(a.fittingId), garment_id: u(a.garmentId), n,
      })),
    )

    await ins(
      `insert into public.maintenance (id, garment_id, reservation_id, kind, state, opened_at, due_at, closed_at, description, provider, cost, blocks_garment)
       select x.id, x.garment_id, x.reservation_id, x.kind::public.maintenance_kind, x.state::public.maintenance_state, x.opened_at, x.due_at,
              x.closed_at, x.description, x.provider, x.cost, x.blocks_garment
         from jsonb_to_recordset($1::jsonb) as x(id uuid, garment_id uuid, reservation_id uuid, kind text, state text, opened_at timestamptz,
              due_at date, closed_at timestamptz, description text, provider text, cost numeric, blocks_garment boolean)`,
      w.maintenances.map((m) => ({
        id: uid(m.id), garment_id: uid(m.garmentId), reservation_id: u(m.reservationId), kind: m.kind, state: m.state, opened_at: m.openedAt,
        due_at: m.dueAt, closed_at: m.closedAt, description: m.description, provider: m.provider, cost: m.cost ?? 0, blocks_garment: m.blocksGarment,
      })),
    )

    // Categorias do financeiro: as do mundo no lugar das do seed (mesmas chaves de sistema).
    await tx.query(`delete from public.fin_category`)
    await ins(
      `insert into public.fin_category (id, name, type, color, system_key, archived, sort_order)
       select x.id, x.name, x.type::public.fin_category_type, x.color, x.system_key, x.archived, x.n
         from jsonb_to_recordset($1::jsonb) as x(id uuid, name text, type text, color text, system_key text, archived boolean, n int)`,
      w.finCategories.map((c, n) => ({ id: uid(c.id), name: c.name, type: c.type, color: c.color, system_key: c.systemKey ?? null, archived: c.archived, n })),
    )
    await ins(
      `insert into public.payable (id, description, supplier, category_id, amount, due_date, status, paid_at, paid_amount, method, recurrence,
              recurrence_end, source, garment_id, reservation_id, notes, created_at)
       select x.id, x.description, x.supplier, x.category_id, x.amount, x.due_date, x.status::public.payable_status, x.paid_at, x.paid_amount,
              x.method::public.payment_method, x.recurrence::public.payable_recurrence, x.recurrence_end, x.source::public.payable_source,
              x.garment_id, x.reservation_id, x.notes, x.created_at
         from jsonb_to_recordset($1::jsonb) as x(id uuid, description text, supplier text, category_id uuid, amount numeric, due_date date,
              status text, paid_at timestamptz, paid_amount numeric, method text, recurrence text, recurrence_end date, source text,
              garment_id uuid, reservation_id uuid, notes text, created_at timestamptz)`,
      w.payables.map((p) => ({
        id: uid(p.id), description: p.description, supplier: p.supplier, category_id: uid(p.categoryId), amount: p.amount, due_date: p.dueDate,
        status: p.status, paid_at: p.paidAt, paid_amount: p.paidAmount, method: p.method, recurrence: p.recurrence, recurrence_end: p.recurrenceEnd,
        source: p.source, garment_id: u(p.garmentId), reservation_id: u(p.reservationId), notes: p.notes, created_at: p.createdAt,
      })),
    )
    await ins(
      `insert into public.receivable (id, description, category_id, reservation_id, customer_id, payer_name, amount, paid_amount, due_date,
              status, received_at, method, notes)
       select x.id, x.description, x.category_id, x.reservation_id, x.customer_id, x.payer_name, x.amount, x.paid_amount, x.due_date,
              x.status::public.receivable_status, x.received_at, x.method::public.payment_method, x.notes
         from jsonb_to_recordset($1::jsonb) as x(id uuid, description text, category_id uuid, reservation_id uuid, customer_id uuid,
              payer_name text, amount numeric, paid_amount numeric, due_date date, status text, received_at timestamptz, method text, notes text)`,
      w.receivables.map((a) => ({
        id: uid(a.id), description: a.description, category_id: u(a.categoryId), reservation_id: u(a.reservationId), customer_id: u(a.customerId),
        payer_name: a.payerName, amount: a.amount, paid_amount: a.paidAmount, due_date: a.dueDate, status: a.status, received_at: a.receivedAt,
        method: a.method, notes: a.notes,
      })),
    )
  })
}

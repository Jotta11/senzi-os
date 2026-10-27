/**
 * Reservas e exceções por PIN no Supabase: RPCs de `supabase/migrations/20261027000400_reservas.sql` e
 * `20261027000450_reservas_rpcs.sql` (+ `authorize_exception`/`list_active_admins` da fundação).
 * As RPCs devolvem reservas, linhas e disponibilidade já no formato do app (instantes no fuso da loja; CPF do
 * contrato oculto sem `cliente.edit`); aqui só se assinam as fotos das peças e se trocam os erros do banco por
 * `SourceError`. As validações de formulário rodam antes (mesmas regras da prévia) para devolver todos os problemas
 * de uma vez; o banco valida de novo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from '@/lib/format'
import type { ExceptionsSource, ReservasSource } from '../source-reservas'
import { SourceError, type AvailabilityResult, type ConfirmResult, type Reservation, type ReservationDetail, type ReservationInput } from '../types'
import { contractSignIssues, reservationDiscountHint, reservationIssues } from '../validation'
import { fail, fromDbError, photoSigner, type PhotoSigner, type RawGarment } from './acervo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NIL = '00000000-0000-0000-0000-000000000000'

type RawDetail = Omit<ReservationDetail, 'garments'> & { garments: RawGarment[] }

/** Rascunho com problemas de formulário: todos de uma vez, com o texto do desconto quando é o caso. */
function checkDraft(input: ReservationInput): void {
  const issues = reservationIssues(input, todayISO())
  if (!issues.length) return
  const [first] = issues
  const hint = issues.some((i) => i.code === 'DESCONTO_MAIOR_QUE_BRUTO') ? reservationDiscountHint(input) : undefined
  throw new SourceError(first!.code, { field: first!.field, issues, hint })
}

export function supabaseReservas(client: SupabaseClient, withUrls: PhotoSigner = photoSigner(client)): ReservasSource & ExceptionsSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }
  const res = (fn: string, args: Record<string, unknown>) => rpc<Reservation>(fn, args)

  return {
    listReservations: (filter, page) => rpc('list_reservations', { p_filter: filter, p_limit: page.limit, p_offset: page.offset }),

    reservationSummary: () => rpc('reservation_summary'),

    // Link quebrado (`/reservas/abc`) é "não encontrada", não erro do banco.
    getReservation: async (id) => {
      if (!UUID.test(id)) return null
      const raw = await rpc<RawDetail | null>('get_reservation', { p_id: id })
      return raw ? { ...raw, garments: await withUrls(raw.garments) } : null
    },

    // Id que não é uuid vira "peça inexistente" (como a fonte em memória), mantendo o id pedido na resposta.
    checkAvailability: async (garmentIds, pickup, returnDue, ignore) => {
      const rows = await rpc<AvailabilityResult[]>('check_availability', {
        p_garments: garmentIds.map((g) => (UUID.test(g) ? g : NIL)),
        p_pickup: pickup,
        p_return: returnDue,
        p_ignore: ignore && UUID.test(ignore) ? ignore : null,
      })
      return rows.map((r, i) => ({ ...r, garmentId: garmentIds[i]! }))
    },

    alternatives: async (garmentId, pickup, returnDue) => {
      if (!UUID.test(garmentId)) throw new SourceError('NAO_ENCONTRADO')
      return withUrls(await rpc<RawGarment[]>('reservation_alternatives', { p_garment: garmentId, p_pickup: pickup, p_return: returnDue }))
    },

    createDraft: async (input, exceptionId) => {
      checkDraft(input)
      return res('create_reservation_draft', { p: input, p_exception: exceptionId ?? null })
    },

    updateDraft: async (id, input, exceptionId) => {
      checkDraft(input)
      return res('update_reservation_draft', { p_id: id, p: input, p_exception: exceptionId ?? null })
    },

    addDraftItem: (id, garmentId) => res('add_reservation_draft_item', { p_id: id, p_garment: garmentId }),

    removeDraftItem: (id, itemId) => res('remove_reservation_draft_item', { p_id: id, p_item: itemId }),

    markContractSigned: async (id, input) => {
      const issues = contractSignIssues(input, todayISO())
      if (issues.length) fail(issues)
      return res('sign_reservation_contract', { p_id: id, p: input })
    },

    confirmReservation: (id, signal, exceptionId) => rpc<ConfirmResult>('confirm_reservation', { p_id: id, p: signal, p_exception: exceptionId ?? null }),

    registerPayment: (id, input) => res('register_reservation_payment', { p_id: id, p: input }),

    returnDeposit: (id, method, retain) => res('return_reservation_deposit', { p_id: id, p_method: method, p_retain: retain ?? null }),

    markReady: (id) => res('mark_reservation_ready', { p_id: id }),

    pickupItems: (id, decisions, exceptionId) => res('pickup_reservation_items', { p_id: id, p_decisions: decisions, p_exception: exceptionId ?? null }),

    returnItems: (id, decisions) => res('return_reservation_items', { p_id: id, p_decisions: decisions }),

    cancelReservation: (id, reason) => res('cancel_reservation', { p_id: id, p_reason: reason }),

    markNoShow: (id) => res('mark_reservation_no_show', { p_id: id }),

    reservationsOfCustomer: async (customerId) => (UUID.test(customerId) ? rpc('reservations_of_customer', { p_customer: customerId }) : []),

    reservationsOfGarment: async (garmentId) => (UUID.test(garmentId) ? rpc('reservations_of_garment', { p_garment: garmentId }) : []),

    getSettings: () => rpc('get_settings'),

    listActiveAdmins: () => rpc('list_active_admins'),

    // Falha de autenticação (inclusive erro lançado pela RPC, ex.: MOTIVO_OBRIGATORIO) vem no retorno.
    // O rascunho ainda sem id usa um id provisório (`tmp-…`): no banco a exceção nasce sem ref_id.
    authorizeException: async (args) => {
      const { data, error } = await client.rpc('authorize_exception', {
        p_admin_email: args.email,
        p_pin: args.pin,
        p_kind: args.kind,
        p_reason: args.reason,
        p_ref_type: args.refType,
        p_ref_id: UUID.test(args.refId) ? args.refId : null,
      })
      if (error) return { ok: false, error: error.message }
      const result = data as { ok: boolean; id?: string; error?: string } | null
      return result?.ok && result.id ? { ok: true, id: result.id } : { ok: false, error: result?.error ?? '' }
    },
  }
}

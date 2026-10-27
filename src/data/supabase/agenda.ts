/**
 * Agenda e Provas no Supabase: RPCs de `supabase/migrations/20261027000300_agenda.sql`.
 * As RPCs devolvem compromissos, provas e históricos já no formato do app (instantes no fuso da loja);
 * aqui só se assinam as fotos das peças do detalhe da prova e se trocam os erros do banco por `SourceError`.
 * As validações de formulário rodam antes (mesmas regras da prévia) para devolver todos os problemas de uma vez.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from '@/lib/format'
import type { AgendaSource } from '../source-agenda'
import type { FittingDetail } from '../types'
import { appointmentIssues, customerIssues, fittingIssues } from '../validation'
import { fail, fromDbError, photoSigner, type PhotoSigner, type RawGarment } from './acervo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RawFittingDetail = Omit<FittingDetail, 'items'> & { items: (Omit<FittingDetail['items'][number], 'garment'> & { garment: RawGarment })[] }

export function supabaseAgenda(client: SupabaseClient, withUrls: PhotoSigner = photoSigner(client)): AgendaSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }

  /** Detalhe da prova com as fotos das peças assinadas. */
  async function detail(raw: RawFittingDetail): Promise<FittingDetail> {
    const garments = await withUrls(raw.items.map((i) => i.garment))
    return { ...raw, items: raw.items.map((i, n) => ({ ...i, garment: garments[n]! })) }
  }
  const detailRpc = async (fn: string, args: Record<string, unknown>) => detail(await rpc<RawFittingDetail>(fn, args))

  return {
    agendaRange: (from, to) => rpc('agenda_range', { p_from: from, p_to: to }),

    agendaMonthDays: (month) => rpc('agenda_month_days', { p_month: month }),

    createAppointment: async (input) => {
      const issues = appointmentIssues(input)
      if (issues.length) fail(issues)
      return rpc('create_appointment', { p: input })
    },

    updateAppointment: async (id, input) => {
      const issues = appointmentIssues(input)
      if (issues.length) fail(issues)
      return rpc('update_appointment', { p_id: id, p: input })
    },

    cancelAppointment: (id) => rpc('cancel_appointment', { p_id: id }),

    listUsers: () => rpc('list_staff'),

    listFittings: (filter, page) => rpc('list_fittings', { p_filter: filter, p_limit: page.limit, p_offset: page.offset }),

    fittingKpis: () => rpc('fitting_kpis'),

    // Link quebrado (`/provas/abc`) é "não encontrada", não erro do banco.
    getFitting: async (id) => {
      if (!UUID.test(id)) return null
      const raw = await rpc<RawFittingDetail | null>('get_fitting', { p_id: id })
      return raw ? detail(raw) : null
    },

    createFitting: async (input) => {
      const issues = fittingIssues(input)
      if (issues.length) fail(issues)
      if (!input.customerId && input.newCustomer) {
        const nc = customerIssues(input.newCustomer, todayISO())
        if (nc.length) fail(nc)
      }
      return rpc('create_fitting', { p: input })
    },

    addFittingGarment: (id, garmentId) => detailRpc('add_fitting_garment', { p_id: id, p_garment: garmentId }),

    removeFittingGarment: (id, garmentId) => detailRpc('remove_fitting_garment', { p_id: id, p_garment: garmentId }),

    // Chave ausente preserva o valor anterior; `note: null` apaga.
    setFittingOutcome: (id, garmentId, v) => {
      const p: Record<string, unknown> = {}
      if (v.outcome !== undefined) p.outcome = v.outcome
      if (v.needsAlteration !== undefined) p.needsAlteration = v.needsAlteration
      if (v.note !== undefined) p.note = v.note
      return detailRpc('set_fitting_outcome', { p_id: id, p_garment: garmentId, p })
    },

    closeFitting: (id, state, notes) => detailRpc('close_fitting', { p_id: id, p_state: state, p_notes: notes }),

    fittingsOfCustomer: (customerId) => rpc('fittings_of_customer', { p_customer: customerId }),

    fittingsOfGarment: (garmentId) => rpc('fittings_of_garment', { p_garment: garmentId }),

    fittingStatsOf: (garmentId) => rpc('fitting_stats_of', { p_garment: garmentId }),
  }
}

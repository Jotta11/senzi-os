/**
 * Clientes no Supabase: RPCs de `supabase/migrations/20261027000200_clientes.sql`.
 * As RPCs devolvem a cliente já no formato do app (CPF oculto sem `cliente.edit`, gasto `null` sem `financeiro.view`).
 * As validações de formulário rodam antes (mesmas regras da prévia) para devolver todos os problemas de uma vez;
 * o banco valida de novo e é quem acusa CPF repetido. As recomendações trazem peças, cujas fotos são assinadas aqui.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from '@/lib/format'
import type { AcervoClientesSource } from '../source'
import type { Customer, IdealMeasurements, PageResult, Recommendation } from '../types'
import { customerIssues, customerMeasurementIssues } from '../validation'
import { fail, fromDbError, photoSigner, type PhotoSigner, type RawGarment } from './acervo'

export type ClientesSource = Pick<
  AcervoClientesSource,
  | 'searchCustomers'
  | 'getCustomer'
  | 'createCustomer'
  | 'updateCustomer'
  | 'idealMeasurements'
  | 'addMeasurement'
  | 'addNote'
  | 'setNotePinned'
  | 'setFavorite'
  | 'recommend'
>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type RawRecommendation = Omit<Recommendation, 'garment'> & { garment: RawGarment }

export function supabaseClientes(client: SupabaseClient, withUrls: PhotoSigner = photoSigner(client)): ClientesSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }

  return {
    searchCustomers: (q, sort, page) =>
      rpc<PageResult<Customer>>('search_customers', { p_q: q, p_sort: sort, p_limit: page.limit, p_offset: page.offset }),

    // Link quebrado (`/clientes/abc`) é "não encontrada", não erro do banco.
    getCustomer: async (id) => (UUID.test(id) ? rpc<Customer | null>('get_customer', { p_id: id }) : null),

    createCustomer: async (input) => {
      const issues = customerIssues(input, todayISO())
      if (issues.length) fail(issues)
      return rpc<Customer>('create_customer', { p: input })
    },

    updateCustomer: async (id, input) => {
      const issues = customerIssues(input, todayISO(), true)
      if (issues.length) fail(issues)
      return rpc<Customer>('update_customer', { p_id: id, p: input })
    },

    idealMeasurements: (garmentId) => rpc<IdealMeasurements>('ideal_measurements', { p_garment: garmentId }),

    addMeasurement: async (id, input) => {
      const issues = customerMeasurementIssues(input)
      if (issues.length) fail(issues)
      return rpc<Customer>('add_customer_measurement', { p_customer: id, p: input })
    },

    addNote: async (id, content, channel, pinned) => {
      if (!content.trim()) fail([{ code: 'OBSERVACAO_OBRIGATORIA', field: 'content' }])
      return rpc<Customer>('add_customer_note', { p_customer: id, p_content: content, p_channel: channel, p_pinned: pinned })
    },

    setNotePinned: (id, noteId, pinned) => rpc<Customer>('set_customer_note_pinned', { p_customer: id, p_note: noteId, p_pinned: pinned }),

    setFavorite: (id, garmentId, on) => rpc<Customer>('set_customer_favorite', { p_customer: id, p_garment: garmentId, p_on: on }),

    recommend: async (id, limit = 8) => {
      const raws = await rpc<RawRecommendation[]>('recommend_garments', { p_customer: id, p_limit: limit })
      const garments = await withUrls(raws.map((r) => r.garment))
      return raws.map((r, i) => ({ garment: garments[i]!, score: r.score, reasons: r.reasons }))
    },
  }
}

/**
 * Financeiro no Supabase: RPCs de `supabase/migrations/20261027000500_financeiro.sql`.
 * As RPCs devolvem visão geral, contas e categorias já no formato do app (instantes no fuso da loja; parcelas
 * das reservas derivadas dos pagamentos; consolidados `null` sem `financeiro.consolidated`); aqui só se trocam
 * os erros do banco por `SourceError`. As validações de formulário rodam antes (mesmas regras da prévia) para
 * devolver todos os problemas de uma vez; o banco valida de novo (e confere categoria, saldo e estado).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { todayISO } from '@/lib/format'
import type { FinanceiroSource } from '../source-financeiro'
import { SourceError, type FinCategory, type Payable, type Receivable, type SourceIssue } from '../types'
import { finEntryIssues, recurrenceEndIssues, settleAmountIssues, settleDateIssue } from '../validation'
import { fail, fromDbError } from './acervo'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const check = (issues: (SourceIssue | null)[]) => {
  const list = issues.filter((x): x is SourceIssue => !!x)
  if (list.length) fail(list)
}

export function supabaseFinanceiro(client: SupabaseClient): FinanceiroSource {
  async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args)
    if (error) throw fromDbError(error)
    return data as T
  }
  /** Id que não é uuid (link quebrado, id da prévia) é "não encontrado", sem ir ao banco. */
  const byId = <T>(id: string, run: () => Promise<T>): Promise<T> => (UUID.test(id) ? run() : Promise.reject(new SourceError('NAO_ENCONTRADO')))
  // Filtro por categoria que não existe no banco não casa com nada (como a fonte em memória).
  const catFilter = <F extends { categoryId: string | null }>(f: F) => (f.categoryId && !UUID.test(f.categoryId) ? null : f)
  const emptyList = { rows: [], total: 0 }

  return {
    financeOverview: (range) => rpc('finance_overview', { p_range: range }),

    listReceivables: async (f) => {
      const ok = catFilter(f)
      const list = await rpc<Awaited<ReturnType<FinanceiroSource['listReceivables']>>>('list_receivables', { p_filter: ok ?? { ...f, categoryId: null } })
      return ok ? list : { ...list, ...emptyList }
    },

    createReceivable: async (i) => {
      check([...finEntryIssues(i), i.received ? settleDateIssue(i.receivedAt, todayISO(), 'receivedAt') : null])
      return rpc<Receivable>('create_receivable', { p: i })
    },

    updateReceivable: async (id, i) => {
      check(finEntryIssues(i, !!i.categoryId, true))
      return byId(id, () => rpc<Receivable>('update_receivable', { p_id: id, p: i }))
    },

    receiveReceivable: async (id, i) => {
      check([...settleAmountIssues(i.amount, 'amount'), settleDateIssue(i.receivedAt, todayISO(), 'receivedAt')])
      return byId(id, () => rpc<Receivable>('receive_receivable', { p_id: id, p: i }))
    },

    cancelReceivable: (id) => byId(id, () => rpc<Receivable>('cancel_receivable', { p_id: id })),

    listPayables: async (f) => {
      const ok = catFilter(f)
      const list = await rpc<Awaited<ReturnType<FinanceiroSource['listPayables']>>>('list_payables', { p_filter: ok ?? { ...f, categoryId: null } })
      return ok ? list : { ...list, ...emptyList }
    },

    createPayable: async (i) => {
      check([...finEntryIssues(i), ...recurrenceEndIssues(i), i.paid ? settleDateIssue(i.paidAt, todayISO(), 'paidAt') : null])
      return rpc<Payable>('create_payable', { p: i })
    },

    updatePayable: async (id, i) => {
      check([...finEntryIssues(i, !!i.categoryId, true), ...recurrenceEndIssues(i)])
      return byId(id, () => rpc<Payable>('update_payable', { p_id: id, p: i }))
    },

    payPayable: async (id, i) => {
      check([...settleAmountIssues(i.paidAmount, 'paidAmount'), settleDateIssue(i.paidAt, todayISO(), 'paidAt')])
      return byId(id, () => rpc<Payable>('pay_payable', { p_id: id, p: i }))
    },

    deletePayable: (id) => byId(id, async () => void (await rpc('delete_payable', { p_id: id }))),

    listFinCategories: () => rpc('list_fin_categories'),

    createFinCategory: async (i) => {
      if (!i.name?.trim()) fail([{ code: 'NOME_CATEGORIA_OBRIGATORIO', field: 'name' }])
      return rpc<FinCategory>('create_fin_category', { p: i })
    },

    updateFinCategory: async (id, i) => {
      if (i.name !== undefined && !i.name.trim()) fail([{ code: 'NOME_CATEGORIA_OBRIGATORIO', field: 'name' }])
      return byId(id, () => rpc<FinCategory>('update_fin_category', { p_id: id, p: i }))
    },

    archiveFinCategory: (id, archived = true) => byId(id, () => rpc<FinCategory>('archive_fin_category', { p_id: id, p_archived: archived })),

    deleteFinCategory: (id) => byId(id, async () => void (await rpc('delete_fin_category', { p_id: id }))),
  }
}

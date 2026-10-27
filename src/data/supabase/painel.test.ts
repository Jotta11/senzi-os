import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSource } from '../supabaseSource'
import { SourceError } from '../types'
import { supabasePainel } from './painel'

function fakeClient(rpcImpl: (fn: string, args?: Record<string, unknown>) => { data?: unknown; error?: unknown }) {
  const client = {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => ({ data: null, error: null, ...rpcImpl(fn, args) })),
    storage: { from: vi.fn() },
  }
  return { client: client as unknown as SupabaseClient, rpc: client.rpc }
}

describe('supabasePainel', () => {
  it('dashboard e relatório chamam as RPCs com os parâmetros do app e devolvem o jsonb como veio', async () => {
    const summary = { today: '2026-10-27', finance: null, alerts: [] }
    const report = { period: { days: 180, from: '2026-05-01', to: '2026-10-27' }, insights: [] }
    const f = fakeClient((fn) => ({ data: fn === 'dashboard_summary' ? summary : report }))
    const src = supabasePainel(f.client)
    await expect(src.dashboardSummary('7')).resolves.toBe(summary)
    await expect(src.intelReport(180, null)).resolves.toBe(report)
    await src.intelReport(365, 'vestido-longo')
    expect(f.rpc.mock.calls).toEqual([
      ['dashboard_summary', { p_range: '7' }],
      ['intel_report', { p_days: 180, p_category: null }],
      ['intel_report', { p_days: 365, p_category: 'vestido-longo' }],
    ])
  })

  it('erros do banco viram SourceError com o campo', async () => {
    const f = fakeClient((fn) => ({ error: fn === 'intel_report' ? { message: 'SEM_PERMISSAO', details: null, hint: null } : { message: 'PARAMETRO_INVALIDO', details: 'range', hint: null } }))
    const src = supabasePainel(f.client)
    await expect(src.intelReport(180, null)).rejects.toMatchObject({ code: 'SEM_PERMISSAO' })
    const e = await src.dashboardSummary('30').catch((x: unknown) => x)
    expect(e).toBeInstanceOf(SourceError)
    expect(e).toMatchObject({ code: 'PARAMETRO_INVALIDO', field: 'range' })
  })

  it('a fonte do Supabase traz o painel e a inteligência', () => {
    const src = createSupabaseSource(fakeClient(() => ({})).client)
    expect(typeof src.dashboardSummary).toBe('function')
    expect(typeof src.intelReport).toBe('function')
  })
})

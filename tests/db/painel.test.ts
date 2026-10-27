import type { PGlite, Transaction } from '@electric-sql/pglite'
import { createMockCtx, type MockCtx } from '@/data/mock/context'
import { painel } from '@/data/mock/painel'
import type { DashboardSummary, IntelPeriod, IntelReport } from '@/data/types'
import { intelReport } from '@/domain/intel'
import { asAnon, asUser, createTestDb, createUser } from './harness'
import { fromUuids, loadWorld, uid } from './painelWorld'

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b)

/**
 * O mundo da fonte em memória (com "hoje" = hoje do banco) carregado no banco: as leituras agregadas do banco têm de
 * reproduzir as funções de domínio sobre o mesmo mundo. Os arrays do mundo ficam na ordem de desempate do banco
 * (peças e clientes por código, reservas por criação, ordens por abertura, provas por horário).
 */
describe('painel e inteligência', () => {
  let db: PGlite
  let ctx: MockCtx
  let today: string
  let admin: string
  let atend: string
  let other: string

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string }) => e)
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])
  const grant = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, true)`, [user, perm])
  const resetOverrides = (user: string) => db.query(`delete from public.user_permission_override where user_id = $1`, [user])

  const summary = async (range: '7' | '30' | '90', user = admin) =>
    fromUuids(await as<DashboardSummary>(user, 'public.dashboard_summary($1)', [range]), ctx.db)
  const report = async (days: IntelPeriod | number, cat: string | null, user = admin) =>
    fromUuids(await as<IntelReport>(user, 'public.intel_report($1, $2)', [days, cat]), ctx.db)
  const mockSummary = (range: '7' | '30' | '90') => painel(ctx, { agendaRange: async () => [], agendaMonthDays: async () => [] }).dashboardSummary(range)

  beforeAll(async () => {
    db = await createTestDb()
    const { rows } = await db.query<{ d: string }>(`select public.store_today()::text as d`)
    today = rows[0].d
    ctx = createMockCtx({ latencyMs: 0, today })
    const w = ctx.db
    w.garments.sort((a, b) => a.code.localeCompare(b.code))
    w.customers.sort((a, b) => a.code.localeCompare(b.code))
    w.reservations.sort((a, b) => byTime(a.createdAt, b.createdAt) || a.code.localeCompare(b.code))
    w.maintenances.sort((a, b) => byTime(a.openedAt, b.openedAt) || uid(a.id).localeCompare(uid(b.id)))
    w.fittings.sort((a, b) => byTime(a.scheduledAt, b.scheduledAt) || a.code.localeCompare(b.code))
    await loadWorld(db, w)
    admin = await createUser(db, { email: 'julia@senzi.com.br', full_name: 'Júlia Senzi', role: 'admin' })
    atend = await createUser(db, { email: 'ana@senzi.com.br', full_name: 'Ana Lima', role: 'atendimento' })
    other = await createUser(db, { email: 'bruna@senzi.com.br', full_name: 'Bruna Costa', role: 'atendimento' })
  })

  describe('dashboard_summary', () => {
    it.each(['7', '30', '90'] as const)('período %s: tiles, alertas, ciclo, faturamento e provas iguais aos da fonte em memória', async (range) => {
      const [got, mem] = await Promise.all([summary(range), mockSummary(range)])
      // A agenda de hoje e os dias do mês são as leituras da Agenda (teste abaixo); o resto, regra a regra.
      expect({ ...got, agendaToday: [], agendaMonthDays: [] }).toEqual({ ...mem, agendaToday: [], agendaMonthDays: [] })
    })

    it('o mundo tem alertas de todos os tipos (o teste de igualdade cobre cada regra)', async () => {
      const s = await summary('30')
      expect(new Set(s.alerts.map((a) => a.kind)).size).toBeGreaterThanOrEqual(8)
      expect(s.today).toBe(today)
    })

    it('agenda de hoje e dias do mês = as mesmas leituras da Agenda', async () => {
      const s = await asUser(db, admin, (tx) => rpc<{ agendaToday: unknown; agendaMonthDays: unknown }>(tx, 'public.dashboard_summary($1)', ['30']))
      const days = await as<{ items: unknown[] }[]>(admin, 'public.agenda_range($1, $1)', [today])
      const month = await as<string[]>(admin, 'public.agenda_month_days($1)', [today.slice(0, 7)])
      expect(s.agendaToday).toEqual(days[0]!.items)
      expect(s.agendaMonthDays).toEqual(month)
      expect((s.agendaToday as unknown[]).length).toBeGreaterThan(0)
    })

    it('atendimento: sem financeiro.consolidated o faturamento sai null; provas próximas continuam', async () => {
      const s = await summary('30', atend)
      expect(s.finance).toBeNull()
      expect(s.fittingsSoon).toEqual((await mockSummary('30')).fittingsSoon)
      expect(s.alerts).toEqual((await summary('30')).alerts)
    })

    it('alertas seguem a permissão: pagamento pendente exige financeiro.view; os demais, a da rota de destino', async () => {
      const all = (await summary('30')).alerts
      expect(all.some((a) => a.kind === 'pagamento_pendente')).toBe(true)
      await deny(other, 'financeiro.view')
      await deny(other, 'reserva.view')
      await deny(other, 'cliente.view')
      try {
        const s = await summary('30', other)
        expect(s.alerts).toEqual(all.filter((a) => a.kind !== 'pagamento_pendente' && !a.route.startsWith('/reservas') && !a.route.startsWith('/clientes')))
        expect(s.alerts.length).toBeGreaterThan(0)
      } finally {
        await resetOverrides(other)
      }
    })

    it('admin sem financeiro.consolidated também recebe finance null', async () => {
      await deny(admin, 'financeiro.consolidated')
      try {
        expect((await summary('7')).finance).toBeNull()
      } finally {
        await resetOverrides(admin)
      }
    })

    it('exige dashboard.view; período inválido → PARAMETRO_INVALIDO; anon não executa', async () => {
      await deny(other, 'dashboard.view')
      try {
        expect((await errOf(summary('30', other)))?.message).toBe('SEM_PERMISSAO')
      } finally {
        await resetOverrides(other)
      }
      const e = await errOf(as(admin, 'public.dashboard_summary($1)', ['15']))
      expect(e).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'range' })
      await expect(asAnon(db, (tx) => rpc(tx, 'public.dashboard_summary($1)', ['30']))).rejects.toThrow(/permission denied/)
    })
  })

  describe('intel_report', () => {
    it.each([
      [90, null],
      [180, null],
      [365, null],
      [180, 'vestido-longo'],
      [365, 'vestido-midi'],
      [90, 'saia'],
    ] as const)('%s dias, categoria %s: igual ao relatório da fonte em memória (números, ordenações e insights)', async (days, cat) => {
      const got = await report(days, cat)
      const expected = intelReport(ctx.db, days, today, cat)
      expect(got).toEqual(expected)
    })

    it('o relatório de 365 dias exercita as seções e os insights', async () => {
      const r = await report(365, null)
      expect(r.kpis.rentals).toBeGreaterThan(0)
      expect(r.period).toEqual({ days: 365, from: expect.any(String), to: today })
      expect(r.idleAlertDays).toBe(ctx.db.settings.idleAlertDays)
      expect(r.insights.length).toBeGreaterThanOrEqual(6)
      expect(r.paidBack.length).toBeGreaterThan(0)
      expect(r.monthly).toHaveLength(13)
    })

    it('sem acervo.cost: custos null, payback vazio e sem os insights de custo; o resto igual', async () => {
      await grant(other, 'inteligencia.view')
      try {
        const full = await report(365, null)
        const r = await report(365, null, other)
        expect(r.idleCapital.every((g) => g.cost === null)).toBe(true)
        expect(r.idleCapital.map((g) => g.code)).toEqual([...full.idleCapital].sort((a, b) => a.code.localeCompare(b.code)).map((g) => g.code))
        expect(r.paidBack).toEqual([])
        expect(r.insights).toEqual(full.insights.filter((i) => !i.requires))
        expect(r.kpis).toEqual(full.kpis)
        expect(r.topCustomers).toEqual(full.topCustomers)
      } finally {
        await resetOverrides(other)
      }
    })

    it('categoria sem peças: relatório vazio do escopo, clientes e provas globais continuam', async () => {
      const r = await report(180, 'nao-existe')
      expect(r).toEqual(intelReport(ctx.db, 180, today, 'nao-existe'))
      expect(r.kpis.rentals).toBe(0)
      expect(r.kpis.activeCustomers).toBeGreaterThan(0)
    })

    it('exige inteligencia.view (atendimento não tem); período inválido → PARAMETRO_INVALIDO; anon não executa', async () => {
      expect((await errOf(report(180, null, atend)))?.message).toBe('SEM_PERMISSAO')
      expect(await errOf(report(30, null))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'days' })
      await expect(asAnon(db, (tx) => rpc(tx, 'public.intel_report($1, $2)', [180, null]))).rejects.toThrow(/permission denied/)
    })
  })
})

describe('dashboard_summary — cortes do período do faturamento', () => {
  let db: PGlite
  let admin: string
  let today: string
  const D = (n: number) => new Date(Date.parse(`${today}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

  beforeAll(async () => {
    db = await createTestDb()
    today = (await db.query<{ d: string }>(`select public.store_today()::text as d`)).rows[0].d
    admin = await createUser(db, { email: 'julia@senzi.com.br', full_name: 'Júlia Senzi', role: 'admin' })
    await db.query(`insert into public.customer (id, code, full_name, phone, birth_date, cpf) values ($1, 'CL-0001', 'Mariana Fontes', '63999990000', '1990-01-01', '52998224725')`, [uid('c')])
    await db.query(
      `insert into public.reservation (id, code, customer_id, state, pickup_date, return_due_date, total_gross, total_net)
       values ($1, 'RS-2026-0001', $2, 'finalizada', $3, $3, 100, 100)`,
      [uid('r'), uid('c'), D(-200)],
    )
  })

  it('7, 30 (do dia 1) e 90 dias somam só o que cai na janela; estorno de receita subtrai; caução e estorno da caução não contam', async () => {
    const first = `${today.slice(0, 7)}-01`
    const lines: [string, string, number, string | null][] = [
      ['sinal', D(-6), 1, null], // 7 dias: dentro (limite)
      ['sinal', D(-7), 10, null], // 7 dias: fora
      ['saldo', first, 100, null], // mês: dentro (limite)
      ['saldo', D(-89), 1000, null], // 90 dias: dentro (limite)
      ['multa', D(-90), 10000, null], // 90 dias: fora
      ['caucao', today, 500, null],
      ['estorno', today, 3, null],
      ['estorno', today, 60, 'caucao'],
    ]
    const dayBefore = new Date(Date.parse(`${first}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
    lines.push(['sinal', dayBefore, 100000, null]) // mês: fora
    for (const [kind, day, amount, refersTo] of lines) {
      await db.query(
        `insert into public.reservation_payment (reservation_id, kind, method, amount, state, paid_at, refers_to)
         values ($1, $2::public.payment_kind, 'pix', $3, 'pago', public.store_at($4::date, '10:00'), $5)`,
        [uid('r'), kind, amount, day, refersTo],
      )
    }
    const revenue = (from: string) =>
      lines.filter(([k, d, , ref]) => k !== 'caucao' && ref !== 'caucao' && d >= from && d <= today).reduce((s, [k, , a]) => s + (k === 'estorno' ? -a : a), 0)
    const get = async (range: '7' | '30' | '90') =>
      (await asUser(db, admin, (tx) => rpc<DashboardSummary>(tx, 'public.dashboard_summary($1)', [range]))).finance!
    expect((await get('7')).revenue).toBe(revenue(D(-6)))
    expect((await get('30')).revenue).toBe(revenue(first))
    expect((await get('90')).revenue).toBe(revenue(D(-89)))
    const s = await get('30')
    expect(s.series).toHaveLength(7)
    expect(s.series.at(-1)).toMatchObject({ month: today.slice(0, 7), value: revenue(first) })
    expect(s.range).toBe('30')
    // A reserva foi retirada há 200 dias: nenhuma locação no período.
    expect(s).toMatchObject({ rentals: 0, ticket: 0 })
  })
})

import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type Block = { id: string; kind: string; from: string; to: string; note: string | null; reservationId: string | null; maintenanceId: string | null }
type Garment = { id: string; code: string; name: string; state: string; blocks: Block[]; history: { reason: string; from: string | null; to: string }[] }
type Item = { id: string; garmentId: string; itemState: string }
type Res = { id: string; code: string; state: string; totalNet: number; items: Item[]; history: { toState: string; reason: string }[] }
type Maintenance = {
  id: string
  garmentId: string
  inspectionId: string | null
  reservationId: string | null
  kind: string
  state: string
  openedAt: string
  dueAt: string | null
  closedAt: string | null
  description: string | null
  provider: string | null
  cost: number | null
  blocksGarment: boolean
  createdBy: string
}
type Inspection = {
  id: string
  garmentId: string
  reservationId: string | null
  inspectedAt: string
  inspectorName: string
  result: string
  findings: { label: string; ok: boolean; severity: string; note: string | null }[]
  notes: string | null
  photos: { id: string; kind: string; path: string | null }[]
}
type Row = { garment: Garment; order: Maintenance | null; blockNote: string | null; nextRentalStart: string | null; daysOpen: number | null; waitingDays: number | null }
type Queue = {
  inspecao: Row[]
  higienizacao: Row[]
  ajuste: Row[]
  manutencao: Row[]
  bloqueado: Row[]
  openOrders: (Maintenance & { garmentCode: string; garmentName: string })[]
  costLast30d: number | null
}
type Payable = { id: string; description: string; supplier: string | null; amount: number; status: string; source: string; method: string | null; garment_id: string; maintenance_id: string; key: string }

const GARMENT = {
  categorySlug: 'vestido-midi',
  labelSize: '38',
  colorHex: '#0E5C4A',
  colorPrimary: 'Verde',
  sizeEquiv: 'M',
  length: 'midi',
  rentalPrice: 450,
  fabric: 'Crepe',
  neckline: '',
  sleeve: '',
  style: '',
  occasions: [],
  fitNotes: '',
  acquisitionCost: 900,
  retailReference: 2000,
  cleaningDays: null,
  location: '',
}
const grave = { label: 'Zíper e fechos', ok: false, severity: 'grave', note: 'Rompido' }
const leve = { label: 'Barra', ok: false, severity: 'leve', note: null }

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

describe('operação', () => {
  let db: PGlite
  let admin: string
  let atend: string
  let today: string
  let cust: { id: string; fullName: string }

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const D = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string; hint?: string }) => e)
  const garment = (extra: Record<string, unknown> = {}) =>
    as<Garment>(admin, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, name: `Vestido ${Math.random().toString(36).slice(2, 8)}`, ...extra })])
  const getGarment = (id: string) => as<Garment>(admin, 'public.get_garment($1)', [id])
  const getRes = (id: string) => as<Res>(admin, 'public.get_reservation($1)', [id])
  const confirmed = async (gs: Garment[], d: [number, number, number]) => {
    const draft = await as<Res>(atend, 'public.create_reservation_draft($1, $2)', [
      JSON.stringify({
        customerId: cust.id,
        pickupDate: D(d[0]),
        eventDate: D(d[1]),
        returnDueDate: D(d[2]),
        eventType: 'Casamento',
        discount: 0,
        items: gs.map((g) => ({ garmentId: g.id, unitPrice: 450 })),
      }),
      null,
    ])
    await as(atend, 'public.sign_reservation_contract($1, $2)', [draft.id, JSON.stringify({ signedAt: today, signerName: 'Mariana Fontes', notes: null })])
    const res = await as<{ ok: boolean; reservation: Res }>(atend, 'public.confirm_reservation($1, $2, $3)', [
      draft.id,
      JSON.stringify({ amount: draft.totalNet, method: 'pix', reference: null, notes: null }),
      null,
    ])
    if (!res.ok) throw new Error('confirmação recusada')
    return res.reservation
  }
  /** Reserva retirada (ontem → hoje) e devolvida hoje: as peças `returned` ficam em inspeção. */
  const returned = async (gs: Garment[], returnedIds = gs.map((g) => g.id)) => {
    const r = await confirmed(gs, [-1, -1, 0])
    await as(atend, 'public.pickup_reservation_items($1, $2, $3)', [r.id, JSON.stringify(r.items.map((i) => ({ itemId: i.id, delivered: true }))), null])
    await as(atend, 'public.return_reservation_items($1, $2)', [r.id, JSON.stringify(r.items.map((i) => ({ itemId: i.id, returned: returnedIds.includes(i.garmentId) })))])
    return r
  }
  const queue = (user = admin) => as<Queue>(user, 'public.operacao_queue()')
  const target = (g: string, user = admin) => as<{ reservationId: string; customerName: string } | null>(user, 'public.inspection_target($1)', [g])
  const inspect = async (g: Garment, extra: Record<string, unknown> = {}, user = atend) => {
    const t = await target(g.id)
    return as<{ result: string; garment: Garment }>(user, 'public.register_inspection($1)', [
      JSON.stringify({
        garmentId: g.id,
        reservationId: t?.reservationId ?? null,
        findings: [],
        photos: [],
        perda: false,
        maintenanceKind: 'costura',
        provider: null,
        openRepair: false,
        notes: null,
        ...extra,
      }),
    ])
  }
  const close = (p: Record<string, unknown>, user = atend) =>
    as<Garment>(user, 'public.close_maintenance($1)', [JSON.stringify({ cost: 0, provider: null, note: null, release: false, ...p })])
  const release = (g: string, note = '', user = atend) => as<Garment>(user, 'public.release_garment($1, $2)', [g, note])
  const history = (g: string, user = admin) => as<{ maintenances: Maintenance[]; inspections: Inspection[] }>(user, 'public.maintenances_of($1)', [g])
  const payables = async (maintenance: string) =>
    (
      await db.query<Payable>(
        `select p.id, p.description, p.supplier, p.amount::float as amount, p.status::text, p.source::text, p.method::text,
                p.garment_id, p.maintenance_id, c.system_key as key
           from public.payable p join public.fin_category c on c.id = p.category_id
          where p.maintenance_id = $1`,
        [maintenance],
      )
    ).rows
  const costs = async (g: string) =>
    (
      await asUser(db, admin, (tx) =>
        tx.query<{ cleaning: number; maintenance: number; rentals: number }>(
          'select cleaning::float as cleaning, maintenance::float as maintenance, rentals from public.garment_costs($1)',
          [[g]],
        ),
      )
    ).rows[0]!

  beforeAll(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
    today = (await db.query<{ d: string }>(`select public.store_today()::text d`)).rows[0].d
    cust = await as(admin, 'public.create_customer($1)', [
      JSON.stringify({ fullName: 'Mariana Fontes', phone: '63996124478', birthDate: '1995-03-10', cpf: '52998224725', email: 'mari@x.com' }),
    ])
  }, 60000)

  afterAll(async () => {
    await db.close()
  })

  describe('permissões', () => {
    it('anônimo não lê tabelas nem chama RPCs; ninguém lê as tabelas direto', async () => {
      for (const t of ['maintenance', 'inspection', 'inspection_photo', 'checklist_item'])
        await expect(asUser(db, admin, (tx) => tx.query(`select * from public.${t}`))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query('select public.operacao_queue()'))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(`select public.register_inspection('{}')`))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query(`select public.operacao_release(gen_random_uuid(), 'x')`))).rejects.toThrow(/permission denied/)
    })

    it('sem as permissões de operação → SEM_PERMISSAO', async () => {
      const sem = await createUser(db, { email: 'sem@senzi.test', full_name: 'Sem Operação', role: 'atendimento' })
      for (const p of ['operacao.view', 'operacao.inspect', 'operacao.maintenance', 'operacao.release']) await deny(sem, p)
      for (const sql of [
        'public.operacao_queue()',
        'public.operacao_checklist()',
        'public.operacao_suppliers()',
        'public.inspection_target(gen_random_uuid())',
        'public.maintenances_of(gen_random_uuid())',
        `public.register_inspection('{}')`,
        `public.close_maintenance('{}')`,
        `public.release_garment(gen_random_uuid(), '')`,
      ])
        expect((await errOf(as(sem, sql)))?.message).toBe('SEM_PERMISSAO')
    })
  })

  describe('leituras', () => {
    it('checklist ativo em ordem e fornecedores sugeridos', async () => {
      const list = await as<{ label: string; sortOrder: number; isActive: boolean }[]>(atend, 'public.operacao_checklist()')
      expect(list).toHaveLength(10)
      expect(list[0]).toMatchObject({ label: 'Manchas', sortOrder: 0, isActive: true })
      expect(list.at(-1)!.label).toBe('Alças e sustentação')
      await db.query(`update public.checklist_item set is_active = false where label = 'Odor'`)
      expect(await as<unknown[]>(atend, 'public.operacao_checklist()')).toHaveLength(9)
      await db.query(`update public.checklist_item set is_active = true where label = 'Odor'`)
      expect((await as<string[]>(atend, 'public.operacao_suppliers()')).slice(0, 4)).toEqual([
        'Lavanderia Branca Neve',
        'Ateliê Dona Neuza',
        'Ateliê próprio',
        'Tinturaria Aurora',
      ])
    })
  })

  describe('inspeção', () => {
    it('aprovada: higienização em andamento, bloco da ordem, item inspecionado e reserva finalizada', async () => {
      const g = await garment()
      const r = await returned([g])
      const q0 = await queue()
      const row = q0.inspecao.find((x) => x.garment.id === g.id)!
      expect(row).toMatchObject({ order: null, waitingDays: 0, daysOpen: null })
      const t = await target(g.id)
      expect(t).toEqual({ reservationId: r.id, customerName: 'Mariana Fontes' })

      const out = await inspect(g, { photos: [{ kind: 'devolucao' }, { kind: 'detalhe' }] })
      expect(out.result).toBe('aprovada')
      expect(out.garment.state).toBe('higienizacao')
      expect(out.garment.history[0]).toMatchObject({ from: 'inspecao', to: 'higienizacao', reason: 'Enviada para higienização' })
      const h = await history(g.id)
      expect(h.maintenances).toHaveLength(1)
      const m = h.maintenances[0]!
      expect(m).toMatchObject({ kind: 'higienizacao', state: 'em_andamento', dueAt: D(2), blocksGarment: true, reservationId: r.id, description: 'Higienização pós-locação', cost: 0 })
      expect(m.openedAt.slice(0, 10)).toBe(today)
      expect(h.inspections[0]).toMatchObject({ result: 'aprovada', inspectorName: 'Bia Atendimento', notes: 'Peça devolvida em boas condições.', findings: [], reservationId: r.id })
      expect(h.inspections[0]!.photos.map((p) => [p.kind, p.path])).toEqual([
        ['devolucao', null],
        ['detalhe', null],
      ])
      // A higienização planejada da reserva e a locação de hoje saem; fica só o bloco da ordem.
      expect(out.garment.blocks.map((b) => [b.kind, b.from, b.to, b.maintenanceId, b.reservationId])).toEqual([['higienizacao', today, D(2), m.id, null]])
      const res = await getRes(r.id)
      expect(res.items[0]!.itemState).toBe('inspecionado')
      expect(res.state).toBe('finalizada')
      expect(res.history.at(-1)).toMatchObject({ toState: 'finalizada', reason: 'Todas as peças inspecionadas' })
      expect(await target(g.id)).toBeNull()

      const q = await queue()
      expect(q.higienizacao.find((x) => x.garment.id === g.id)).toMatchObject({ order: { id: m.id }, daysOpen: 0, waitingDays: null })
      expect(q.openOrders.find((o) => o.id === m.id)).toMatchObject({ garmentCode: g.code, garmentName: g.name })
      // Inspecionar de novo: a peça já não está em inspeção.
      expect((await errOf(inspect(g)))?.message).toBe('ESTADO_INVALIDO')
    })

    it('reserva com outra peça ainda na rua não finaliza; ressalva + reparo leve abre ordem que não bloqueia', async () => {
      const [a, b] = [await garment(), await garment()]
      const r = await returned([a, b], [a.id])
      expect((await getRes(r.id)).state).toBe('aguardando_devolucao')
      const out = await inspect(a, { findings: [leve], openRepair: true, maintenanceKind: 'barra', provider: 'Ateliê Dona Neuza' })
      expect(out.result).toBe('ressalva')
      expect(out.garment.state).toBe('higienizacao')
      expect((await getRes(r.id)).state).toBe('aguardando_devolucao')
      const { maintenances, inspections } = await history(a.id)
      expect(maintenances.map((m) => [m.kind, m.state, m.blocksGarment, m.provider]).sort()).toEqual([
        ['barra', 'aberta', false, 'Ateliê Dona Neuza'],
        ['higienizacao', 'em_andamento', true, 'Ateliê Dona Neuza'],
      ])
      const barra = maintenances.find((m) => m.kind === 'barra')!
      expect(barra).toMatchObject({ dueAt: D(3), description: 'Barra (leve)' })
      expect(out.garment.blocks.filter((x) => x.maintenanceId === barra.id)).toEqual([])
      expect(inspections[0]).toMatchObject({ notes: 'Ressalvas registradas na inspeção.', findings: [{ label: 'Barra', ok: false, severity: 'leve', note: null }] })
      // Fornecedor usado em ordem entra nas sugestões (sem repetir os de sempre).
      const sup = await as<string[]>(atend, 'public.operacao_suppliers()')
      expect(sup.filter((s) => s === 'Ateliê Dona Neuza')).toHaveLength(1)
    })

    it('dano grave: manutenção de 5 dias; concluir com custo lança conta e soma na economia; liberar volta disponível', async () => {
      const g = await garment()
      await returned([g])
      const out = await inspect(g, { findings: [grave], maintenanceKind: 'ziper', provider: 'Ateliê Dona Neuza' })
      expect(out.result).toBe('reprovada')
      expect(out.garment.state).toBe('manutencao')
      const m = (await history(g.id)).maintenances[0]!
      expect(m).toMatchObject({ kind: 'ziper', state: 'aberta', blocksGarment: true, dueAt: D(5), provider: 'Ateliê Dona Neuza', description: 'Zíper e fechos (grave) — Rompido' })
      expect(out.garment.blocks).toEqual([expect.objectContaining({ kind: 'manutencao', from: today, to: D(5), maintenanceId: m.id, note: 'Manutenção aberta na inspeção' })])
      expect((await queue()).manutencao.find((x) => x.garment.id === g.id)!.order!.id).toBe(m.id)

      const done = await close({ maintenanceId: m.id, cost: 120.456, note: 'Zíper trocado', release: true })
      expect(done.state).toBe('disponivel')
      expect(done.history[0]).toMatchObject({ from: 'manutencao', to: 'disponivel', reason: 'Liberada pela Operação' })
      expect(done.blocks).toEqual([])
      const after = (await history(g.id)).maintenances[0]!
      expect(after).toMatchObject({ state: 'concluida', cost: 120.46, description: 'Zíper e fechos (grave) — Rompido · Zíper trocado', provider: 'Ateliê Dona Neuza' })
      expect(after.closedAt!.slice(0, 10)).toBe(today)
      expect(await payables(m.id)).toEqual([
        expect.objectContaining({ amount: 120.46, status: 'paga', source: 'operacao', method: 'pix', key: 'manutencao', supplier: 'Ateliê Dona Neuza', garment_id: g.id, description: 'Zíper e fechos (grave) — Rompido · Zíper trocado' }),
      ])
      expect(await costs(g.id)).toMatchObject({ cleaning: 0, maintenance: 120.46, rentals: 1 })
    })

    it('grave + perda: bloqueada 30 dias sem ordem; liberar exige acervo.block e tira o bloqueio', async () => {
      const g = await garment()
      await returned([g])
      const out = await inspect(g, { findings: [grave], perda: true })
      expect(out.result).toBe('perda')
      expect(out.garment.state).toBe('bloqueado')
      expect((await history(g.id)).maintenances).toEqual([])
      expect(out.garment.blocks).toEqual([expect.objectContaining({ kind: 'bloqueio_manual', from: today, to: D(30), note: 'Avaliação gerencial — possível perda da peça' })])
      expect((await queue()).bloqueado.find((x) => x.garment.id === g.id)).toMatchObject({ order: null, blockNote: 'Avaliação gerencial — possível perda da peça' })

      const semBloqueio = await createUser(db, { email: 'sb@senzi.test', full_name: 'Sem Bloqueio', role: 'atendimento' })
      await deny(semBloqueio, 'acervo.block')
      expect((await errOf(release(g.id, '', semBloqueio)))?.message).toBe('SEM_PERMISSAO')
      const freed = await release(g.id, '  ')
      expect(freed.state).toBe('disponivel')
      expect(freed.blocks).toEqual([])
      expect(freed.history[0]).toMatchObject({ to: 'disponivel', reason: 'Liberada pela Operação' })
    })

    it('higienização do bloco não passa por cima do próximo compromisso da peça', async () => {
      const g = await garment()
      const r = await confirmed([g], [-1, -1, 0])
      const next = await confirmed([g], [6, 6, 7])
      await as(atend, 'public.pickup_reservation_items($1, $2, $3)', [r.id, JSON.stringify(r.items.map((i) => ({ itemId: i.id, delivered: true }))), null])
      await as(atend, 'public.return_reservation_items($1, $2)', [r.id, JSON.stringify(r.items.map((i) => ({ itemId: i.id, returned: true })))])
      await db.query(`update public.garment set cleaning_days = 12 where id = $1`, [g.id])
      const out = await inspect(g)
      const firstNext = out.garment.blocks.filter((b) => b.reservationId === next.id).map((b) => b.from).sort()[0]!
      const hig = out.garment.blocks.find((b) => b.kind === 'higienizacao' && b.reservationId === null)!
      expect(hig.from).toBe(today)
      const dayBefore = new Date(`${firstNext}T00:00:00Z`)
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1)
      expect(hig.to).toBe(dayBefore.toISOString().slice(0, 10))
      expect(hig.to < D(12)).toBe(true)
      // A ordem guarda o prazo cheio; a agenda, só o que cabe.
      expect((await history(g.id)).maintenances[0]!.dueAt).toBe(D(12))
      // Liberar mantém os blocos planejados da reserva viva (decisão 9 do 03v) e a peça volta reservada.
      const freed = await close({ maintenanceId: (await history(g.id)).maintenances[0]!.id, cost: 0, release: true })
      expect(freed.state).toBe('reservado')
      expect(freed.blocks.filter((b) => b.reservationId === next.id).length).toBeGreaterThan(0)
      expect(freed.blocks.some((b) => b.reservationId === null)).toBe(false)
    })

    it('entrada inválida → PARAMETRO_INVALIDO com o campo; peça inexistente ou fora de inspeção', async () => {
      const g = await garment()
      expect((await errOf(as(atend, 'public.register_inspection($1)', [JSON.stringify({ garmentId: g.id })])))?.message).toBe('ESTADO_INVALIDO')
      expect((await errOf(as(atend, 'public.register_inspection($1)', [JSON.stringify({ garmentId: 'x' })])))?.message).toBe('PECA_NAO_ENCONTRADA')
      await returned([g])
      const bad = (p: Record<string, unknown>) => errOf(inspect(g, p))
      expect(await bad({ findings: [{ label: 'x', severity: 'enorme' }] })).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'findings' })
      expect(await bad({ photos: [{ kind: 'frente' }] })).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'photos' })
      expect(await bad({ photos: [{ kind: 'dano', path: 'outra/peca.jpg' }] })).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'photos' })
      expect(await bad({ maintenanceKind: 'solda' })).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'maintenanceKind' })
      expect(await bad({ reservationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'reservationId' })
      // Foto com arquivo no bucket da peça é aceita.
      const ok = await inspect(g, { photos: [{ kind: 'dano', path: `${g.id}/dano.jpg` }], findings: [leve] })
      expect(ok.result).toBe('ressalva')
      expect((await history(g.id)).inspections[0]!.photos[0]).toMatchObject({ kind: 'dano', path: `${g.id}/dano.jpg` })
    })
  })

  describe('ordens e liberação', () => {
    it('concluir higienização com custo 58: conta paga de Higienização, economia e custo dos 30 dias', async () => {
      const g = await garment()
      await returned([g])
      await inspect(g)
      const m = (await history(g.id)).maintenances[0]!
      const before = (await queue()).costLast30d!
      const out = await close({ maintenanceId: m.id, cost: 58, provider: 'Tinturaria Aurora', note: 'Lavada e passada', release: true })
      expect(out.state).toBe('disponivel')
      expect(out.blocks.some((b) => b.maintenanceId === m.id)).toBe(false)
      expect((await history(g.id)).maintenances[0]).toMatchObject({ state: 'concluida', cost: 58, provider: 'Tinturaria Aurora', description: 'Higienização pós-locação · Lavada e passada' })
      expect(await payables(m.id)).toEqual([
        expect.objectContaining({ amount: 58, status: 'paga', source: 'operacao', key: 'higienizacao', supplier: 'Tinturaria Aurora', description: 'Higienização pós-locação · Lavada e passada' }),
      ])
      expect((await queue()).costLast30d).toBeCloseTo(before + 58, 2)
      expect(await costs(g.id)).toMatchObject({ cleaning: 58, maintenance: 0 })
      // A conta aparece em Contas a Pagar como despesa da Operação.
      const list = await as<{ rows: { maintenanceId: string | null; source: string }[] }>(admin, 'public.list_payables($1)', [
        JSON.stringify({ status: 'todas', categoryId: null, recurrence: 'todas', q: '', range: 'tudo' }),
      ])
      expect(list.rows.find((p) => p.maintenanceId === m.id)).toMatchObject({ source: 'operacao' })
      expect((await errOf(close({ maintenanceId: m.id, cost: 0 }))))?.toMatchObject({ message: 'ORDEM_JA_CONCLUIDA' })
    })

    it('custo inválido; custo zero não lança; sem fornecedor; concluir sem liberar mantém a peça na fila', async () => {
      const g = await garment()
      await returned([g])
      await inspect(g)
      const m = (await history(g.id)).maintenances[0]!
      expect(await errOf(close({ maintenanceId: m.id, cost: -1 }))).toMatchObject({ message: 'CUSTO_INVALIDO', detail: 'cost' })
      expect(await errOf(close({ maintenanceId: m.id, cost: '58' }))).toMatchObject({ message: 'CUSTO_INVALIDO', detail: 'cost' })
      expect((await errOf(close({ maintenanceId: '7c9e6679-7425-40de-944b-e07fc1f90ae7', cost: 1 })))?.message).toBe('ORDEM_NAO_ENCONTRADA')
      const out = await close({ maintenanceId: m.id, cost: 0 })
      expect(out.state).toBe('higienizacao')
      expect(await payables(m.id)).toEqual([])
      const row = (await queue()).higienizacao.find((x) => x.garment.id === g.id)!
      expect(row.order).toBeNull()
      const freed = await release(g.id, 'Pronta')
      expect(freed).toMatchObject({ state: 'disponivel' })
      expect(freed.history[0]!.reason).toBe('Pronta')
    })

    it('custo sem fornecedor lança "Sem fornecedor"; liberar encerra as ordens abertas; release na conclusão exige operacao.release', async () => {
      const g = await garment()
      await returned([g])
      await inspect(g, { findings: [leve], openRepair: true, maintenanceKind: 'ajuste' })
      const ms = (await history(g.id)).maintenances
      const ajuste = ms.find((m) => m.kind === 'ajuste')!
      const semRelease = await createUser(db, { email: 'sr@senzi.test', full_name: 'Sem Liberar', role: 'atendimento' })
      await deny(semRelease, 'operacao.release')
      expect((await errOf(close({ maintenanceId: ajuste.id, cost: 30, release: true }, semRelease)))?.message).toBe('SEM_PERMISSAO')
      await close({ maintenanceId: ajuste.id, cost: 30 }, semRelease)
      expect(await payables(ajuste.id)).toEqual([expect.objectContaining({ key: 'ajuste', supplier: 'Sem fornecedor', description: 'Barra (leve)' })])
      expect(await costs(g.id)).toMatchObject({ cleaning: 0, maintenance: 30 })
      const freed = await release(g.id)
      expect(freed.state).toBe('disponivel')
      expect((await history(g.id)).maintenances.every((m) => m.state === 'concluida')).toBe(true)
    })

    it('liberar: peça fora do ciclo ou ainda em inspeção → ESTADO_INVALIDO; inexistente → PECA_NAO_ENCONTRADA', async () => {
      const g = await garment()
      expect((await errOf(release(g.id)))?.message).toBe('ESTADO_INVALIDO')
      await returned([g])
      expect((await errOf(release(g.id)))?.message).toBe('ESTADO_INVALIDO')
      expect((await errOf(release('7c9e6679-7425-40de-944b-e07fc1f90ae7')))?.message).toBe('PECA_NAO_ENCONTRADA')
    })

    it('pendência registrada: reserva cancelada na própria janela de higienização deixa a peça em higienização até liberar', async () => {
      const g = await garment({ cleaningDays: 3 })
      const r = await confirmed([g], [-1, -1, -1])
      expect((await getGarment(g.id)).state).toBe('higienizacao')
      await as(atend, 'public.cancel_reservation($1, $2)', [r.id, 'Cliente desistiu'])
      expect((await getGarment(g.id)).state).toBe('higienizacao')
      expect((await queue()).higienizacao.find((x) => x.garment.id === g.id)).toMatchObject({ order: null })
      expect((await release(g.id)).state).toBe('disponivel')
    })

    it('atendimento: custos saem null (custo da ordem, custo dos 30 dias); maintenances_of de peça sem histórico é vazio', async () => {
      const q = await queue(atend)
      expect(q.costLast30d).toBeNull()
      expect(q.openOrders.every((o) => o.cost === null)).toBe(true)
      expect([...q.higienizacao, ...q.manutencao].every((r) => r.order === null || r.order.cost === null)).toBe(true)
      const g = await garment()
      expect(await history(g.id, atend)).toEqual({ maintenances: [], inspections: [] })
      expect((await errOf(asUser(db, atend, (tx) => tx.query('select * from public.garment_costs($1)', [[g.id]])))))?.toMatchObject({ message: 'SEM_PERMISSAO' })
    })
  })
})

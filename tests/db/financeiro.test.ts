import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type Cat = { id: string; name: string; type: string; color: string; isSystem: boolean; systemKey: string | null; archived: boolean; usageCount?: number }
type Payable = {
  id: string
  description: string
  supplier: string | null
  categoryId: string
  amount: number
  dueDate: string
  status: string
  paidAt: string | null
  paidAmount: number | null
  method: string | null
  recurrence: string
  recurrenceEnd: string | null
  recurrenceParentId: string | null
  source: string
  garmentId: string | null
  notes: string | null
  createdBy: string
}
type Receivable = {
  id: string
  source: string
  kind: string
  description: string
  categoryId: string | null
  reservationId: string | null
  reservationCode: string | null
  customerId: string | null
  customerName: string | null
  payerName: string | null
  amount: number
  paidAmount: number
  dueDate: string
  status: string
  receivedAt: string | null
  method: string | null
  isCustody: boolean
  notes: string | null
}
type List<T, K extends string> = { rows: T[]; total: number; totals: Record<K, number>; today: string }
type Overview = {
  range: string
  from: string
  to: string
  received: number
  receivedCount: number
  toReceive: number
  toReceiveReservations: number
  paid: number | null
  operatingCost: number | null
  operatingMargin: number | null
  acquisitionInvested: number | null
  result: number | null
  operatingResult: number | null
  custody: number
  monthly: { k: string; v: number; paid: number | null }[]
  byMethod: { method: string; label: string; total: number; count: number }[]
  receivableRows: { reservationId: string; code: string; customerName: string; pickupDate: string; devido: number; due: number }[]
  pendingCharges: { kind: string; customerName: string; notes: string | null; amount: number }[]
  latest: { paidAt: string; reservationId: string; code: string; kind: string; method: string; amount: number }[]
}
type Res = { id: string; code: string; state: string; totalNet: number; pickupDate: string; payments: { id: string; kind: string; state: string; amount: number }[] }

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
const RALL = { status: 'todas', origin: 'todas', categoryId: null, q: '', range: 'tudo' }
const PALL = { status: 'todas', categoryId: null, recurrence: 'todas', q: '', range: 'tudo' }
const round2 = (n: number) => Math.round(n * 100) / 100
const falta = (r: Receivable) => Math.max(0, round2(r.amount - r.paidAmount))

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

describe('financeiro', () => {
  let db: PGlite
  let admin: string
  let atend: string
  let gestor: string
  let today: string
  let cust: { id: string; fullName: string }
  let cat: Record<string, Cat>

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const D = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string; hint?: string }) => e)
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])

  const overview = (range = '30', user = admin) => as<Overview>(user, 'public.finance_overview($1)', [range])
  const receivables = (f: Record<string, unknown> = {}, user = admin) =>
    as<List<Receivable, 'open' | 'overdue' | 'dueIn7' | 'receivedInRange'>>(user, 'public.list_receivables($1)', [JSON.stringify({ ...RALL, ...f })])
  const payables = (f: Record<string, unknown> = {}, user = admin) =>
    as<List<Payable, 'open' | 'overdue' | 'dueIn7' | 'paidInRange'>>(user, 'public.list_payables($1)', [JSON.stringify({ ...PALL, ...f })])
  const categories = (user = admin) => as<Cat[]>(user, 'public.list_fin_categories()')
  const newReceivable = (p: Record<string, unknown>, user = admin) => as<Receivable>(user, 'public.create_receivable($1)', [JSON.stringify(p)])
  const newPayable = (p: Record<string, unknown>, user = admin) => as<Payable>(user, 'public.create_payable($1)', [JSON.stringify(p)])
  const pay = (id: string, p: Record<string, unknown>) => as<Payable>(admin, 'public.pay_payable($1, $2)', [id, JSON.stringify({ method: 'pix', ...p })])
  const family = async (root: string) =>
    (
      await db.query<{ due: string; status: string }>(
        `select due_date::text as due, status::text from public.payable where id = $1 or recurrence_parent_id = $1 order by due_date`,
        [root],
      )
    ).rows
  const garment = (name: string, extra: Record<string, unknown> = {}, user = admin) =>
    as<{ id: string; code: string; name: string }>(user, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, name, ...extra })])
  /** Reserva confirmada (sinal = metade) com uma peça nova, retirada daqui a `d` dias. */
  const confirmed = async (d: number) => {
    const g = await garment(`Vestido ${Math.random().toString(36).slice(2, 7)}`)
    const draft = await as<Res>(atend, 'public.create_reservation_draft($1, $2)', [
      JSON.stringify({ customerId: cust.id, pickupDate: D(d), eventDate: D(d + 1), returnDueDate: D(d + 2), eventType: 'Casamento', discount: 0, items: [{ garmentId: g.id, unitPrice: 450 }] }),
      null,
    ])
    await as(atend, 'public.sign_reservation_contract($1, $2)', [draft.id, JSON.stringify({ signedAt: today, signerName: 'Mariana Fontes', notes: null })])
    const res = await as<{ ok: boolean; reservation: Res }>(atend, 'public.confirm_reservation($1, $2, $3)', [
      draft.id,
      JSON.stringify({ amount: draft.totalNet / 2, method: 'pix', reference: null, notes: null }),
      null,
    ])
    if (!res.ok) throw new Error('confirmação recusada')
    return res.reservation
  }
  const payRes = (id: string, kind: string, amount: number, method = 'pix') =>
    as<Res>(atend, 'public.register_reservation_payment($1, $2)', [id, JSON.stringify({ kind, method, amount, reference: null, notes: null, refersTo: null })])

  beforeAll(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
    // Vê o consolidado (resultado, pago) mas não gere contas nem categorias.
    gestor = await createUser(db, { email: 'gil@senzi.test', full_name: 'Gil Gestor', role: 'admin' })
    await deny(gestor, 'financeiro.geral')
    today = (await db.query<{ d: string }>(`select public.store_today()::text d`)).rows[0].d
    cust = await as(admin, 'public.create_customer($1)', [
      JSON.stringify({ fullName: 'Mariana Fontes', phone: '63996124478', birthDate: '1995-03-10', cpf: '52998224725', email: 'mari@x.com' }),
    ])
    cat = Object.fromEntries((await categories()).map((c) => [c.systemKey ?? `${c.type}:${c.name}`, c]))
  }, 60000)

  afterAll(async () => {
    await db.close()
  })

  describe('permissões', () => {
    it('atendimento: visão geral sem os consolidados; contas, categorias e escritas → SEM_PERMISSAO', async () => {
      const o = await overview('30', atend)
      expect(o).toMatchObject({ paid: null, operatingCost: null, operatingMargin: null, acquisitionInvested: null, result: null, operatingResult: null })
      expect(o.monthly.every((m) => m.paid === null)).toBe(true)
      for (const sql of [
        `public.list_receivables('${JSON.stringify(RALL)}')`,
        `public.list_payables('${JSON.stringify(PALL)}')`,
        'public.list_fin_categories()',
        `public.create_receivable('{}')`,
        `public.create_payable('{}')`,
        `public.create_fin_category('{"name":"X","type":"receita"}')`,
      ])
        expect((await errOf(as(atend, sql)))?.message).toBe('SEM_PERMISSAO')
    })

    it('consolidado sem financeiro.geral: lista contas pagas, mas não a receber nem categorias', async () => {
      const o = await overview('30', gestor)
      expect(o.paid).not.toBeNull()
      expect((await payables({ status: 'pagas', range: '30' }, gestor)).rows).toBeDefined()
      expect((await errOf(receivables({}, gestor)))?.message).toBe('SEM_PERMISSAO')
      expect((await errOf(categories(gestor)))?.message).toBe('SEM_PERMISSAO')
      expect((await errOf(newPayable({ description: 'x' }, gestor)))?.message).toBe('SEM_PERMISSAO')
    })

    it('sem financeiro.view: nem a visão geral; anônimo não lê tabelas nem chama RPCs', async () => {
      const semView = await createUser(db, { email: 'sv@senzi.test', full_name: 'Sem View', role: 'atendimento' })
      await deny(semView, 'financeiro.view')
      expect((await errOf(overview('30', semView)))?.message).toBe('SEM_PERMISSAO')
      await expect(asAnon(db, (tx) => tx.query('select * from public.payable'))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(`select public.finance_overview('30')`))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query('select * from public.payable'))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query(`select public.payable_insert_auto('operacao', 'higienizacao', 'x', null, 10, null)`))).rejects.toThrow(
        /permission denied/,
      )
    })

    it('parâmetros inválidos → PARAMETRO_INVALIDO com o campo', async () => {
      expect(await errOf(overview('7'))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'range' })
      expect(await errOf(receivables({ status: 'x' }))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'status' })
      expect(await errOf(payables({ categoryId: 'fc-x' }))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'categoryId' })
    })
  })

  describe('categorias', () => {
    it('16 do sistema na ordem do cadastro, com contagem de uso; sistema protegido', async () => {
      const cats = await categories()
      expect(cats.slice(0, 4).map((c) => [c.name, c.type, c.systemKey])).toEqual([
        ['Locação', 'receita', 'locacao'],
        ['Venda de peça', 'receita', null],
        ['Outros', 'receita', null],
        ['Aquisição de acervo', 'despesa', 'aquisicao'],
      ])
      expect(cats.filter((c) => c.isSystem).map((c) => c.systemKey)).toEqual(['locacao', 'aquisicao', 'higienizacao', 'manutencao', 'ajuste'])
      expect(cats.every((c) => typeof c.usageCount === 'number')).toBe(true)
      expect(await errOf(as(admin, 'public.delete_fin_category($1)', [cat.locacao!.id]))).toMatchObject({ message: 'CATEGORIA_SISTEMA' })
      expect(await errOf(as(admin, 'public.update_fin_category($1, $2)', [cat.ajuste!.id, '{"name":"X"}']))).toMatchObject({ message: 'CATEGORIA_SISTEMA' })
      expect(await errOf(as(admin, 'public.archive_fin_category($1, $2)', [cat.ajuste!.id, true]))).toMatchObject({ message: 'CATEGORIA_SISTEMA' })
      expect(await errOf(as(admin, 'public.archive_fin_category($1, $2)', ['7c9e6679-7425-40de-944b-e07fc1f90ae7', true]))).toMatchObject({ message: 'NAO_ENCONTRADO' })
    })

    it('nome único por tipo (sem acento/caixa), mesmo nome em outro tipo vale; cor da paleta; arquivar some das escolhas; excluir sem uso', async () => {
      const create = (p: Record<string, unknown>) => as<Cat>(admin, 'public.create_fin_category($1)', [JSON.stringify(p)])
      expect(await errOf(create({ name: '  ', type: 'despesa' }))).toMatchObject({ message: 'NOME_CATEGORIA_OBRIGATORIO', detail: 'name' })
      expect(await errOf(create({ name: ' ALUGUEL ', type: 'despesa' }))).toMatchObject({ message: 'CATEGORIA_DUPLICADA', detail: 'name' })
      expect(await errOf(create({ name: 'locacao', type: 'receita' }))).toMatchObject({ message: 'CATEGORIA_DUPLICADA' })
      const c = await create({ name: ' Aluguel ', type: 'receita' })
      expect(c).toMatchObject({ name: 'Aluguel', type: 'receita', isSystem: false, systemKey: null, archived: false, color: '#7A2E3A' })
      expect((await categories()).at(-1)!.id).toBe(c.id)
      expect(await errOf(as(admin, 'public.update_fin_category($1, $2)', [c.id, '{"name":"venda de peça"}']))).toMatchObject({ message: 'CATEGORIA_DUPLICADA' })
      const renamed = await as<Cat>(admin, 'public.update_fin_category($1, $2)', [c.id, '{"name":"Sublocação","color":"#112233"}'])
      expect(renamed).toMatchObject({ name: 'Sublocação', color: '#112233' })
      expect((await as<Cat>(admin, 'public.archive_fin_category($1, $2)', [c.id, null])).archived).toBe(true)
      expect(await errOf(newReceivable({ description: 'x', categoryId: c.id, amount: 1, dueDate: today }))).toMatchObject({ message: 'CATEGORIA_OBRIGATORIA', detail: 'categoryId' })
      expect((await as<Cat>(admin, 'public.archive_fin_category($1, $2)', [c.id, false])).archived).toBe(false)
      await as(admin, 'public.delete_fin_category($1)', [c.id])
      expect((await categories()).some((x) => x.id === c.id)).toBe(false)
    })

    it('em uso: não exclui nem muda de tipo', async () => {
      const c = await as<Cat>(admin, 'public.create_fin_category($1)', ['{"name":"Seguro","type":"despesa"}'])
      await newPayable({ description: 'Seguro anual', categoryId: c.id, amount: 100, dueDate: D(5) })
      expect((await categories()).find((x) => x.id === c.id)!.usageCount).toBe(1)
      expect(await errOf(as(admin, 'public.delete_fin_category($1)', [c.id]))).toMatchObject({ message: 'CATEGORIA_EM_USO' })
      expect(await errOf(as(admin, 'public.update_fin_category($1, $2)', [c.id, '{"type":"receita"}']))).toMatchObject({ message: 'CATEGORIA_EM_USO', detail: 'type' })
    })
  })

  describe('contas a pagar', () => {
    it('valida como a fonte em memória: primeiro problema com o campo', async () => {
      const base = { description: 'Luz', categoryId: cat['despesa:Energia e água']!.id, amount: 100, dueDate: D(2) }
      expect(await errOf(newPayable({ ...base, description: ' ' }))).toMatchObject({ message: 'DESCRICAO_OBRIGATORIA', detail: 'description' })
      expect(await errOf(newPayable({ ...base, categoryId: cat.locacao!.id }))).toMatchObject({ message: 'CATEGORIA_OBRIGATORIA', detail: 'categoryId' })
      expect(await errOf(newPayable({ ...base, amount: 0 }))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
      expect(await errOf(newPayable({ ...base, dueDate: '' }))).toMatchObject({ message: 'VENCIMENTO_OBRIGATORIO', detail: 'dueDate' })
      expect(await errOf(newPayable({ ...base, recurrence: 'mensal', recurrenceEnd: D(1) }))).toMatchObject({ message: 'RECORRENCIA_FIM_INVALIDO', detail: 'recurrenceEnd' })
      expect(await errOf(newPayable({ ...base, paid: true }))).toMatchObject({ message: 'DATA_OBRIGATORIA', detail: 'paidAt' })
      expect(await errOf(newPayable({ ...base, paid: true, paidAt: D(1) }))).toMatchObject({ message: 'DATA_FUTURA', detail: 'paidAt' })
      expect(await errOf(newPayable({ ...base, recurrence: 'diaria' }))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'recurrence' })
    })

    it('baixa: valor > 0 (juros permitido), data não futura, só em aberto; já paga nasce paga (pix padrão)', async () => {
      const energia = cat['despesa:Energia e água']!.id
      const p = await newPayable({ description: ' Luz ', supplier: ' Energisa ', categoryId: energia, amount: 100, dueDate: D(2), notes: '' })
      expect(p).toMatchObject({ description: 'Luz', supplier: 'Energisa', status: 'aberta', source: 'manual', recurrence: 'nenhuma', notes: null, createdBy: admin, paidAt: null })
      expect(await errOf(pay(p.id, { paidAt: today, paidAmount: 0 }))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'paidAmount' })
      expect(await errOf(pay(p.id, { paidAt: D(1), paidAmount: 100 }))).toMatchObject({ message: 'DATA_FUTURA', detail: 'paidAt' })
      const paid = await pay(p.id, { paidAt: today, paidAmount: 103.5, notes: 'Com juros' })
      expect(paid).toMatchObject({ status: 'paga', paidAmount: 103.5, method: 'pix', notes: 'Com juros' })
      expect(paid.paidAt!.slice(0, 10)).toBe(today)
      expect(paid.paidAt).toMatch(/-03:00$/)
      expect(await errOf(pay(p.id, { paidAt: today, paidAmount: 1 }))).toMatchObject({ message: 'ESTADO_INVALIDO' })
      const agua = await newPayable({ description: 'Água', categoryId: energia, amount: 50, dueDate: today, paid: true, paidAt: D(-1) })
      expect(agua).toMatchObject({ status: 'paga', paidAmount: 50, method: 'pix' })
      expect(agua.paidAt!.slice(0, 10)).toBe(D(-1))
    })

    it('recorrência: pagar cria a próxima (mesma descrição e valor), fim de mês com âncora, data final e sem duplicar', async () => {
      const outros = cat['despesa:Outros']!.id
      const p = await newPayable({ description: 'Seguro', categoryId: outros, amount: 100, dueDate: '2026-01-31', recurrence: 'mensal' })
      await pay(p.id, { paidAt: today, paidAmount: 100 })
      let fam = await family(p.id)
      expect(fam).toEqual([
        { due: '2026-01-31', status: 'paga' },
        { due: '2026-02-28', status: 'aberta' },
      ])
      const { rows } = await db.query<{ id: string }>(`select id from public.payable where recurrence_parent_id = $1`, [p.id])
      const next = (await payables({ q: 'seguro' })).rows.find((x) => x.id === rows[0]!.id)!
      expect(next).toMatchObject({ description: 'Seguro', amount: 100, status: 'aberta', recurrence: 'mensal', recurrenceParentId: p.id, paidAt: null, paidAmount: null })
      await pay(next.id, { paidAt: today, paidAmount: 100 })
      fam = await family(p.id)
      expect(fam.map((f) => f.due)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])

      const w = await newPayable({ description: 'Faxina', categoryId: outros, amount: 80, dueDate: '2026-01-31', recurrence: 'mensal', recurrenceEnd: '2026-02-28', paid: true, paidAt: today })
      fam = await family(w.id)
      expect(fam).toEqual([
        { due: '2026-01-31', status: 'paga' },
        { due: '2026-02-28', status: 'aberta' },
      ])
      const second = (await db.query<{ id: string }>(`select id from public.payable where recurrence_parent_id = $1`, [w.id])).rows[0]!.id
      await pay(second, { paidAt: today, paidAmount: 80 })
      expect(await family(w.id)).toHaveLength(2)

      const s = await newPayable({ description: 'Feira', categoryId: outros, amount: 10, dueDate: '2026-03-02', recurrence: 'semanal' })
      await pay(s.id, { paidAt: today, paidAmount: 10 })
      const a = await newPayable({ description: 'Anuidade', categoryId: outros, amount: 10, dueDate: '2024-02-29', recurrence: 'anual' })
      await pay(a.id, { paidAt: today, paidAmount: 10 })
      expect((await family(s.id)).map((f) => f.due)).toEqual(['2026-03-02', '2026-03-09'])
      expect((await family(a.id)).map((f) => f.due)).toEqual(['2024-02-29', '2025-02-28'])
    })

    it('editar só a manual em aberto (parcial; recorrência "nenhuma" limpa a data final); excluir só manual', async () => {
      const outros = cat['despesa:Outros']!.id
      const m = await newPayable({ description: 'Café', categoryId: outros, amount: 20, dueDate: D(1), recurrence: 'mensal', recurrenceEnd: D(60) })
      expect(m.recurrenceEnd).toBe(D(60))
      const e = await as<Payable>(admin, 'public.update_payable($1, $2)', [m.id, JSON.stringify({ amount: 25, supplier: null, recurrence: 'nenhuma' })])
      expect(e).toMatchObject({ description: 'Café', amount: 25, recurrence: 'nenhuma', recurrenceEnd: null })
      expect(await errOf(as(admin, 'public.update_payable($1, $2)', [m.id, JSON.stringify({ categoryId: cat.locacao!.id })]))).toMatchObject({
        message: 'CATEGORIA_OBRIGATORIA',
      })
      const g = await garment('Vestido Compra')
      const auto = (await payables({ q: 'compra da peca' })).rows.find((p) => p.garmentId === g.id)!
      expect(await errOf(as(admin, 'public.update_payable($1, $2)', [auto.id, '{"amount":1}']))).toMatchObject({ message: 'ESTADO_INVALIDO' })
      expect(await errOf(as(admin, 'public.delete_payable($1)', [auto.id]))).toMatchObject({ message: 'ESTADO_INVALIDO' })
      await pay(m.id, { paidAt: today, paidAmount: 25 })
      expect(await errOf(as(admin, 'public.update_payable($1, $2)', [m.id, '{"amount":1}']))).toMatchObject({ message: 'ESTADO_INVALIDO' })
      await as(admin, 'public.delete_payable($1)', [m.id])
      expect(await errOf(as(admin, 'public.delete_payable($1)', [m.id]))).toMatchObject({ message: 'NAO_ENCONTRADO' })
    })

    it('lista: filtros, ordem e totais', async () => {
      const mkt = cat['despesa:Marketing']!.id
      const v1 = await newPayable({ description: 'Panfletos', supplier: 'Gráfica Ágil', categoryId: mkt, amount: 30, dueDate: D(-3) })
      const v2 = await newPayable({ description: 'Anúncio', categoryId: mkt, amount: 70, dueDate: D(3) })
      const abertas = await payables({ status: 'abertas' })
      expect(abertas.rows.every((p) => p.status === 'aberta')).toBe(true)
      expect(abertas.rows.map((p) => p.dueDate)).toEqual([...abertas.rows.map((p) => p.dueDate)].sort())
      expect(abertas.totals.open).toBe(round2(abertas.rows.reduce((s, p) => s + p.amount, 0)))
      expect(abertas.total).toBe(abertas.rows.length)
      expect(abertas.today).toBe(today)
      const venc = await payables({ status: 'vencidas' })
      expect(venc.rows.every((p) => p.dueDate < today)).toBe(true)
      expect(venc.rows.map((p) => p.id)).toContain(v1.id)
      expect(venc.totals.overdue).toBe(round2(venc.rows.reduce((s, p) => s + p.amount, 0)))
      const byCat = await payables({ categoryId: mkt })
      expect(byCat.rows.map((p) => p.id)).toEqual([v2.id, v1.id])
      expect((await payables({ q: 'grafica agil' })).rows.map((p) => p.id)).toEqual([v1.id])
      expect((await payables({ recurrence: 'recorrente' })).rows.every((p) => p.recurrence !== 'nenhuma')).toBe(true)
      expect((await payables({ recurrence: 'unica' })).rows.every((p) => p.recurrence === 'nenhuma')).toBe(true)
      const pagas = await payables({ status: 'pagas', range: '30' })
      expect(pagas.rows.every((p) => p.status === 'paga' && p.paidAt!.slice(0, 10) >= D(-29))).toBe(true)
      expect(pagas.rows.map((p) => p.paidAt)).toEqual([...pagas.rows.map((p) => p.paidAt)].sort().reverse())
      expect(pagas.totals.paidInRange).toBe(round2(pagas.rows.reduce((s, p) => s + (p.paidAmount ?? p.amount), 0)))
      const todas = await payables()
      expect(todas.rows.map((p) => p.dueDate)).toEqual([...todas.rows.map((p) => p.dueDate)].sort().reverse())
    })
  })

  describe('compra da peça e despesas automáticas', () => {
    it('create_garment com custo > 0 lança a conta paga "Compra da peça — <nome>" em Aquisição de acervo', async () => {
      const g = await garment('Vestido Lisboa', { acquisitionCost: 1234.5 })
      const p = (await payables({ q: 'Lisboa' })).rows
      expect(p).toHaveLength(1)
      expect(p[0]).toMatchObject({
        description: 'Compra da peça — Vestido Lisboa',
        supplier: 'Aquisição de acervo',
        categoryId: cat.aquisicao!.id,
        amount: 1234.5,
        paidAmount: 1234.5,
        dueDate: today,
        status: 'paga',
        source: 'aquisicao',
        garmentId: g.id,
        method: null,
        recurrence: 'nenhuma',
      })
      expect(p[0]!.paidAt!.slice(0, 10)).toBe(today)
      const { rows } = await db.query(`select 1 from public.audit_log where table_name = 'payable' and row_id = $1 and action = 'insert'`, [p[0]!.id])
      expect(rows).toHaveLength(1)
    })

    it('sem custo, custo 0 ou sem acervo.cost (custo ignorado) não lança nada', async () => {
      await garment('Vestido Zero', { acquisitionCost: 0 })
      await garment('Vestido Nulo', { acquisitionCost: null })
      const semCusto = await createUser(db, { email: 'sc@senzi.test', full_name: 'Sem Custo', role: 'admin' })
      await deny(semCusto, 'acervo.cost')
      await garment('Vestido Oculto', { acquisitionCost: 500 }, semCusto)
      const { rows } = await db.query(`select description from public.payable where description in ('Compra da peça — Vestido Zero', 'Compra da peça — Vestido Nulo', 'Compra da peça — Vestido Oculto')`)
      expect(rows).toEqual([])
    })

    it('payable_insert_auto (área 5): despesa da Operação paga e somente leitura, no custo operacional', async () => {
      const g = await garment('Vestido Operado', { acquisitionCost: null })
      const before = (await overview('30'))!
      const { rows } = await db.query<{ id: string }>(
        `select public.payable_insert_auto('operacao', 'higienizacao', 'Lavagem a seco', 'Lavanderia Branca Neve', 85, $1, null, null, 'pix') as id`,
        [g.id],
      )
      const id = rows[0]!.id
      const p = (await payables({ q: 'Lavagem a seco' })).rows.find((x) => x.id === id)!
      expect(p).toMatchObject({ source: 'operacao', status: 'paga', categoryId: cat.higienizacao!.id, amount: 85, paidAmount: 85, method: 'pix', garmentId: g.id, dueDate: today })
      const after = await overview('30')
      expect(after.operatingCost).toBe(round2(before.operatingCost! + 85))
      expect(after.paid).toBe(round2(before.paid! + 85))
      expect(await errOf(as(admin, 'public.delete_payable($1)', [id]))).toMatchObject({ message: 'ESTADO_INVALIDO' })
      const zero = await db.query<{ id: string | null }>(`select public.payable_insert_auto('operacao', 'ajuste', 'x', null, 0, null) as id`)
      expect(zero.rows[0]!.id).toBeNull()
      await expect(db.query(`select public.payable_insert_auto('operacao', 'locacao', 'x', null, 1, null)`)).rejects.toThrow('PARAMETRO_INVALIDO')
      await expect(db.query(`select public.payable_insert_auto('manual', 'ajuste', 'x', null, 1, null)`)).rejects.toThrow('PARAMETRO_INVALIDO')
    })
  })

  describe('contas a receber', () => {
    it('parcelas da reserva: sinal pago, saldo aberto na retirada, caução em custódia e fora dos totais', async () => {
      const r = await confirmed(20)
      await payRes(r.id, 'caucao', 300, 'dinheiro')
      const all = (await receivables()).rows.filter((x) => x.reservationId === r.id)
      // "Todas" vem pelo vencimento, o mais recente antes: o saldo (retirada) e depois sinal e caução (hoje, na ordem do lançamento).
      expect(all.map((x) => [x.kind, x.status, x.description])).toEqual([
        ['saldo', 'aberto', `Saldo · ${r.code}`],
        ['sinal', 'pago', `Sinal · ${r.code}`],
        ['caucao', 'pago', `Caução · ${r.code}`],
      ])
      const sinal = all.find((x) => x.kind === 'sinal')!
      expect(sinal).toMatchObject({ source: 'reserva', categoryId: cat.locacao!.id, customerName: 'Mariana Fontes', reservationCode: r.code, paidAmount: 225, dueDate: today, method: 'pix', isCustody: false })
      expect(sinal.receivedAt).toMatch(/-03:00$/)
      const saldo = all.find((x) => x.kind === 'saldo')!
      expect(saldo).toMatchObject({ dueDate: r.pickupDate, paidAmount: 0, receivedAt: null, method: null })
      const caucao = all.find((x) => x.kind === 'caucao')!
      expect(caucao).toMatchObject({ isCustody: true, categoryId: null, method: 'dinheiro' })

      const open = await receivables({ status: 'abertas' })
      expect(open.rows.some((x) => x.isCustody)).toBe(false)
      expect(open.rows.map((x) => x.id)).toContain(saldo.id)
      expect(open.totals.open).toBe(round2(open.rows.reduce((s, x) => s + falta(x), 0)))
      expect((await receivables({ origin: 'avulsas' })).rows.every((x) => x.source === 'avulso')).toBe(true)
      expect((await receivables({ origin: 'reservas', q: r.code.toLowerCase() })).rows.map((x) => x.kind).sort()).toEqual(['caucao', 'saldo', 'sinal'])
      expect((await receivables({ q: 'mariana' })).rows.length).toBeGreaterThan(0)

      // A parcela da reserva não se edita nem se baixa aqui.
      for (const sql of ['public.update_receivable($1, \'{}\')', `public.receive_receivable($1, '{"amount":1,"receivedAt":"${today}","method":"pix"}')`, 'public.cancel_receivable($1)'])
        expect((await errOf(as(admin, sql, [saldo.id])))?.message).toBe('ESTADO_INVALIDO')
      expect((await errOf(as(admin, 'public.cancel_receivable($1)', ['7c9e6679-7425-40de-944b-e07fc1f90ae7'])))?.message).toBe('NAO_ENCONTRADO')
    })

    it('reserva cancelada: pendência vira cancelado e sai das abertas; retenção de caução é avulso pago com a reserva', async () => {
      const r = await confirmed(25)
      await payRes(r.id, 'caucao', 200)
      await as(atend, 'public.cancel_reservation($1, $2)', [r.id, 'Cliente desistiu'])
      const rows = (await receivables()).rows.filter((x) => x.reservationId === r.id && x.source === 'reserva')
      expect(rows.filter((x) => x.kind === 'saldo').map((x) => x.status)).toEqual(rows.some((x) => x.kind === 'saldo') ? ['cancelado'] : [])
      expect((await receivables({ status: 'abertas' })).rows.some((x) => x.reservationId === r.id)).toBe(false)
      await as(atend, 'public.return_reservation_deposit($1, $2, $3)', [r.id, 'pix', JSON.stringify({ amount: 50, reason: 'Mancha' })])
      const ret = (await receivables({ origin: 'avulsas', q: 'retencao' })).rows.find((x) => x.reservationId === r.id)!
      expect(ret).toMatchObject({
        source: 'avulso',
        kind: 'avulso',
        description: `Retenção de caução · ${r.code}`,
        reservationCode: r.code,
        customerName: 'Mariana Fontes',
        amount: 50,
        paidAmount: 50,
        status: 'pago',
        categoryId: cat.locacao!.id,
        notes: 'Mancha',
        isCustody: false,
      })
    })

    it('avulso: criar valida, receber parcial/total (excede saldo com o quanto falta), data futura, editar e cancelar', async () => {
      const venda = cat['receita:Venda de peça']!.id
      const base = { description: 'Venda de clutch', categoryId: venda, amount: 100, dueDate: D(3) }
      expect(await errOf(newReceivable({ ...base, description: ' ' }))).toMatchObject({ message: 'DESCRICAO_OBRIGATORIA', detail: 'description' })
      expect(await errOf(newReceivable({ ...base, categoryId: cat.aquisicao!.id }))).toMatchObject({ message: 'CATEGORIA_OBRIGATORIA', detail: 'categoryId' })
      expect(await errOf(newReceivable({ ...base, amount: 0 }))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
      expect(await errOf(newReceivable({ ...base, dueDate: '' }))).toMatchObject({ message: 'VENCIMENTO_OBRIGATORIO', detail: 'dueDate' })
      expect(await errOf(newReceivable({ ...base, received: true, receivedAt: D(1) }))).toMatchObject({ message: 'DATA_FUTURA', detail: 'receivedAt' })
      expect(await errOf(newReceivable({ ...base, customerId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }))).toMatchObject({ message: 'NAO_ENCONTRADO' })

      const r = await newReceivable({ ...base, payerName: ' Cliente de passagem ', notes: ' ' })
      expect(r).toMatchObject({ status: 'aberto', source: 'avulso', kind: 'avulso', payerName: 'Cliente de passagem', customerId: null, notes: null, paidAmount: 0 })
      const receive = (p: Record<string, unknown>) => as<Receivable>(admin, 'public.receive_receivable($1, $2)', [r.id, JSON.stringify({ method: 'pix', ...p })])
      expect(await errOf(receive({ amount: 101, receivedAt: today }))).toMatchObject({ message: 'VALOR_EXCEDE_SALDO', detail: 'amount', hint: 'R$ 100,00' })
      expect(await errOf(receive({ amount: 50, receivedAt: D(1) }))).toMatchObject({ message: 'DATA_FUTURA', detail: 'receivedAt' })
      const part = await receive({ amount: 40, receivedAt: today })
      expect(part).toMatchObject({ status: 'parcial', paidAmount: 40, method: 'pix' })
      expect(await errOf(as(admin, 'public.update_receivable($1, $2)', [r.id, '{"amount":30}']))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
      const ed = await as<Receivable>(admin, 'public.update_receivable($1, $2)', [r.id, JSON.stringify({ description: 'Venda da clutch', customerId: cust.id, notes: 'Mostruário' })])
      expect(ed).toMatchObject({ description: 'Venda da clutch', customerId: cust.id, customerName: 'Mariana Fontes', payerName: 'Cliente de passagem', notes: 'Mostruário', amount: 100 })
      expect((await as<Receivable>(admin, 'public.update_receivable($1, $2)', [r.id, '{"amount":40}'])).status).toBe('pago')
      expect(await errOf(as(admin, 'public.cancel_receivable($1)', [r.id]))).toMatchObject({ message: 'ESTADO_INVALIDO' })

      const r2 = await newReceivable({ ...base, customerId: cust.id, payerName: 'Ignorado', received: true, receivedAt: D(-2), method: 'credito' })
      expect(r2).toMatchObject({ status: 'pago', paidAmount: 100, method: 'credito', customerName: 'Mariana Fontes', payerName: null })
      expect(r2.receivedAt!.slice(0, 10)).toBe(D(-2))
      const r3 = await newReceivable({ ...base, description: 'Consultoria', dueDate: D(-4) })
      const venc = await receivables({ status: 'vencidas' })
      expect(venc.rows.map((x) => x.id)).toContain(r3.id)
      expect(venc.rows.every((x) => x.dueDate < today && x.status !== 'pago')).toBe(true)
      expect(venc.totals.overdue).toBeGreaterThanOrEqual(100)
      expect((await as<Receivable>(admin, 'public.cancel_receivable($1)', [r3.id])).status).toBe('cancelado')
      const rec = await receivables({ status: 'recebidas', range: '30' })
      expect(rec.rows.every((x) => x.status === 'pago')).toBe(true)
      expect(rec.rows.map((x) => x.receivedAt)).toEqual([...rec.rows.map((x) => x.receivedAt)].sort().reverse())
    })
  })

  describe('visão geral', () => {
    it('recebido, custódia e resultado em regime de caixa; consolidados só com financeiro.consolidated', async () => {
      const r = await confirmed(30)
      await payRes(r.id, 'caucao', 150, 'debito')
      const o = await overview('90')
      const { rows: pays } = await db.query<{ kind: string; amount: string; refers_to: string | null }>(
        `select kind::text, amount, refers_to from public.reservation_payment where state = 'pago' and public.store_day(paid_at) >= $1`,
        [D(-89)],
      )
      const { rows: loose } = await db.query<{ v: string | null }>(`select sum(paid_amount) v from public.receivable where paid_amount > 0 and public.store_day(received_at) >= $1`, [D(-89)])
      let exp = Number(loose[0]!.v ?? 0)
      for (const p of pays) {
        if (['sinal', 'saldo', 'integral', 'multa'].includes(p.kind)) exp += Number(p.amount)
        if (p.kind === 'estorno' && p.refers_to !== 'caucao') exp -= Number(p.amount)
      }
      expect(o.received).toBe(round2(exp))
      expect(o.received).toBeGreaterThan(0)
      expect(o).toMatchObject({ range: '90', from: D(-89), to: today })
      const { rows: cust } = await db.query<{ v: string }>(
        `select coalesce(sum(m.caucao), 0) v from public.reservation r cross join lateral public.reservation_money(r.id) m where r.state <> 'rascunho'`,
      )
      expect(o.custody).toBe(Number(cust[0]!.v))
      expect(o.custody).toBeGreaterThanOrEqual(150)
      expect(o.result).toBe(round2(o.received - o.paid!))
      expect(o.operatingResult).toBe(round2(o.received - (o.paid! - o.acquisitionInvested!)))
      expect(o.acquisitionInvested).toBeGreaterThan(0)
      expect(o.operatingMargin).toBeCloseTo(1 - o.operatingCost! / o.received, 10)
      expect(o.monthly).toHaveLength(12)
      expect(o.monthly[11]!.k).toBe(today.slice(0, 7))
      expect(o.monthly[11]!.v).toBe((await overview('30')).monthly[11]!.v)
      expect(o.byMethod.find((m) => m.method === 'pix')).toMatchObject({ label: 'PIX' })
      expect(o.byMethod.map((m) => m.total)).toEqual([...o.byMethod.map((m) => m.total)].sort((a, b) => b - a))
      expect(o.byMethod.some((m) => m.method === 'debito')).toBe(false)
      const last = o.latest.find((l) => l.reservationId === r.id && l.kind === 'caucao')!
      expect(last).toMatchObject({ code: r.code, method: 'debito', amount: 150 })
      expect(o.latest.map((l) => l.paidAt)).toEqual([...o.latest.map((l) => l.paidAt)].sort().reverse())
    })

    it('"a receber" é um número só: visão geral = contas a receber; reservas = reservation_summary = Σ linhas', async () => {
      const r = await confirmed(35)
      const o = await overview('30')
      const rec = await receivables()
      const sum = await as<{ toReceive: number }>(admin, 'public.reservation_summary()')
      const avulsos = round2(rec.rows.filter((x) => x.source === 'avulso' && (x.status === 'aberto' || x.status === 'parcial')).reduce((s, x) => s + falta(x), 0))
      expect(o.toReceive).toBe(rec.totals.open)
      expect(o.toReceiveReservations).toBe(sum.toReceive)
      expect(round2(o.toReceive - avulsos)).toBe(sum.toReceive)
      expect(round2(o.receivableRows.reduce((s, x) => s + x.due, 0))).toBe(o.toReceiveReservations)
      const row = o.receivableRows.find((x) => x.reservationId === r.id)!
      expect(row).toMatchObject({ code: r.code, customerName: 'Mariana Fontes', pickupDate: r.pickupDate, devido: r.totalNet, due: round2(r.totalNet / 2) })
      expect(o.receivableRows.map((x) => x.pickupDate)).toEqual([...o.receivableRows.map((x) => x.pickupDate)].sort())
      const { rows } = await db.query<{ v: string }>(`select coalesce(sum(public.reservation_open_due(id)), 0) v from public.reservation`)
      expect(o.toReceiveReservations).toBe(Number(rows[0]!.v))

      // Pagar o saldo tira a reserva das linhas.
      await payRes(r.id, 'saldo', round2(r.totalNet / 2))
      expect((await overview('30')).receivableRows.some((x) => x.reservationId === r.id)).toBe(false)
    })
  })
})

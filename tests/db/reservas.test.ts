import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type Payment = { id: string; kind: string; method: string; amount: number; state: string; paidAt: string | null; dueAt: string | null; reference: string | null; notes: string | null; refersTo: string | null }
type Item = { id: string; garmentId: string; unitPrice: number; itemDiscount: number; allocatedOrderDiscount: number; netRevenue: number; itemState: string; pickupNote: string | null; returnNote: string | null }
type Contract = { number: string; version: number; bodyRendered: string; signedAt: string | null; signerName: string | null; terms: { lateFeeDailyPercent: number; deposit: number } }
type Hist = { fromState: string | null; toState: string; reason: string | null; userName: string }
type Auth = { id: string; kind: string; amount: number; reservationId: string; authorizedByName: string; refType: string }
type Res = {
  id: string
  code: string
  state: string
  customerId: string
  eventDate: string | null
  pickupDate: string
  returnDueDate: string
  pickedUpAt: string | null
  returnedAt: string | null
  totalGross: number
  discount: number
  totalNet: number
  lateFee: number
  cancelReason: string | null
  fittingId: string | null
  createdAt: string
  items: Item[]
  payments: Payment[]
  contract: Contract | null
  authorizations: Auth[]
  history: Hist[]
  balance: { devido: number; pago: number; caucao: number; due: number; status: string }
}
type Conflict = { kind: string; label: string; from: string; to: string; reservationCode: string | null; draft: boolean }
type Avail = { garmentId: string; ok: boolean; conflicts: Conflict[]; reason: string | null; window: { from: string; to: string; cleaningDays: number } }
type Detail = Res & { customer: { id: string; cpf: string }; garments: { id: string; code: string }[]; conflicts: Avail[]; fittingCode: string | null; fittingDate: string | null; minSignal: number; depositSuggested: number }
type Row = { id: string; code: string; state: string; customerName: string; garments: { code: string; shortName: string }[]; daysLate: number; payStatus: string | null; totalNet: number; due: number; pickupDate: string }
type Block = { id: string; kind: string; from: string; to: string; reservationId: string | null }
type Garment = { id: string; code: string; name: string; state: string; blocks: Block[]; history: { reason: string; to: string }[] }

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

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

describe('reservas', () => {
  let db: PGlite
  let admin: string
  let atend: string
  let today: string
  let cust: { id: string; fullName: string }
  let turim: Garment
  let napoles: Garment
  let siena: Garment

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const D = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string; hint?: string }) => e)
  const garment = (name: string, extra: Record<string, unknown> = {}) =>
    as<Garment>(admin, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, name, ...extra })])
  const getGarment = (id: string) => as<Garment>(admin, 'public.get_garment($1)', [id])
  const input = (gs: Garment[], d: [number, number, number], extra: Record<string, unknown> = {}) => ({
    customerId: cust.id,
    pickupDate: D(d[0]),
    eventDate: D(d[1]),
    returnDueDate: D(d[2]),
    eventType: 'Casamento',
    discount: 0,
    items: gs.map((g) => ({ garmentId: g.id, unitPrice: 450 })),
    ...extra,
  })
  const draft = (p: Record<string, unknown>, exc: string | null = null, user = atend) =>
    as<Res>(user, 'public.create_reservation_draft($1, $2)', [JSON.stringify(p), exc])
  const get = (id: string, user = atend) => as<Detail | null>(user, 'public.get_reservation($1)', [id])
  const sign = (id: string, user = atend) =>
    as<Res>(user, 'public.sign_reservation_contract($1, $2)', [id, JSON.stringify({ signedAt: today, signerName: 'Mariana Fontes', notes: null })])
  const confirm = (id: string, amount: number, exc: string | null = null, user = atend) =>
    as<{ ok: boolean; reservation?: Res; conflicts?: Avail[] }>(user, 'public.confirm_reservation($1, $2, $3)', [
      id,
      JSON.stringify({ amount, method: 'pix', reference: 'E2E123', notes: null }),
      exc,
    ])
  const pay = (id: string, kind: string, amount: number, refersTo: string | null = null, method = 'pix') =>
    as<Res>(atend, 'public.register_reservation_payment($1, $2)', [id, JSON.stringify({ kind, method, amount, reference: null, notes: null, refersTo })])
  const pickup = (id: string, decisions: unknown[], exc: string | null = null) =>
    as<Res>(atend, 'public.pickup_reservation_items($1, $2, $3)', [id, JSON.stringify(decisions), exc])
  const giveBack = (id: string, decisions: unknown[]) => as<Res>(atend, 'public.return_reservation_items($1, $2)', [id, JSON.stringify(decisions)])
  const cancel = (id: string, reason: string) => as<Res>(atend, 'public.cancel_reservation($1, $2)', [id, reason])
  const deposit = (id: string, method: string, retain: unknown = null) =>
    as<Res>(atend, 'public.return_reservation_deposit($1, $2, $3)', [id, method, retain === null ? null : JSON.stringify(retain)])
  const authorize = async (kind: string, refType: string, refId: string | null, user = atend, maxAmount: number | null = null) => {
    const r = await as<{ ok: boolean; id?: string; error?: string }>(user, `public.authorize_exception('ana@senzi.test', '1234', $1, 'Cliente antiga', $2, $3, $4)`, [kind, refType, refId, maxAmount])
    if (!r.ok) throw new Error(r.error)
    return r.id!
  }
  /** Rascunho assinado e confirmado (padrão: sinal mínimo de 50%). */
  const confirmed = async (gs: Garment[], d: [number, number, number], amount?: (net: number) => number) => {
    const r = await draft(input(gs, d))
    await sign(r.id)
    const res = await confirm(r.id, amount ? amount(r.totalNet) : r.totalNet / 2)
    if (!res.ok) throw new Error('confirmação recusada')
    return res.reservation!
  }
  const appts = async (resId: string) =>
    (
      await db.query<{ kind: string; at: string; state: string; title: string; garment_id: string | null }>(
        `select kind::text, public.store_instant(starts_at) as at, state::text, title, garment_id from public.appointment where reservation_id = $1 order by starts_at`,
        [resId],
      )
    ).rows

  beforeAll(async () => {
    // Um banco só por arquivo: cada teste trabalha em peças e datas próprias.
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
    await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('1234')`))
    today = (await db.query<{ d: string }>(`select public.store_today()::text d`)).rows[0].d
    cust = await as(admin, 'public.create_customer($1)', [
      JSON.stringify({ fullName: 'Mariana Fontes', phone: '63996124478', birthDate: '1995-03-10', cpf: '52998224725', email: 'mari@x.com' }),
    ])
  }, 60000)

  beforeEach(async () => {
    const n = Math.random().toString(36).slice(2, 7)
    turim = await garment(`Vestido Turim ${n}`)
    napoles = await garment(`Vestido Nápoles ${n}`)
    siena = await garment(`Vestido Siena ${n}`)
  })

  afterAll(async () => {
    await db.close()
  })

  describe('rascunho', () => {
    it('cria com conflito sem bloquear a peça: código, contrato v1 (Senzi Club, CPF, valores) e conflitos na ficha', async () => {
      await as(atend, 'public.block_garment($1, $2, $3, $4)', [turim.id, D(12), D(12), 'Editorial'])
      const r = await draft(input([turim], [11, 12, 13]))
      expect(r.state).toBe('rascunho')
      expect(r.code).toMatch(new RegExp(`^RS-${today.slice(0, 4)}-\\d{4}$`))
      expect(r.contract).toMatchObject({ number: r.code.replace('RS', 'CT'), version: 1, signedAt: null, terms: { lateFeeDailyPercent: 20, deposit: 0 } })
      const body = r.contract!.bodyRendered
      expect(body).toContain(`CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº ${r.code.replace('RS', 'CT')}`)
      expect(body).toContain('LOCATÁRIA: Mariana Fontes — CPF 529.982.247-25')
      expect(body).toContain('Telefone: (63) 99612-4478 · mari@x.com')
      expect(body).toContain(`• ${turim.code} — ${turim.name} (Verde, tam. 38) — R$ 450,00`)
      expect(body).toContain('Valor de referência do acervo cedido: R$ 2.000,00.')
      expect(body).toContain('Sinal: R$ 225,00 · Saldo: R$ 225,00 até a retirada.')
      expect(body).toContain('multa diária de 20% sobre o valor da locação')
      expect(body.split('\n').at(-2)).toBe(`Mariana Fontes${' '.repeat(26)}Senzi Club`)
      expect(r.history).toEqual([expect.objectContaining({ fromState: null, toState: 'rascunho', reason: 'Reserva criada', userName: 'Bia Atendimento' })])
      expect(r.balance).toEqual({ devido: 450, pago: 0, caucao: 0, due: 450, status: 'nao_pago' })

      const g = await getGarment(turim.id)
      expect(g.state).toBe('disponivel')
      expect(g.blocks.filter((b) => b.reservationId)).toEqual([])
      const d = (await get(r.id))!
      expect(d.conflicts).toHaveLength(1)
      expect(d.conflicts[0]!.conflicts).toEqual([expect.objectContaining({ kind: 'bloqueio_manual', label: 'Bloqueio manual', from: D(12), to: D(12), draft: false })])
      expect(d.garments.map((x) => x.id)).toEqual([turim.id])
      expect(d).toMatchObject({ minSignal: 225, depositSuggested: 200, fittingCode: null })

      // Outro rascunho com a mesma peça é só aviso (draft: true).
      const other = await draft(input([turim], [14, 14, 15]))
      const [a] = await as<Avail[]>(atend, 'public.check_availability($1, $2, $3, $4)', [[turim.id], D(14), D(15), null])
      expect(a!.conflicts.map((c) => [c.kind, c.label, c.draft, c.reservationCode])).toEqual([
        ['locacao', 'Rascunho', true, r.code],
        ['locacao', 'Rascunho', true, other.code],
      ])
      const [ign] = await as<Avail[]>(atend, 'public.check_availability($1, $2, $3, $4)', [[turim.id], D(14), D(15), other.id])
      expect(ign!.conflicts.map((c) => c.reservationCode)).toEqual([r.code])
      expect(ign!.window).toEqual({ from: D(14), to: D(17), cleaningDays: 2 })
    })

    it('valida como a fonte em memória: primeiro problema com o campo; desconto maior que o bruto com o texto', async () => {
      const bad = { customerId: '', eventDate: '', pickupDate: D(-5), returnDueDate: D(-7), discount: -1, items: [] }
      expect(await errOf(draft(bad))).toMatchObject({ message: 'RESERVA_SEM_CLIENTE', detail: 'customerId' })
      const base = input([turim], [3, 4, 5])
      expect(await errOf(draft({ ...base, items: [] }))).toMatchObject({ message: 'RESERVA_SEM_PECAS', detail: 'items' })
      expect(await errOf(draft({ ...base, items: [...base.items, ...base.items] }))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'items' })
      expect(await errOf(draft({ ...base, eventDate: '' }))).toMatchObject({ message: 'DATA_EVENTO_OBRIGATORIA', detail: 'eventDate' })
      expect(await errOf(draft({ ...base, returnDueDate: D(2) }))).toMatchObject({ message: 'DEVOLUCAO_ANTES_RETIRADA', detail: 'returnDueDate' })
      expect(await errOf(draft({ ...base, eventDate: D(2) }))).toMatchObject({ message: 'EVENTO_ANTES_RETIRADA', detail: 'eventDate' })
      expect(await errOf(draft({ ...base, eventDate: D(6) }))).toMatchObject({ message: 'EVENTO_DEPOIS_DEVOLUCAO', detail: 'eventDate' })
      expect(await errOf(draft(input([turim], [-2, 4, 5])))).toMatchObject({ message: 'RETIRADA_NO_PASSADO', detail: 'pickupDate' })
      expect(await errOf(draft({ ...base, discount: 451 }))).toMatchObject({
        message: 'DESCONTO_MAIOR_QUE_BRUTO',
        detail: 'discount',
        hint: 'O desconto (R$ 451,00) é maior que o valor das peças (R$ 450,00).',
      })
      expect(await errOf(draft({ ...base, customerId: '00000000-0000-0000-0000-000000000000' }))).toMatchObject({ message: 'NAO_ENCONTRADO' })
      expect(await errOf(draft({ ...base, items: [{ garmentId: 'x', unitPrice: 1 }] }))).toMatchObject({ message: 'NAO_ENCONTRADO' })
    })

    it('desconto de 16%: DESCONTO_ACIMA_LIMITE; exceção do rascunho vale uma vez, só do tipo certo e de quem pediu', async () => {
      const base = input([turim, napoles], [5, 6, 8], { discount: 144 })
      expect(await errOf(draft(base))).toMatchObject({ message: 'DESCONTO_ACIMA_LIMITE', detail: 'discount' })
      const wrongKind = await authorize('dispensa_sinal_minimo', 'reserva_rascunho', null)
      expect((await errOf(draft(base, wrongKind)))?.message).toBe('DESCONTO_ACIMA_LIMITE')
      const byAdmin = await authorize('desconto_acima_limite', 'reserva_rascunho', null, admin, 144)
      expect((await errOf(draft(base, byAdmin)))?.message).toBe('DESCONTO_ACIMA_LIMITE')

      const exc = await authorize('desconto_acima_limite', 'reserva_rascunho', null, atend, 144)
      const r = await draft(base, exc)
      expect(r.totalNet).toBe(900 - 144)
      expect(r.items.map((i) => [i.allocatedOrderDiscount, i.netRevenue])).toEqual([
        [72, 378],
        [72, 378],
      ])
      expect(r.authorizations).toEqual([expect.objectContaining({ id: exc, kind: 'desconto_acima_limite', amount: 144, reservationId: r.id, refType: 'reserva', authorizedByName: 'Ana Admin' })])
      expect(r.history.at(-1)).toMatchObject({ fromState: null, toState: 'rascunho', reason: 'Exceção autorizada: Cliente antiga (Ana Admin)' })
      expect((await errOf(draft(base, exc)))?.message).toBe('DESCONTO_ACIMA_LIMITE')
      // Editar mantendo o mesmo desconto: a autorização gravada cobre.
      const again = await as<Res>(atend, 'public.update_reservation_draft($1, $2, $3)', [r.id, JSON.stringify({ ...base, notes: 'x' }), null])
      expect(again.contract!.version).toBe(2)
      // O preço vem da peça (450), não da entrada (tests/db/seguranca.test.ts cobre o ataque).
      const odd = await draft(input([siena], [5, 6, 8], { items: [{ garmentId: siena.id, unitPrice: 100 }], discount: 0 }))
      expect(odd.totalNet).toBe(450)
    })

    it('sem reserva.discount não concede desconto novo', async () => {
      const u = await createUser(db, { email: `sem-desc-${turim.code}@senzi.test`, full_name: 'Sem Desconto', role: 'atendimento' })
      await deny(u, 'reserva.discount')
      expect((await errOf(draft(input([turim], [5, 6, 8], { discount: 10 }), null, u)))?.message).toBe('SEM_PERMISSAO')
      const r = await draft(input([turim], [5, 6, 8]), null, u)
      expect(r.discount).toBe(0)
    })

    it('a partir da prova: converte, conclui o compromisso e liga a reserva no detalhe da prova', async () => {
      const f = await as<{ id: string; code: string }>(atend, 'public.create_fitting($1)', [
        JSON.stringify({ customerId: cust.id, date: D(1), time: '15:00', eventType: 'Casamento', eventDate: D(4) }),
      ])
      await as(atend, 'public.add_fitting_garment($1, $2)', [f.id, siena.id])
      await as(atend, 'public.set_fitting_outcome($1, $2, $3)', [f.id, siena.id, JSON.stringify({ outcome: 'gostou' })])
      const other = await as<{ id: string }>(admin, 'public.create_customer($1)', [
        JSON.stringify({ fullName: `Outra ${siena.code}`, phone: '63996124400', birthDate: '1990-01-01', cpf: '12345678909' }),
      ]).catch(async () => ({ id: (await db.query<{ id: string }>(`select id from public.customer where cpf = '12345678909'`)).rows[0].id }))
      expect(await errOf(draft({ ...input([siena], [3, 4, 5]), customerId: other.id, fittingId: f.id }))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'customerId' })
      expect((await errOf(draft({ ...input([siena], [3, 4, 5]), fittingId: '00000000-0000-0000-0000-000000000000' })))?.message).toBe('NAO_ENCONTRADO')

      const r = await draft({ ...input([siena], [3, 4, 5]), fittingId: f.id })
      expect(r.fittingId).toBe(f.id)
      const fd = await as<{ session: { state: string; reservationId: string; endedAt: string | null }; reservation: unknown }>(atend, 'public.get_fitting($1)', [f.id])
      expect(fd.session).toMatchObject({ state: 'convertida', reservationId: r.id })
      expect(fd.session.endedAt).not.toBeNull()
      expect(fd.reservation).toEqual({ id: r.id, code: r.code, customerName: 'Mariana Fontes', eventDate: D(4) })
      const { rows } = await db.query<{ state: string }>(`select state::text from public.appointment where fitting_id = $1`, [f.id])
      expect(rows).toEqual([{ state: 'concluido' }])
      expect((await get(r.id))!).toMatchObject({ fittingCode: f.code, fittingDate: D(1) })
      // Mesma prova de novo na edição: não converte outra vez.
      await as(atend, 'public.update_reservation_draft($1, $2, $3)', [r.id, JSON.stringify({ ...input([siena], [3, 4, 5]), fittingId: f.id }), null])
      // A prova já convertida não serve para outro rascunho.
      expect((await errOf(draft({ ...input([napoles], [3, 4, 5]), fittingId: f.id })))?.message).toBe('PROVA_ENCERRADA')
      expect(await as(atend, 'public.fitting_stats_of($1)', [siena.id])).toMatchObject({ converted: 1 })
    })

    it('peças do rascunho: acrescenta pelo preço da peça, a última não sai, versões do contrato', async () => {
      const r = await draft(input([turim], [5, 6, 8]))
      expect((await errOf(as(atend, 'public.remove_reservation_draft_item($1, $2)', [r.id, r.items[0]!.id])))).toMatchObject({ message: 'RESERVA_SEM_PECAS', detail: 'items' })
      const two = await as<Res>(atend, 'public.add_reservation_draft_item($1, $2)', [r.id, napoles.id])
      expect(two.items.map((i) => i.garmentId)).toEqual([turim.id, napoles.id])
      expect(two.totalNet).toBe(900)
      expect(two.contract!.version).toBe(2)
      const same = await as<Res>(atend, 'public.add_reservation_draft_item($1, $2)', [r.id, napoles.id])
      expect(same.contract!.version).toBe(2)
      const one = await as<Res>(atend, 'public.remove_reservation_draft_item($1, $2)', [r.id, two.items[1]!.id])
      expect(one.items.map((i) => i.id)).toEqual([r.items[0]!.id])
      expect(one.contract!.version).toBe(3)
      expect((await errOf(as(atend, 'public.remove_reservation_draft_item($1, $2)', [r.id, two.items[1]!.id])))?.message).toBe('NAO_ENCONTRADO')
    })

    it('editar rascunho com contrato assinado: versão nova não assinada, troca no histórico, item mantém o id', async () => {
      const r = await draft(input([turim], [5, 6, 8]))
      const s = await sign(r.id)
      expect(s.contract).toMatchObject({ version: 1, signerName: 'Mariana Fontes' })
      expect(s.contract!.signedAt!.slice(0, 10)).toBe(today)
      expect((await errOf(sign(r.id)))?.message).toBe('ESTADO_INVALIDO')
      await expect(db.query(`update public.reservation_contract set body_rendered = 'x' where reservation_id = $1`, [r.id])).rejects.toThrow('ESTADO_INVALIDO')
      const u = await as<Res>(atend, 'public.update_reservation_draft($1, $2, $3)', [r.id, JSON.stringify({ ...input([turim, napoles], [5, 6, 8]), notes: 'Mudou' }), null])
      expect(u.contract).toMatchObject({ version: 2, signedAt: null })
      expect(u.items[0]!.id).toBe(r.items[0]!.id)
      expect(u.history.at(-1)).toMatchObject({ fromState: null, toState: 'rascunho', reason: 'Contrato v1 assinado substituído pela v2' })
      const bad = await errOf(as(atend, 'public.sign_reservation_contract($1, $2)', [r.id, JSON.stringify({ signedAt: D(1), signerName: ' ' })]))
      expect(bad).toMatchObject({ message: 'DATA_FUTURA', detail: 'signedAt' })
      expect(await errOf(as(atend, 'public.sign_reservation_contract($1, $2)', [r.id, JSON.stringify({ signedAt: today, signerName: ' ' })]))).toMatchObject({
        message: 'NOME_CLIENTE_OBRIGATORIO',
        detail: 'signerName',
      })
    })
  })

  describe('confirmação', () => {
    it('regras do sinal e do contrato; dispensa autorizada vale para a reserva certa', async () => {
      const r = await draft(input([turim], [5, 6, 8]))
      expect((await errOf(confirm(r.id, 450)))?.message).toBe('CONTRATO_NAO_ASSINADO')
      await sign(r.id)
      expect(await errOf(confirm(r.id, 0))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
      expect(await errOf(confirm(r.id, 451))).toMatchObject({ message: 'VALOR_EXCEDE_SALDO', detail: 'amount', hint: 'R$ 450,00' })
      expect(await errOf(confirm(r.id, 100))).toMatchObject({ message: 'SINAL_INSUFICIENTE', detail: 'amount', hint: 'R$ 225,00' })
      const other = await draft(input([napoles], [5, 6, 8]))
      const forOther = await authorize('dispensa_sinal_minimo', 'reserva', other.id)
      expect((await errOf(confirm(r.id, 100, forOther)))?.message).toBe('SINAL_INSUFICIENTE')
      const draftKind = await authorize('dispensa_sinal_minimo', 'reserva_rascunho', null)
      expect((await errOf(confirm(r.id, 100, draftKind)))?.message).toBe('SINAL_INSUFICIENTE')
      const exc = await authorize('dispensa_sinal_minimo', 'reserva', r.id)
      const res = await confirm(r.id, 100, exc)
      expect(res.ok).toBe(true)
      expect(res.reservation!.authorizations).toEqual([expect.objectContaining({ id: exc, amount: 125 })])
    })

    it('uma das peças em conflito → ok false e nada muda', async () => {
      await as(atend, 'public.block_garment($1, $2, $3, $4)', [napoles.id, D(12), D(12), null])
      const r = await draft(input([turim, napoles], [11, 12, 13]))
      await sign(r.id)
      const before = await db.query(`select count(*)::int n from public.garment_calendar_block where reservation_id = $1`, [r.id])
      const res = await confirm(r.id, 450)
      expect(res.ok).toBe(false)
      expect(res.conflicts!.map((c) => c.garmentId)).toEqual([napoles.id])
      expect((await get(r.id))!.state).toBe('rascunho')
      expect((await db.query(`select count(*)::int n from public.garment_calendar_block where reservation_id = $1`, [r.id])).rows).toEqual(before.rows)
      expect(await appts(r.id)).toEqual([])
    })

    it('confirma: blocos locação + higienização, peça reservada com histórico, sinal pago, saldo na retirada e 3 compromissos', async () => {
      const draftR = await draft(input([turim, napoles], [5, 6, 8]))
      await sign(draftR.id)
      const res = await confirm(draftR.id, 450)
      expect(res.ok).toBe(true)
      const r = res.reservation!
      expect(r.state).toBe('confirmada')
      for (const g0 of [turim, napoles]) {
        const g = await getGarment(g0.id)
        expect(g.blocks.filter((b) => b.reservationId === r.id).map((b) => [b.kind, b.from, b.to])).toEqual([
          ['locacao', D(5), D(8)],
          ['higienizacao', D(9), D(10)],
        ])
        expect(g.state).toBe('reservado')
        expect(g.history[0]!.reason).toBe(`Reserva ${r.code} confirmada`)
      }
      expect(r.payments).toEqual([
        expect.objectContaining({ kind: 'sinal', state: 'pago', amount: 450, reference: 'E2E123' }),
        expect.objectContaining({ kind: 'saldo', state: 'pendente', amount: 450, dueAt: D(5), paidAt: null }),
      ])
      expect(r.balance).toMatchObject({ pago: 450, due: 450, status: 'parcial' })
      expect((await appts(r.id)).map((a) => [a.kind, a.at.slice(0, 16), a.state, a.title, a.garment_id])).toEqual([
        ['retirada', `${D(5)}T10:00`, 'agendado', 'Retirada', null],
        ['evento', `${D(6)}T19:00`, 'agendado', 'Casamento', null],
        ['devolucao', `${D(8)}T11:00`, 'agendado', 'Devolução', null],
      ])
      expect(r.history.at(-1)).toMatchObject({ fromState: 'rascunho', toState: 'confirmada', reason: 'Confirmação da reserva' })
      const [day] = await as<{ items: { kind: string; reservation: unknown; garments: unknown[]; pendingPickupItems?: number }[] }[]>(atend, 'public.agenda_range($1, $2)', [D(5), D(5)])
      expect(day!.items.find((i) => i.kind === 'retirada' && (i.reservation as { id: string } | null)?.id === r.id)).toMatchObject({
        reservation: { id: r.id, code: r.code },
        garments: [{ id: turim.id, code: turim.code, name: turim.name }, { id: napoles.id, code: napoles.code, name: napoles.name }],
        pendingPickupItems: 2,
      })
      // Outra reserva da mesma peça no mesmo período: conflito de verdade.
      const [a] = await as<Avail[]>(atend, 'public.check_availability($1, $2, $3, $4)', [[turim.id], D(9), D(9), null])
      expect(a!.conflicts.map((c) => [c.kind, c.reservationCode, c.draft])).toEqual([['higienizacao', r.code, false]])
      // Mesma peça confirmada de novo em outro período: a linha "confirmada" entra no histórico mesmo já reservada.
      const later = await confirmed([turim], [20, 21, 22])
      expect((await getGarment(turim.id)).history[0]!.reason).toBe(`Reserva ${later.code} confirmada`)
    })
  })

  describe('pagamentos e caução', () => {
    it('saldo parcial atualiza a parcela; o resto quita sem duplicar; limites do VALOR_EXCEDE_SALDO', async () => {
      const r0 = await confirmed([turim], [5, 6, 8])
      expect(r0.payments.filter((p) => p.state === 'pendente')).toEqual([expect.objectContaining({ kind: 'saldo', amount: 225 })])
      expect(await errOf(pay(r0.id, 'saldo', 225.01))).toMatchObject({ message: 'VALOR_EXCEDE_SALDO', hint: 'R$ 225,00' })
      expect((await errOf(pay(r0.id, 'multa', 226)))?.message).toBe('VALOR_EXCEDE_SALDO')
      const r1 = await pay(r0.id, 'saldo', 100)
      expect(r1.payments.filter((p) => p.state === 'pendente')).toEqual([expect.objectContaining({ kind: 'saldo', amount: 125, dueAt: D(5) })])
      expect(r1.balance).toMatchObject({ due: 125, status: 'parcial' })
      const withDeposit = await pay(r0.id, 'caucao', 5000)
      expect(withDeposit.balance).toMatchObject({ caucao: 5000, due: 125 })
      expect((await errOf(pay(r0.id, 'estorno', 5000.01, 'caucao')))?.message).toBe('VALOR_EXCEDE_SALDO')
      expect((await errOf(pay(r0.id, 'estorno', 325.01)))?.message).toBe('VALOR_EXCEDE_SALDO')
      expect(await errOf(pay(r0.id, 'saldo', 10, 'caucao'))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'refersTo' })
      expect(await errOf(pay(r0.id, 'saldo', 0))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
      // Estorno de receita: o pago cai e a parcela pendente acompanha.
      const refunded = await pay(r0.id, 'estorno', 100)
      expect(refunded.balance).toMatchObject({ pago: 225, due: 225, caucao: 5000 })
      expect(refunded.payments.filter((p) => p.state === 'pendente')).toEqual([expect.objectContaining({ kind: 'saldo', amount: 225 })])
      const r2 = await pay(r0.id, 'saldo', 225)
      expect(r2.payments.filter((p) => p.kind === 'saldo').map((p) => [p.state, p.amount])).toEqual([
        ['pago', 225],
        ['pago', 100],
      ])
      expect(r2.balance).toMatchObject({ due: 0, status: 'pago', pago: 450, caucao: 5000 })
      const draftR = await draft(input([siena], [5, 6, 8]))
      expect((await errOf(pay(draftR.id, 'sinal', 10)))?.message).toBe('ESTADO_INVALIDO')
    })

    it('caução: só depois de encerrada; retenção sai da custódia e vira recebível avulso pago em Locação', async () => {
      const r0 = await confirmed([turim], [5, 6, 8])
      await pay(r0.id, 'caucao', 300, null, 'dinheiro')
      expect((await errOf(deposit(r0.id, 'pix')))?.message).toBe('ESTADO_INVALIDO')
      const cancelled = await cancel(r0.id, 'Cliente desistiu')
      expect(cancelled.balance.caucao).toBe(300)
      expect(await errOf(deposit(r0.id, 'pix', { amount: 80, reason: ' ' }))).toMatchObject({ message: 'MOTIVO_OBRIGATORIO', detail: 'retainReason' })
      expect(await errOf(deposit(r0.id, 'pix', { amount: 300.01, reason: 'Mancha' }))).toMatchObject({ message: 'VALOR_EXCEDE_SALDO', detail: 'retainAmount', hint: 'R$ 300,00' })
      expect(await errOf(deposit(r0.id, 'pix', { amount: -1, reason: 'Mancha' }))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'retainAmount' })
      const back = await deposit(r0.id, 'pix', { amount: 80, reason: 'Mancha de vinho na barra' })
      expect(back.balance).toMatchObject({ caucao: 0, pago: cancelled.balance.pago, due: cancelled.balance.due })
      expect(back.payments.slice(-2)).toEqual([
        expect.objectContaining({ kind: 'estorno', refersTo: 'caucao', method: 'pix', amount: 220, notes: 'Devolução da caução' }),
        expect.objectContaining({ kind: 'estorno', refersTo: 'caucao', method: 'outro', amount: 80, notes: 'Retida pela loja: Mancha de vinho na barra' }),
      ])
      const { rows } = await db.query<Record<string, unknown>>(
        `select r.description, c.system_key, r.amount::float as amount, r.paid_amount::float as paid, r.status::text, r.method::text, r.customer_id, r.notes, r.due_date::text
           from public.receivable r join public.fin_category c on c.id = r.category_id where r.reservation_id = $1`,
        [r0.id],
      )
      expect(rows).toEqual([
        { description: `Retenção de caução · ${r0.code}`, system_key: 'locacao', amount: 80, paid: 80, status: 'pago', method: 'dinheiro', customer_id: cust.id, notes: 'Mancha de vinho na barra', due_date: today },
      ])
      expect(await errOf(deposit(r0.id, 'pix'))).toMatchObject({ message: 'VALOR_INVALIDO', detail: 'amount' })
    })

    it('reter a caução inteira não lança estorno para a cliente', async () => {
      const r0 = await confirmed([turim], [5, 6, 8])
      await pay(r0.id, 'caucao', 150)
      const c = await cancel(r0.id, 'Cliente desistiu')
      const back = await deposit(r0.id, 'pix', { amount: 150, reason: 'Peça não devolvida' })
      expect(back.payments).toHaveLength(c.payments.length + 1)
      expect(back.balance.caucao).toBe(0)
    })
  })

  describe('ciclo completo', () => {
    it('pronta → retirada antecipada (com saldo só por exceção) → devolução no prazo → finalizada → caução devolvida', async () => {
      const r0 = await confirmed([turim], [5, 6, 8])
      expect((await errOf(as(atend, 'public.mark_reservation_no_show($1)', [r0.id])))?.message).toBe('ESTADO_INVALIDO')
      const ready = await as<Res>(atend, 'public.mark_reservation_ready($1)', [r0.id])
      expect(ready.state).toBe('pronta_retirada')
      expect((await errOf(as(atend, 'public.mark_reservation_ready($1)', [r0.id])))?.message).toBe('ESTADO_INVALIDO')
      const decisions = r0.items.map((i) => ({ itemId: i.id, delivered: true, note: 'Com capa' }))
      expect(await errOf(pickup(r0.id, decisions))).toMatchObject({ message: 'SALDO_EM_ABERTO', hint: 'R$ 225,00' })
      expect(await errOf(pickup(r0.id, [{ itemId: r0.items[0]!.id, delivered: false }]))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'items' })
      const exc = await authorize('retirada_com_saldo', 'reserva', r0.id)
      const out = await pickup(r0.id, decisions, exc)
      expect(out.state).toBe('em_uso')
      expect(out.items[0]).toMatchObject({ itemState: 'retirado', pickupNote: 'Com capa' })
      expect(out.pickedUpAt!.slice(0, 10)).toBe(today)
      expect(out.authorizations).toEqual([expect.objectContaining({ kind: 'retirada_com_saldo', amount: 225 })])
      expect(out.history.slice(-2).map((h) => h.reason)).toEqual(['Exceção autorizada: Cliente antiga (Ana Admin)', 'Todas as peças retiradas pela cliente'])
      let g = await getGarment(turim.id)
      expect(g.state).toBe('em_uso')
      expect(g.history[0]!.reason).toBe(`Retirada — ${r0.code}`)
      expect(g.blocks.find((b) => b.reservationId === r0.id && b.kind === 'locacao')).toMatchObject({ from: today, to: D(8) })
      const a1 = await appts(r0.id)
      expect(a1.find((a) => a.kind === 'retirada')).toMatchObject({ state: 'concluido' })
      expect(a1.find((a) => a.kind === 'retirada')!.at.slice(0, 10)).toBe(today)
      expect(a1.find((a) => a.kind === 'evento')!.at.slice(0, 10)).toBe(D(6))
      // Cliente em uso: estatísticas e economia da peça.
      const c = await as<{ stats: { rentals: number; spent: number; nextEvent: string | null } }>(admin, 'public.get_customer($1)', [cust.id])
      expect(c.stats.rentals).toBeGreaterThanOrEqual(1)
      const { rows: econ } = await asUser(db, admin, (tx) =>
        tx.query<{ rentals: number; revenue: number; last_rental: string }>('select rentals, revenue::float as revenue, last_rental::text from public.garment_costs($1)', [[turim.id]]),
      )
      expect(econ).toEqual([{ rentals: 1, revenue: 450, last_rental: D(6) }])

      const back = await giveBack(r0.id, [{ itemId: r0.items[0]!.id, returned: true, note: 'ok' }])
      expect(back.state).toBe('em_inspecao')
      expect(back.lateFee).toBe(0)
      expect(back.history.at(-1)).toMatchObject({ fromState: 'em_uso', toState: 'em_inspecao', reason: 'Devolvida no prazo' })
      expect(back.items[0]).toMatchObject({ itemState: 'devolvido', returnNote: 'ok' })
      g = await getGarment(turim.id)
      expect(g.state).toBe('inspecao')
      expect(g.blocks.filter((b) => b.reservationId === r0.id).map((b) => [b.kind, b.from, b.to])).toEqual([
        ['locacao', today, today],
        ['higienizacao', D(1), D(2)],
      ])
      expect((await appts(r0.id)).find((a) => a.kind === 'devolucao')).toMatchObject({ state: 'concluido' })
      expect((await appts(r0.id)).find((a) => a.kind === 'devolucao')!.at.slice(0, 10)).toBe(today)

      // Finalização é da Operação (área 5): aqui direto no banco. A locação vira histórico.
      await pay(r0.id, 'saldo', 225)
      await pay(r0.id, 'caucao', 200)
      await db.query(`update public.reservation set state = 'finalizada' where id = $1`, [r0.id])
      g = await getGarment(turim.id)
      expect(g.blocks.filter((b) => b.reservationId === r0.id).map((b) => b.kind)).toEqual(['higienizacao'])
      const done = await deposit(r0.id, 'pix')
      expect(done.balance).toMatchObject({ caucao: 0, due: 0, status: 'pago' })
      const rows = await as<{ items: Row[] }>(atend, 'public.list_reservations($1, $2, $3)', ['encerradas', 50, 0])
      expect(rows.items.some((x) => x.id === r0.id)).toBe(true)
    })

    it('devolução parcial com atraso: uma multa pelo % do contrato, aguardando devolução; completa vai para inspeção', async () => {
      const draftR = await draft(input([turim, napoles], [-1, -1, -1]))
      await sign(draftR.id)
      await db.query(`update public.app_settings set late_fee_daily_percent = 5`)
      expect((await confirm(draftR.id, 900)).ok).toBe(true)
      const picked = await pickup(draftR.id, draftR.items.map((i) => ({ itemId: i.id, delivered: true })))
      expect(picked.state).toBe('em_uso')
      const late = (await as<{ items: Row[] }>(atend, 'public.list_reservations($1, $2, $3)', ['rua', 50, 0])).items.find((x) => x.id === draftR.id)!
      expect(late.daysLate).toBe(1)
      const [first, second] = picked.items
      const r = await giveBack(draftR.id, [
        { itemId: first!.id, returned: true, note: 'ok' },
        { itemId: second!.id, returned: false },
      ])
      await db.query(`update public.app_settings set late_fee_daily_percent = 20`)
      expect(r.state).toBe('aguardando_devolucao')
      expect(r.lateFee).toBe(180) // 20% (do contrato) × 900 × 1 dia
      expect(r.payments.filter((p) => p.kind === 'multa')).toEqual([
        expect.objectContaining({ state: 'pendente', amount: 180, dueAt: today, notes: '1 dia(s) de atraso · 1 peça(s) ainda na rua' }),
      ])
      expect(r.balance.due).toBe(180)
      expect(r.history.at(-1)).toMatchObject({ toState: 'aguardando_devolucao', reason: 'Devolução parcial — 1 peça(s) recebida(s), 1 pendente(s)' })
      expect((await getGarment(turim.id)).state).toBe('inspecao')
      expect((await getGarment(napoles.id)).state).toBe('aguardando_devolucao')
      // A multa paga como "saldo" quita; a devolução seguinte não a ressuscita.
      const paid = await pay(draftR.id, 'saldo', 180)
      expect(paid.balance).toMatchObject({ due: 0, status: 'pago' })
      expect(paid.payments.filter((p) => p.state === 'pendente')).toEqual([])
      const done = await giveBack(draftR.id, [{ itemId: second!.id, returned: true }])
      expect(done.state).toBe('em_inspecao')
      expect(done.history.at(-1)!.reason).toBe('Devolvida com 1 dia(s) de atraso')
      expect(done.payments.filter((p) => p.kind === 'multa')).toHaveLength(0)
      expect(done.balance.due).toBe(0)
      expect(done.returnedAt).not.toBeNull()
    })

    it('devolução completa com peça que nunca saiu: item não entregue e agenda da peça liberada', async () => {
      const r0 = await confirmed([turim, napoles], [-1, 0, 1], (n) => n)
      expect((await getGarment(napoles.id)).state).toBe('reservado')
      const [t, n] = r0.items
      const partial = await pickup(r0.id, [{ itemId: t!.id, delivered: true }])
      expect(partial.state).toBe('retirada')
      expect(partial.history.at(-1)!.reason).toBe('Retirada parcial — 1 de 2 peça(s)')
      const [day] = await as<{ items: { kind: string; pendingPickupItems?: number; itemsOut?: number }[] }[]>(atend, 'public.agenda_range($1, $2)', [D(1), D(1)])
      expect(day!.items.find((i) => i.kind === 'devolucao')).toMatchObject({ itemsOut: 1 })
      const done = await giveBack(r0.id, [{ itemId: t!.id, returned: true }])
      expect(done.state).toBe('em_inspecao')
      expect(done.items.find((i) => i.id === n!.id)).toMatchObject({ itemState: 'nao_entregue', pickupNote: 'Não entregue na retirada' })
      const g = await getGarment(napoles.id)
      expect(g.blocks.some((b) => b.reservationId === r0.id)).toBe(false)
      expect(g.state).toBe('disponivel')
      expect(g.history[0]!.reason).toBe(`Reserva ${r0.code} encerrada sem a peça`)
      const { rows } = await asUser(db, admin, (tx) => tx.query<{ rentals: number }>('select rentals from public.garment_costs($1)', [[napoles.id]]))
      expect(rows).toEqual([{ rentals: 0 }])
    })

    it('retirada antecipada não passa por cima de outro compromisso da peça', async () => {
      await confirmed([turim], [1, 1, 2], (n) => n)
      const later = await confirmed([turim], [9, 10, 11], (n) => n)
      expect(await errOf(pickup(later.id, later.items.map((i) => ({ itemId: i.id, delivered: true }))))).toMatchObject({ message: 'CONFLITO_AGENDA', detail: 'items' })
      expect((await getGarment(turim.id)).blocks.find((b) => b.reservationId === later.id && b.kind === 'locacao')!.from).toBe(D(9))
    })

    it('devolução atrasada não invade a reserva seguinte da peça', async () => {
      const first = await confirmed([turim], [-1, -1, -1], (n) => n)
      await pickup(first.id, first.items.map((i) => ({ itemId: i.id, delivered: true })))
      // A próxima locação começa hoje (sem higienização no meio): a devolução de hoje fica até ontem.
      await db.query(`update public.garment set cleaning_days = 0 where id = $1`, [turim.id])
      await db.query(`delete from public.garment_calendar_block where reservation_id = $1 and kind = 'higienizacao'`, [first.id])
      const next = await confirmed([turim], [0, 0, 1], (n) => n)
      const back = await giveBack(first.id, first.items.map((i) => ({ itemId: i.id, returned: true })))
      expect(back.lateFee).toBe(90)
      const g = await getGarment(turim.id)
      expect(g.blocks.filter((b) => b.kind === 'locacao').map((b) => [b.reservationId, b.from, b.to])).toEqual([
        [first.id, D(-1), D(-1)],
        [next.id, today, D(1)],
      ])
    })
  })

  describe('cancelamento e no-show', () => {
    it('cancelar: motivo obrigatório; libera blocos, peça, compromissos e parcelas pendentes', async () => {
      const r0 = await confirmed([turim], [5, 6, 8])
      expect(await errOf(cancel(r0.id, '  '))).toMatchObject({ message: 'MOTIVO_OBRIGATORIO', detail: 'reason' })
      const r = await cancel(r0.id, 'Cliente desistiu')
      expect(r).toMatchObject({ state: 'cancelada', cancelReason: 'Cliente desistiu' })
      expect(r.payments.find((p) => p.kind === 'saldo')).toMatchObject({ state: 'cancelado' })
      expect(r.balance.pago).toBe(225)
      const g = await getGarment(turim.id)
      expect(g.blocks.some((b) => b.reservationId === r0.id)).toBe(false)
      expect(g.state).toBe('disponivel')
      expect(g.history[0]!.reason).toBe(`Reserva ${r0.code} cancelada`)
      expect((await appts(r0.id)).every((a) => a.state === 'cancelado')).toBe(true)
      expect((await errOf(cancel(r0.id, 'de novo')))?.message).toBe('ESTADO_INVALIDO')
      const row = (await as<Row[]>(atend, 'public.reservations_of_customer($1)', [cust.id])).find((x) => x.id === r0.id)!
      expect(row).toMatchObject({ payStatus: null, due: 0 })
      // Estorno do que foi pago continua possível.
      const refunded = await pay(r0.id, 'estorno', 225)
      expect(refunded.balance.pago).toBe(0)
    })

    it('no-show: só com retirada no passado; retirada vira no_show e os demais compromissos, cancelado', async () => {
      const r0 = await confirmed([turim], [-1, 0, 1])
      const r = await as<Res>(atend, 'public.mark_reservation_no_show($1)', [r0.id])
      expect(r).toMatchObject({ state: 'no_show', cancelReason: 'Não compareceu para a retirada' })
      expect((await appts(r0.id)).map((a) => [a.kind, a.state])).toEqual([
        ['retirada', 'no_show'],
        ['evento', 'cancelado'],
        ['devolucao', 'cancelado'],
      ])
      expect((await getGarment(turim.id)).history[0]!.reason).toBe(`Reserva ${r0.code} no-show`)
      const draftR = await draft(input([napoles], [5, 6, 8]))
      expect((await errOf(as(atend, 'public.mark_reservation_no_show($1)', [draftR.id])))?.message).toBe('ESTADO_INVALIDO')
    })
  })

  describe('leitura', () => {
    it('lista por filtro e ordem, resumo, reservas da cliente e da peça, configurações e alternativas', async () => {
      const a = await confirmed([turim], [7, 8, 9])
      const b = await draft(input([napoles], [3, 4, 5]))
      const ativas = await as<{ items: Row[]; total: number }>(atend, 'public.list_reservations($1, $2, $3)', ['ativas', 1000, 0])
      const picks = ativas.items.map((r) => r.pickupDate)
      expect([...picks].sort()).toEqual(picks)
      const drafts = await as<{ items: Row[] }>(atend, 'public.list_reservations($1, $2, $3)', ['rascunhos', 1000, 0])
      expect(drafts.items.every((r) => r.state === 'rascunho' && r.payStatus === null && r.due === 0)).toBe(true)
      expect(drafts.items.find((r) => r.id === b.id)!.garments).toEqual([{ code: napoles.code, shortName: napoles.name.replace('Vestido ', '') }])
      const saldo = await as<{ items: Row[] }>(atend, 'public.list_reservations($1, $2, $3)', ['com_saldo', 1000, 0])
      expect(saldo.items.find((r) => r.id === a.id)).toMatchObject({ payStatus: 'parcial', due: 225, customerName: 'Mariana Fontes' })
      const futuras = await as<{ items: Row[] }>(atend, 'public.list_reservations($1, $2, $3)', ['futuras', 1000, 0])
      expect(futuras.items.map((r) => r.id)).toEqual(expect.arrayContaining([a.id, b.id]))
      const page = await as<{ items: Row[]; total: number }>(atend, 'public.list_reservations($1, $2, $3)', ['todas', 2, 1])
      expect(page.items).toHaveLength(2)
      expect((await errOf(as(atend, 'public.list_reservations($1, $2, $3)', ['todas', 1001, 0])))?.message).toBe('PARAMETRO_INVALIDO')
      const s = await as<{ active: number; toReceive: number }>(atend, 'public.reservation_summary()')
      const { rows } = await db.query<{ n: number; due: number }>(
        `select count(*) filter (where state = any (public.reservation_states('active')))::int n,
                coalesce(sum(public.reservation_open_due(id)), 0)::float due from public.reservation`,
      )
      expect(s).toEqual({ active: rows[0].n, toReceive: rows[0].due })

      const ofG = await as<Row[]>(atend, 'public.reservations_of_garment($1)', [turim.id])
      expect(ofG.map((r) => r.id)).toEqual([a.id])
      const ofC = await as<Row[]>(atend, 'public.reservations_of_customer($1)', [cust.id])
      const cp = ofC.map((r) => r.pickupDate)
      expect([...cp].sort().reverse()).toEqual(cp)

      expect(await as(atend, 'public.get_settings()')).toEqual({
        defaultCleaningDays: 2,
        defaultPrepDays: 0,
        lateFeeDailyPercent: 20,
        depositPercent: 0,
        discountLimitPercent: 15,
        minSignalPercent: 50,
        idleAlertDays: 90,
      })
      expect(await get('00000000-0000-0000-0000-000000000000')).toBeNull()

      // Alternativas: mesma categoria, livres, por pontos (etiqueta, tamanho, comprimento, cor, preço).
      const tag = turim.code
      const conj = (name: string, extra: Record<string, unknown> = {}) => garment(`Conjunto ${name} ${tag}`, { categorySlug: 'conjunto', labelSize: tag, ...extra })
      const target = await conj('Alvo')
      const twin = await conj('Gêmeo')
      const near = await conj('Parecido', { labelSize: '40', colorPrimary: 'Azul' })
      const busy = await conj('Ocupado')
      await as(atend, 'public.block_garment($1, $2, $3, $4)', [busy.id, D(8), D(8), null])
      const alt = await as<{ id: string }[]>(atend, 'public.reservation_alternatives($1, $2, $3)', [target.id, D(7), D(9)])
      expect(alt.length).toBeLessThanOrEqual(4)
      const ids = alt.map((g) => g.id)
      expect(ids).not.toContain(target.id)
      expect(ids).not.toContain(busy.id)
      expect(ids.indexOf(twin.id)).toBe(0)
      expect(ids).toContain(near.id)
      expect((await errOf(as(atend, 'public.reservation_alternatives($1, $2, $3)', ['00000000-0000-0000-0000-000000000000', D(7), D(9)])))?.message).toBe('NAO_ENCONTRADO')
    })
  })

  describe('permissões', () => {
    it('cada ação exige a sua permissão; sem cliente.edit o CPF do contrato sai oculto', async () => {
      const u = await createUser(db, { email: `perm-${turim.code}@senzi.test`, full_name: 'Sem Nada', role: 'atendimento' })
      const r0 = await confirmed([turim], [5, 6, 8])
      for (const p of ['reserva.view', 'reserva.create', 'reserva.confirm', 'reserva.pickup', 'reserva.return', 'reserva.cancel', 'financeiro.payment', 'cliente.edit'])
        await deny(u, p)
      const asU = (sql: string, params: unknown[] = []) => errOf(as(u, sql, params)).then((e) => e?.message)
      expect(await asU('public.list_reservations($1, $2, $3)', ['todas', 10, 0])).toBe('SEM_PERMISSAO')
      expect(await asU('public.get_reservation($1)', [r0.id])).toBe('SEM_PERMISSAO')
      expect(await asU('public.get_settings()')).toBe('SEM_PERMISSAO')
      expect(await asU('public.reservation_summary()')).toBe('SEM_PERMISSAO')
      expect(await asU('public.reservations_of_customer($1)', [cust.id])).toBe('SEM_PERMISSAO')
      expect(await asU('public.create_reservation_draft($1, $2)', [JSON.stringify(input([napoles], [5, 6, 8])), null])).toBe('SEM_PERMISSAO')
      expect(await asU('public.confirm_reservation($1, $2, $3)', [r0.id, '{}', null])).toBe('SEM_PERMISSAO')
      expect(await asU('public.pickup_reservation_items($1, $2, $3)', [r0.id, '[]', null])).toBe('SEM_PERMISSAO')
      expect(await asU('public.return_reservation_items($1, $2)', [r0.id, '[]'])).toBe('SEM_PERMISSAO')
      expect(await asU('public.cancel_reservation($1, $2)', [r0.id, 'x'])).toBe('SEM_PERMISSAO')
      expect(await asU('public.register_reservation_payment($1, $2)', [r0.id, '{}'])).toBe('SEM_PERMISSAO')
      expect(await asU('public.return_reservation_deposit($1, $2, $3)', [r0.id, 'pix', null])).toBe('SEM_PERMISSAO')

      await db.query(`delete from public.user_permission_override where user_id = $1 and permission_key = 'reserva.view'`, [u])
      const d = (await get(r0.id, u))!
      expect(d.contract!.bodyRendered).toContain('CPF ***.982.247-**')
      expect(d.contract!.bodyRendered).not.toContain('529.982.247-25')
      expect(d.customer.cpf).toBe('***982247**')
      expect((await get(r0.id, atend))!.contract!.bodyRendered).toContain('CPF 529.982.247-25')
    })

    it('anon não executa nenhuma RPC de reservas nem lê as tabelas', async () => {
      for (const sql of [
        `select public.list_reservations('todas', 10, 0)`,
        `select public.get_reservation(gen_random_uuid())`,
        `select public.get_settings()`,
        `select public.create_reservation_draft('{}', null)`,
        `select public.confirm_reservation(gen_random_uuid(), '{}', null)`,
        `select * from public.reservation`,
        `select * from public.receivable`,
        `select * from public.fin_category`,
      ])
        await expect(asAnon(db, (tx) => tx.query(sql))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, atend, (tx) => tx.query('select * from public.reservation_payment'))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, atend, (tx) => tx.query('select public.reservation_json(gen_random_uuid())'))).rejects.toThrow(/permission denied/)
    })
  })

  describe('base do financeiro', () => {
    it('categorias do fixture com as de sistema e auditoria das tabelas novas', async () => {
      const { rows } = await db.query<{ name: string; type: string; system_key: string | null; is_system: boolean }>(
        'select name, type::text, system_key, is_system from public.fin_category order by sort_order',
      )
      expect(rows).toHaveLength(16)
      expect(rows.filter((r) => r.is_system).map((r) => r.system_key)).toEqual(['locacao', 'aquisicao', 'higienizacao', 'manutencao', 'ajuste'])
      const r0 = await draft(input([turim], [5, 6, 8]))
      const { rows: audit } = await db.query<{ table_name: string }>(
        `select distinct table_name from public.audit_log where row_id = $1 or table_name in ('reservation_item', 'reservation_contract')`,
        [r0.id],
      )
      expect(audit.map((a) => a.table_name).sort()).toEqual(['reservation', 'reservation_contract', 'reservation_item'])
    })
  })
})

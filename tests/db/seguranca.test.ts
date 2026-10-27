import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asUser, createTestDb, createUser } from './harness'

/**
 * Achados da auditoria de segurança (migration 20261027000900_seguranca.sql): cada teste reproduz o ataque
 * e mostra que agora é recusado.
 */

type Res = {
  id: string
  totalGross: number
  totalNet: number
  discount: number
  state: string
  items: { id: string; garmentId: string; unitPrice: number }[]
  authorizations: { id: string; kind: string; amount: number }[]
}
type Garment = { id: string; code: string; photos: { id: string; path: string }[] }

const GARMENT = {
  categorySlug: 'vestido-midi',
  labelSize: '38',
  colorHex: '#0E5C4A',
  colorPrimary: 'Verde',
  sizeEquiv: 'M',
  length: 'midi',
  rentalPrice: 2000,
  fabric: 'Crepe',
  neckline: '',
  sleeve: '',
  style: '',
  occasions: [],
  fitNotes: '',
  acquisitionCost: 5000,
  retailReference: 9000,
  cleaningDays: null,
  location: '',
}

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

describe('segurança (auditoria)', () => {
  let db: PGlite
  let admin: string
  let atend: string
  let today: string
  let cust: { id: string }

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string; hint?: string }) => e)
  const D = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }
  const garment = (extra: Record<string, unknown> = {}) =>
    as<Garment>(admin, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, name: `Vestido ${Math.random().toString(36).slice(2, 7)}`, ...extra })])
  const input = (items: { garmentId: string; unitPrice: number }[], extra: Record<string, unknown> = {}) => ({
    customerId: cust.id,
    pickupDate: D(5),
    eventDate: D(6),
    returnDueDate: D(8),
    eventType: 'Casamento',
    discount: 0,
    items,
    ...extra,
  })
  const draft = (p: Record<string, unknown>, exc: string | null = null) => as<Res>(atend, 'public.create_reservation_draft($1, $2)', [JSON.stringify(p), exc])
  const update = (id: string, p: Record<string, unknown>, exc: string | null = null) =>
    as<Res>(atend, 'public.update_reservation_draft($1, $2, $3)', [id, JSON.stringify(p), exc])
  const authorize = async (kind: string, refType: string, refId: string | null, maxAmount: number | null) => {
    const r = await as<{ ok: boolean; id?: string; error?: string }>(atend, `public.authorize_exception('ana@senzi.test', '1234', $1, 'Cliente antiga', $2, $3, $4)`, [
      kind,
      refType,
      refId,
      maxAmount,
    ])
    if (!r.ok) throw new Error(r.error)
    return r.id!
  }
  const signAndConfirm = async (id: string, amount: number, exc: string | null = null) => {
    await as(atend, 'public.sign_reservation_contract($1, $2)', [id, JSON.stringify({ signedAt: today, signerName: 'Mariana Fontes', notes: null })])
    return as<{ ok: boolean; reservation?: Res }>(atend, 'public.confirm_reservation($1, $2, $3)', [
      id,
      JSON.stringify({ amount, method: 'pix', reference: null, notes: null }),
      exc,
    ])
  }

  beforeAll(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
    await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('1234')`))
    today = (await db.query<{ d: string }>(`select public.store_today()::text d`)).rows[0].d
    cust = await as(admin, 'public.create_customer($1)', [
      JSON.stringify({ fullName: 'Mariana Fontes', phone: '63996124478', birthDate: '1995-03-10', cpf: '52998224725' }),
    ])
  }, 60000)

  afterAll(async () => {
    await db.close()
  })

  describe('1 · preço da peça vem do banco', () => {
    it('rascunho com unitPrice R$ 1 para peça de R$ 2.000 fica R$ 2.000', async () => {
      const g = await garment()
      const r = await draft(input([{ garmentId: g.id, unitPrice: 1 }]))
      expect(r.items[0]!.unitPrice).toBe(2000)
      expect(r.totalGross).toBe(2000)
      expect(r.totalNet).toBe(2000)
    })

    it('edição: peça que já estava mantém o preço congelado; peça nova entra pelo preço de locação', async () => {
      const a = await garment()
      const b = await garment({ rentalPrice: 800 })
      const r = await draft(input([{ garmentId: a.id, unitPrice: 2000 }]))
      await as(admin, 'public.update_garment($1, $2)', [a.id, JSON.stringify({ rentalPrice: 2500 })])
      const u = await update(r.id, input([{ garmentId: a.id, unitPrice: 1 }, { garmentId: b.id, unitPrice: 1 }]))
      expect(u.items.map((i) => i.unitPrice)).toEqual([2000, 800])
      expect(u.totalGross).toBe(2800)
    })

    it('preço inflado na entrada não esconde desconto acima do limite', async () => {
      const g = await garment()
      // 16% de R$ 2.000 = R$ 320: com unitPrice R$ 100.000 pareceria 0,3%.
      expect(await errOf(draft(input([{ garmentId: g.id, unitPrice: 100000 }], { discount: 320 })))).toMatchObject({
        message: 'DESCONTO_ACIMA_LIMITE',
        detail: 'discount',
      })
    })

    it('entrada malformada continua recusada como antes', async () => {
      const g = await garment()
      expect(await errOf(draft(input([{ garmentId: g.id, unitPrice: -1 }])))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'items' })
    })
  })

  describe('2 · exceção guarda o valor autorizado', () => {
    it('desconto exige valor na autorização', async () => {
      expect(await errOf(authorize('desconto_acima_limite', 'reserva_rascunho', null, null))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'maxAmount' })
      expect(await errOf(authorize('desconto_acima_limite', 'reserva_rascunho', null, 0))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'maxAmount' })
      expect(await errOf(authorize('retirada_com_saldo', 'reserva', null, -1))).toMatchObject({ message: 'PARAMETRO_INVALIDO', detail: 'maxAmount' })
    })

    it('PIN autorizou R$ 320; usar para R$ 1.000 → DESCONTO_ACIMA_LIMITE; para R$ 320 vale', async () => {
      const g = await garment()
      const exc = await authorize('desconto_acima_limite', 'reserva_rascunho', null, 320)
      expect(await errOf(draft(input([{ garmentId: g.id, unitPrice: 2000 }], { discount: 1000 }), exc))).toMatchObject({
        message: 'DESCONTO_ACIMA_LIMITE',
        detail: 'discount',
      })
      const r = await draft(input([{ garmentId: g.id, unitPrice: 2000 }], { discount: 320 }), exc)
      expect(r.authorizations).toEqual([expect.objectContaining({ id: exc, amount: 320 })])
      // Aumentar o desconto depois: a autorização gravada só cobre R$ 320.
      expect(await errOf(update(r.id, input([{ garmentId: g.id, unitPrice: 2000 }], { discount: 900 })))).toMatchObject({ message: 'DESCONTO_ACIMA_LIMITE' })
    })

    it('exceção de desconto sem valor (anterior à correção) não vale', async () => {
      const g = await garment()
      const { rows } = await db.query<{ id: string }>(
        `insert into public.exception_authorization (kind, reason, ref_type, requested_by, authorized_by)
         values ('desconto_acima_limite', 'Antiga', 'reserva_rascunho', $1, $2) returning id`,
        [atend, admin],
      )
      expect(await errOf(draft(input([{ garmentId: g.id, unitPrice: 2000 }], { discount: 400 }), rows[0]!.id))).toMatchObject({ message: 'DESCONTO_ACIMA_LIMITE' })
    })

    it('dispensa de sinal autorizada para R$ 100 não cobre sinal R$ 900 abaixo do mínimo', async () => {
      const g = await garment()
      const r = await draft(input([{ garmentId: g.id, unitPrice: 2000 }]))
      const exc = await authorize('dispensa_sinal_minimo', 'reserva', r.id, 100)
      expect(await errOf(signAndConfirm(r.id, 100, exc))).toMatchObject({ message: 'SINAL_INSUFICIENTE', detail: 'amount', hint: 'R$ 1.000,00' })
      const ok = await as<{ ok: boolean; reservation?: Res }>(atend, 'public.confirm_reservation($1, $2, $3)', [
        r.id,
        JSON.stringify({ amount: 900, method: 'pix', reference: null, notes: null }),
        exc,
      ])
      expect(ok.ok).toBe(true)
      expect(ok.reservation!.authorizations).toEqual([expect.objectContaining({ id: exc, amount: 100 })])
    })

    it('retirada com saldo autorizada para R$ 500 não cobre saldo de R$ 1.000', async () => {
      const g = await garment()
      const r = await draft(input([{ garmentId: g.id, unitPrice: 2000 }]))
      expect((await signAndConfirm(r.id, 1000)).ok).toBe(true)
      await as(atend, 'public.mark_reservation_ready($1)', [r.id])
      const decisions = JSON.stringify(r.items.map((i) => ({ itemId: i.id, delivered: true })))
      const small = await authorize('retirada_com_saldo', 'reserva', r.id, 500)
      expect(await errOf(as(atend, 'public.pickup_reservation_items($1, $2, $3)', [r.id, decisions, small]))).toMatchObject({
        message: 'SALDO_EM_ABERTO',
        hint: 'R$ 1.000,00',
      })
      const enough = await authorize('retirada_com_saldo', 'reserva', r.id, 1000)
      const out = await as<Res>(atend, 'public.pickup_reservation_items($1, $2, $3)', [r.id, decisions, enough])
      expect(out.state).toBe('em_uso')
    })
  })

  describe('3 · PIN: teto de 10 erros em 24 h', () => {
    const tryPin = (pin: string) => as<{ ok: boolean; error?: string }>(atend, `public.authorize_exception('ana@senzi.test', $1, 'retirada_com_saldo', 'x', 'reserva', null)`, [pin])
    const failuresAgo = (hours: number[]) =>
      db.query(`insert into public.pin_attempt (admin_id, ok, at) select $1, false, now() - make_interval(hours => h) from unnest($2::int[]) h`, [admin, hours])

    beforeEach(async () => {
      await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('1234')`))
    })

    it('9 erros em 24 h (fora da janela de 15 min) ainda deixam autorizar', async () => {
      await failuresAgo([10, 9, 8, 7, 6, 5, 4, 3, 2])
      expect(await tryPin('1234')).toMatchObject({ ok: true })
    })

    it('10 erros em 24 h bloqueiam até a admin trocar o PIN, mesmo passadas as 24 h', async () => {
      // Entre 40 h e 31 h atrás: dentro de 24 h entre si, fora das janelas de 15 min e de 24 h de agora.
      await failuresAgo([40, 39, 38, 37, 36, 35, 34, 33, 32, 31])
      expect(await tryPin('1234')).toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
      const before = (await db.query<{ n: number }>('select count(*)::int n from public.pin_attempt where admin_id = $1', [admin])).rows[0]!.n
      expect(await tryPin('0000')).toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
      const after = (await db.query<{ n: number }>('select count(*)::int n from public.pin_attempt where admin_id = $1', [admin])).rows[0]!.n
      expect(after).toBe(before)
      await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('5678')`))
      expect(await tryPin('5678')).toMatchObject({ ok: true })
    })

    it('10 erros espalhados por mais de 24 h não bloqueiam', async () => {
      await failuresAgo([60, 55, 50, 45, 40, 30, 20, 10, 5, 2])
      expect(await tryPin('1234')).toMatchObject({ ok: true })
    })
  })

  describe('4 · storage pecas-fotos', () => {
    const put = (user: string, name: string) =>
      asUser(db, user, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('pecas-fotos', $1)`, [name]))
    const del = (user: string, name: string) =>
      asUser(db, user, (tx) => tx.query(`delete from storage.objects where bucket_id = 'pecas-fotos' and name = $1`, [name]))

    it('storage.foldername do shim: pastas do caminho, sem o arquivo', async () => {
      const { rows } = await db.query<{ a: string[]; b: string[]; c: string[] }>(
        `select storage.foldername('a/b/c.jpg') a, storage.foldername('x/c.jpg') b, storage.foldername('c.jpg') c`,
      )
      expect(rows[0]).toEqual({ a: ['a', 'b'], b: ['x'], c: [] })
    })

    it('envio só para <id de peça existente>/<arquivo>', async () => {
      const g = await garment()
      await expect(put(atend, `00000000-0000-0000-0000-000000000000/a.jpg`)).rejects.toThrow(/row-level security/)
      await expect(put(atend, `x/a.jpg`)).rejects.toThrow(/row-level security/)
      await expect(put(atend, `a.jpg`)).rejects.toThrow(/row-level security/)
      await expect(put(atend, `${g.id}/sub/a.jpg`)).rejects.toThrow(/row-level security/)
      await put(atend, `${g.id}/a.jpg`)
    })

    it('arquivo registrado como foto não se apaga; depois de remover o registro, sim', async () => {
      const g = await garment()
      const path = `${g.id}/capa.jpg`
      await put(atend, path)
      const withPhoto = await as<Garment>(atend, 'public.add_garment_photo($1, $2, $3)', [g.id, 'frente', path])
      expect((await del(atend, path)).affectedRows).toBe(0)
      await as(atend, 'public.remove_garment_photo($1, $2)', [g.id, withPhoto.photos[0]!.id])
      expect((await del(atend, path)).affectedRows).toBe(1)
    })

    it('arquivo registrado em inspeção também não se apaga', async () => {
      const g = await garment()
      const path = `${g.id}/dano.jpg`
      await put(atend, path)
      const { rows } = await db.query<{ id: string }>(
        `insert into public.inspection (garment_id, inspector_id, result) values ($1, $2, 'aprovada') returning id`,
        [g.id, admin],
      )
      await db.query(`insert into public.inspection_photo (inspection_id, kind, storage_path, position) values ($1, 'dano', $2, 0)`, [rows[0]!.id, path])
      expect((await del(atend, path)).affectedRows).toBe(0)
    })

    it('add_garment_photo recusa nome que começa com ponto', async () => {
      const g = await garment()
      for (const name of ['.hidden.jpg', '.jpg', '..jpg']) {
        expect(await errOf(as(atend, 'public.add_garment_photo($1, $2, $3)', [g.id, 'frente', `${g.id}/${name}`]))).toMatchObject({
          message: 'PARAMETRO_INVALIDO',
          detail: 'file',
        })
      }
      const ok = await as<Garment>(atend, 'public.add_garment_photo($1, $2, $3)', [g.id, 'frente', `${g.id}/foto.v2.jpg`])
      expect(ok.photos).toHaveLength(1)
    })
  })

  describe('5 · clientes', () => {
    it('CPF repetido com referência inválida → erro da referência (sem oráculo de CPF)', async () => {
      const base = { fullName: 'Outra Pessoa', phone: '63996124478', birthDate: '1990-01-01', cpf: '529.982.247-25' }
      for (const [extra, field] of [
        [{ idealGarmentId: '00000000-0000-0000-0000-000000000000' }, 'idealGarmentId'],
        [{ leadSource: 'tiktok' }, 'leadSource'],
        [{ vip: 'sim' }, 'vip'],
        [{ preferences: 'x' }, 'preferences'],
      ] as const) {
        expect(await errOf(as(atend, 'public.create_customer($1)', [JSON.stringify({ ...base, ...extra })]))).toMatchObject({
          message: 'PARAMETRO_INVALIDO',
          detail: field,
        })
      }
      expect(await errOf(as(atend, 'public.create_customer($1)', [JSON.stringify(base)]))).toMatchObject({ message: 'CPF_DUPLICADO', detail: 'cpf' })
    })

    it('auditoria guarda o CPF mascarado (insert e update)', async () => {
      const c = await as<{ id: string }>(admin, 'public.create_customer($1)', [
        JSON.stringify({ fullName: 'Verônica Pontes', phone: '63996124478', birthDate: '1990-01-01', cpf: '123.456.789-09' }),
      ])
      await as(admin, 'public.update_customer($1, $2)', [c.id, JSON.stringify({ cpf: '111.444.777-35' })])
      const { rows } = await db.query<{ action: string; b: string | null; a: string | null }>(
        `select action, before ->> 'cpf' b, after ->> 'cpf' a from public.audit_log where table_name = 'customer' and row_id = $1 order by id`,
        [c.id],
      )
      expect(rows.length).toBeGreaterThanOrEqual(2)
      expect(rows[0]).toEqual({ action: 'insert', b: null, a: '***456789**' })
      expect(rows.at(-1)).toEqual({ action: 'update', b: '***456789**', a: '***444777**' })
      const leaked = await db.query(`select 1 from public.audit_log where before::text like '%12345678909%' or after::text like '%12345678909%'`)
      expect(leaked.rows).toEqual([])
    })
  })
})

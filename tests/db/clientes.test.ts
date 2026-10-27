import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type C = {
  id: string
  code: string
  fullName: string
  phone: string
  cpf: string
  email: string | null
  state: string | null
  birthDate: string
  vip: boolean
  idealGarmentId: string | null
  measurements: { measuredAt: string; usualSize: string | null; bustCm: number | null; source: string; sourceGarmentId: string | null; measuredBy: string | null; notes: string | null }[]
  preferences: { preferredColors: string[]; avoidedColors: string[]; preferredLengths: string[]; sleeve: string | null; neckline: string | null }
  interactions: { id: string; content: string; channel: string; pinned: boolean; authorName: string }[]
  favorites: { garmentId: string; source: string }[]
  stats: { rentals: number; spent: number | null; nextEvent: string | null }
}
type Rec = { garment: { id: string; code: string; colorPrimary: string; sizeEquiv: string }; score: number; reasons: string[] }

const CPF = '529.982.247-25'

const input = (over: Record<string, unknown> = {}) => ({
  fullName: 'Mariana Fontes Ribeiro',
  phone: '(63) 99612-4478',
  birthDate: '1995-03-10',
  cpf: CPF,
  instagram: '@mari',
  email: 'mari@ex.com',
  city: 'Palmas',
  state: 'to',
  leadSource: 'instagram',
  ...over,
})

const GARMENT = {
  categorySlug: 'vestido-longo',
  labelSize: '38',
  colorHex: '#0E5C4A',
  fabric: 'Crepe',
  neckline: '',
  sleeve: '',
  style: '',
  occasions: [],
  fitNotes: '',
  acquisitionCost: null,
  retailReference: null,
  cleaningDays: null,
  location: '',
}

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

describe('clientes', () => {
  let db: PGlite
  let admin: string
  let atend: string

  const create = (user: string, over: Record<string, unknown> = {}) =>
    asUser(db, user, (tx) => rpc<C>(tx, 'public.create_customer($1)', [JSON.stringify(input(over))]))
  const garment = (over: Record<string, unknown>) =>
    asUser(db, admin, (tx) => rpc<{ id: string; code: string }>(tx, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, ...over })]))
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])
  const search = (user: string, q: string, sort = 'nome', limit = 50, offset = 0) =>
    asUser(db, user, (tx) => rpc<{ items: C[]; total: number }>(tx, 'public.search_customers($1, $2, $3, $4)', [q, sort, limit, offset]))
  const get = (user: string, id: string) => asUser(db, user, (tx) => rpc<C | null>(tx, 'public.get_customer($1)', [id]))

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
  })

  afterEach(async () => {
    await db.close()
  })

  it('is_valid_cpf: com e sem máscara, todos iguais e verificador errado', async () => {
    const { rows } = await db.query<{ a: boolean; b: boolean; c: boolean; d: boolean }>(
      `select public.is_valid_cpf('529.982.247-25') a, public.is_valid_cpf('52998224725') b,
              public.is_valid_cpf('111.111.111-11') c, public.is_valid_cpf('529.982.247-24') d`,
    )
    expect(rows[0]).toEqual({ a: true, b: true, c: false, d: false })
  })

  describe('create_customer', () => {
    it('gera CL-0001/CL-0002, guarda só dígitos, UF maiúscula, stats zeradas e auditoria', async () => {
      const a = await create(atend)
      const b = await create(atend, { cpf: '123.456.789-09', fullName: 'Verônica Pontes' })
      expect(a.code).toBe('CL-0001')
      expect(b.code).toBe('CL-0002')
      expect(a).toMatchObject({ phone: '63996124478', cpf: '52998224725', state: 'TO', vip: false, measurements: [], interactions: [], favorites: [] })
      expect(a.stats).toEqual({ rentals: 0, spent: 0, nextEvent: null })
      expect(a.preferences).toEqual({ preferredColors: [], avoidedColors: [], preferredLengths: [], sleeve: null, neckline: null })
      const { rows } = await db.query(`select 1 from public.audit_log where table_name = 'customer' and row_id = $1 and action = 'insert'`, [a.id])
      expect(rows).toHaveLength(1)
    })

    it('regras: nome, telefone, nascimento, CPF, e-mail, duplicidade e faixas de medida', async () => {
      await create(atend)
      const tomorrow = (await db.query<{ d: string }>(`select (public.store_today() + 1)::text d`)).rows[0].d
      const cases: [Record<string, unknown>, string, string][] = [
        [{ fullName: 'Ma' }, 'NOME_CLIENTE_OBRIGATORIO', 'fullName'],
        [{ phone: '123' }, 'TELEFONE_INVALIDO', 'phone'],
        [{ birthDate: '' }, 'NASCIMENTO_INVALIDO', 'birthDate'],
        [{ birthDate: '2001-02-31' }, 'NASCIMENTO_INVALIDO', 'birthDate'],
        [{ birthDate: tomorrow }, 'NASCIMENTO_INVALIDO', 'birthDate'],
        [{ cpf: '111.111.111-11' }, 'CPF_INVALIDO', 'cpf'],
        [{ cpf: '52998224725' }, 'CPF_DUPLICADO', 'cpf'],
        [{ cpf: '123.456.789-09', email: 'x@' }, 'EMAIL_INVALIDO', 'email'],
        [{ cpf: '123.456.789-09', measurement: { bustCm: 400 } }, 'PARAMETRO_INVALIDO', 'bustCm'],
        [{ cpf: '123.456.789-09', idealGarmentId: '00000000-0000-0000-0000-000000000000' }, 'PARAMETRO_INVALIDO', 'idealGarmentId'],
        [{ cpf: '123.456.789-09', leadSource: 'tiktok' }, 'PARAMETRO_INVALIDO', 'leadSource'],
      ]
      for (const [over, code, field] of cases) {
        const err = await create(atend, over).catch((e: { message: string; detail?: string }) => e)
        expect(err, JSON.stringify(over)).toMatchObject({ message: code, detail: field })
      }
    })

    it('modelo ideal: ideal_measurements da peça e versão modelo_ideal', async () => {
      const g = await garment({ name: 'Verona', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Verde', rentalPrice: 890 })
      await asUser(db, admin, (tx) => tx.query('select public.update_garment_measurement($1, $2)', [g.id, JSON.stringify({ bustCm: 88, waistCm: 70, hipCm: 96 })]))
      const ideal = await asUser(db, atend, (tx) => rpc<Record<string, unknown>>(tx, 'public.ideal_measurements($1)', [g.id]))
      expect(ideal).toEqual({ usualSize: 'M', bustCm: 88, waistCm: 70, hipCm: 96, shoulderCm: null, preferredLength: 'longo' })
      const c = await create(atend, { idealGarmentId: g.id, measurement: ideal })
      expect(c.idealGarmentId).toBe(g.id)
      expect(c.measurements).toEqual([
        expect.objectContaining({ source: 'modelo_ideal', sourceGarmentId: g.id, bustCm: 88, usualSize: 'M', measuredBy: 'Bia Atendimento' }),
      ])
      await expect(asUser(db, atend, (tx) => tx.query('select public.ideal_measurements(gen_random_uuid())'))).rejects.toThrow('NAO_ENCONTRADO')
    })

    it('medida só com origem não cria versão', async () => {
      const c = await create(atend, { measurement: { source: 'manual', bustCm: null, shoeSize: '' } })
      expect(c.measurements).toEqual([])
    })

    it('sem cliente.create → SEM_PERMISSAO', async () => {
      await deny(atend, 'cliente.create')
      await expect(create(atend)).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  describe('update_customer', () => {
    it('só os campos enviados; preferências mescladas; mesmo CPF da própria cliente é aceito', async () => {
      const c = await create(atend, { preferences: { preferredColors: ['Verde'], sleeve: 'Longa' } })
      const u = await asUser(db, atend, (tx) =>
        rpc<C>(tx, 'public.update_customer($1, $2)', [c.id, JSON.stringify({ cpf: CPF, vip: true, email: '  ', preferences: { avoidedColors: ['Amarelo'] } })]),
      )
      expect(u).toMatchObject({ fullName: 'Mariana Fontes Ribeiro', vip: true, email: null })
      expect(u.preferences).toMatchObject({ preferredColors: ['Verde'], avoidedColors: ['Amarelo'], sleeve: 'Longa' })
    })

    it('nome vazio → NOME_CLIENTE_OBRIGATORIO; CPF de outra → CPF_DUPLICADO; inexistente → NAO_ENCONTRADO', async () => {
      const a = await create(atend)
      await create(atend, { cpf: '123.456.789-09' })
      const up = (id: string, p: unknown) => asUser(db, atend, (tx) => tx.query('select public.update_customer($1, $2)', [id, JSON.stringify(p)]))
      await expect(up(a.id, { fullName: '' })).rejects.toThrow('NOME_CLIENTE_OBRIGATORIO')
      await expect(up(a.id, { cpf: '12345678909' })).rejects.toThrow('CPF_DUPLICADO')
      await expect(up('00000000-0000-0000-0000-000000000000', { vip: true })).rejects.toThrow('NAO_ENCONTRADO')
    })

    it('sem cliente.edit → SEM_PERMISSAO', async () => {
      const a = await create(atend)
      await deny(atend, 'cliente.edit')
      await expect(asUser(db, atend, (tx) => tx.query('select public.update_customer($1, $2)', [a.id, '{"vip":true}']))).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  describe('medidas, observações e favoritos', () => {
    it('add_customer_measurement: versões novas, mais recente primeiro, origem manual', async () => {
      const c = await create(atend)
      await asUser(db, atend, (tx) => tx.query('select public.add_customer_measurement($1, $2)', [c.id, JSON.stringify({ usualSize: 'M', bustCm: 90 })]))
      const m = await asUser(db, atend, (tx) =>
        rpc<C>(tx, 'public.add_customer_measurement($1, $2)', [c.id, JSON.stringify({ usualSize: 'G', bustCm: 95, notes: ' Na prova ' })]),
      )
      const today = (await db.query<{ d: string }>(`select public.store_today()::text d`)).rows[0].d
      expect(m.measurements.map((x) => x.usualSize)).toEqual(['G', 'M'])
      expect(m.measurements[0]).toMatchObject({ bustCm: 95, measuredAt: today, source: 'manual', sourceGarmentId: null, notes: 'Na prova' })
      await expect(
        asUser(db, atend, (tx) => tx.query('select public.add_customer_measurement($1, $2)', [c.id, '{"heightCm": 301}'])),
      ).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('observações: vazia → OBSERVACAO_OBRIGATORIA; fixar/desafixar; outra cliente → NAO_ENCONTRADO', async () => {
      const c = await create(atend)
      const other = await create(atend, { cpf: '123.456.789-09' })
      await expect(asUser(db, atend, (tx) => tx.query(`select public.add_customer_note($1, '   ', 'presencial', false)`, [c.id]))).rejects.toThrow(
        'OBSERVACAO_OBRIGATORIA',
      )
      await expect(asUser(db, atend, (tx) => tx.query(`select public.add_customer_note($1, 'x', 'fax', false)`, [c.id]))).rejects.toThrow('PARAMETRO_INVALIDO')
      await asUser(db, atend, (tx) => tx.query(`select public.add_customer_note($1, 'Primeira', 'presencial', false)`, [c.id]))
      const n = await asUser(db, atend, (tx) => rpc<C>(tx, `public.add_customer_note($1, ' Prefere à noite. ', 'whatsapp', true)`, [c.id]))
      expect(n.interactions.map((i) => i.content)).toEqual(['Prefere à noite.', 'Primeira'])
      expect(n.interactions[0]).toMatchObject({ channel: 'whatsapp', pinned: true, authorName: 'Bia Atendimento' })
      const id = n.interactions[0]!.id
      const u = await asUser(db, atend, (tx) => rpc<C>(tx, 'public.set_customer_note_pinned($1, $2, false)', [c.id, id]))
      expect(u.interactions[0]!.pinned).toBe(false)
      await expect(asUser(db, atend, (tx) => tx.query('select public.set_customer_note_pinned($1, $2, true)', [other.id, id]))).rejects.toThrow('NAO_ENCONTRADO')
    })

    it('sem cliente.note não registra observação', async () => {
      const c = await create(atend)
      await deny(atend, 'cliente.note')
      await expect(asUser(db, atend, (tx) => tx.query(`select public.add_customer_note($1, 'x', 'presencial', false)`, [c.id]))).rejects.toThrow('SEM_PERMISSAO')
    })

    it('favoritos ligam/desligam; peça inexistente → NAO_ENCONTRADO', async () => {
      const c = await create(atend)
      const g = await garment({ name: 'Verona', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Verde', rentalPrice: 890 })
      const on = await asUser(db, atend, (tx) => rpc<C>(tx, 'public.set_customer_favorite($1, $2, true)', [c.id, g.id]))
      expect(on.favorites).toEqual([expect.objectContaining({ garmentId: g.id, source: 'manual' })])
      const again = await asUser(db, atend, (tx) => rpc<C>(tx, 'public.set_customer_favorite($1, $2, true)', [c.id, g.id]))
      expect(again.favorites).toHaveLength(1)
      const off = await asUser(db, atend, (tx) => rpc<C>(tx, 'public.set_customer_favorite($1, $2, false)', [c.id, g.id]))
      expect(off.favorites).toEqual([])
      await expect(asUser(db, atend, (tx) => tx.query('select public.set_customer_favorite($1, gen_random_uuid(), true)', [c.id]))).rejects.toThrow(
        'NAO_ENCONTRADO',
      )
    })
  })

  describe('leitura', () => {
    it('busca por telefone com máscara, CPF, código, Instagram e sem acento; ordem pt-BR; paginação', async () => {
      const m = await create(atend)
      const v = await create(atend, { fullName: 'Verônica Pontes', cpf: '123.456.789-09', phone: '63 98888-7777', instagram: '@vero', city: 'Gurupi' })
      await create(atend, { fullName: 'Ana Beatriz', cpf: '987.654.321-00', phone: '6332154478', instagram: null, city: null })
      const ids = async (q: string) => (await search(atend, q)).items.map((c) => c.id)
      expect(await ids('63 99612-4478')).toEqual([m.id])
      expect(await ids('529.982.247-25')).toEqual([m.id])
      expect(await ids('veronica')).toEqual([v.id])
      expect(await ids('cl-0002')).toEqual([v.id])
      expect(await ids('@vero')).toEqual([v.id])
      expect(await ids('gurupi')).toEqual([v.id])
      expect(await ids('63')).toEqual([])
      const all = await search(atend, '')
      expect(all.total).toBe(3)
      expect(all.items.map((c) => c.fullName)).toEqual(['Ana Beatriz', 'Mariana Fontes Ribeiro', 'Verônica Pontes'])
      const page = await search(atend, '', 'nome', 1, 1)
      expect(page).toMatchObject({ total: 3, items: [expect.objectContaining({ fullName: 'Mariana Fontes Ribeiro' })] })
      expect((await search(atend, '', 'recentes')).items[0]!.fullName).toBe('Ana Beatriz')
      await expect(search(atend, '', 'idade')).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('sem cliente.edit: CPF oculto (só os 6 do meio) e busca por CPF não casa', async () => {
      const m = await create(atend)
      await deny(atend, 'cliente.edit')
      expect((await get(atend, m.id))!.cpf).toBe('***982247**')
      expect((await search(atend, '52998224725')).items).toEqual([])
      expect((await search(atend, '99612')).items.map((c) => c.id)).toEqual([m.id])
      expect((await get(admin, m.id))!.cpf).toBe('52998224725')
    })

    it('sem financeiro.view: gasto sai null e "gasto" ordena por nome', async () => {
      const m = await create(atend)
      await deny(atend, 'financeiro.view')
      expect((await get(atend, m.id))!.stats).toEqual({ rentals: 0, spent: null, nextEvent: null })
      expect((await search(atend, '', 'gasto')).items[0]!.stats.spent).toBeNull()
      expect((await get(admin, m.id))!.stats.spent).toBe(0)
    })

    it('get_customer inexistente → null; sem cliente.view → SEM_PERMISSAO', async () => {
      expect(await get(atend, '00000000-0000-0000-0000-000000000000')).toBeNull()
      await deny(atend, 'cliente.view')
      await expect(search(atend, '')).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  describe('recommend_garments', () => {
    it('cliente M que evita amarelo e ama verde', async () => {
      const ideal = await garment({ name: 'Verona', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Azul', rentalPrice: 900 })
      const verde = await garment({ name: 'Esmeralda', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Verde esmeralda', rentalPrice: 700 })
      const amarela = await garment({ name: 'Sol', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Amarelo ouro', rentalPrice: 500 })
      const fav = await garment({ name: 'Favorita', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Verde', rentalPrice: 400 })
      const g = await garment({ name: 'Grande', categorySlug: 'saia', sizeEquiv: 'G', length: 'curto', colorPrimary: 'Preto', rentalPrice: 300 })
      const bloq = await garment({ name: 'Bloqueada', sizeEquiv: 'M', length: 'longo', colorPrimary: 'Verde', rentalPrice: 100 })
      await db.query(`update public.garment set state = 'bloqueado' where id = $1`, [bloq.id])
      const c = await create(atend, {
        idealGarmentId: ideal.id,
        measurement: { usualSize: 'M', bustCm: 88, waistCm: 70 },
        preferences: { preferredColors: ['Vermelho', 'Verde'], avoidedColors: ['amarelo'] },
      })
      await asUser(db, atend, (tx) => tx.query('select public.set_customer_favorite($1, $2, true)', [c.id, fav.id]))
      const recs = await asUser(db, atend, (tx) => rpc<Rec[]>(tx, 'public.recommend_garments($1, 8)', [c.id]))
      const codes = recs.map((r) => r.garment.id)
      expect(codes).not.toContain(amarela.id)
      expect(codes).not.toContain(fav.id)
      expect(codes).not.toContain(bloq.id)
      expect(codes).not.toContain(g.id)
      expect(recs[0]!.garment.id).toBe(verde.id)
      expect(recs[0]!.score).toBe(4 + 3 + 2)
      expect(recs[0]!.reasons).toEqual(['No tamanho dela (M)', 'Parecida com Verona', 'Cor que ela ama (Verde)'])
      // o próprio modelo ideal: parecido com a favorita (mesma categoria), não com ele mesmo
      expect(recs.find((r) => r.garment.id === ideal.id)!.reasons).toEqual(['No tamanho dela (M)', 'Parecida com Favorita'])
      expect(await asUser(db, atend, (tx) => rpc<Rec[]>(tx, 'public.recommend_garments($1, 1)', [c.id]))).toHaveLength(1)
      await deny(atend, 'acervo.view')
      expect(await asUser(db, atend, (tx) => rpc<Rec[]>(tx, 'public.recommend_garments($1)', [c.id]))).toEqual([])
    })

    it('caimento compatível e comprimento preferido', async () => {
      const ok = await garment({ name: 'Cabe', sizeEquiv: 'G', length: 'midi', colorPrimary: 'Preto', rentalPrice: 300 })
      await asUser(db, admin, (tx) => tx.query('select public.update_garment_fit($1, $2)', [ok.id, JSON.stringify({ bustComfortCm: 92, waistMaxCm: 74 })]))
      const c = await create(atend, { measurement: { bustCm: 90, waistCm: 72, preferredLength: 'midi' } })
      const recs = await asUser(db, atend, (tx) => rpc<Rec[]>(tx, 'public.recommend_garments($1)', [c.id]))
      expect(recs).toEqual([expect.objectContaining({ score: 4, reasons: ['Comprimento preferido', 'Caimento compatível com as medidas'] })])
    })
  })

  describe('anônimo e funções internas', () => {
    it('anônimo não lê tabelas nem chama RPCs', async () => {
      await expect(asAnon(db, (tx) => tx.query('select id from public.customer'))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(`select public.search_customers('', 'nome', 10, 0)`))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(`select public.create_customer('{}')`))).rejects.toThrow(/permission denied/)
    })

    it('autenticado não lê tabelas nem chama funções internas', async () => {
      await expect(asUser(db, admin, (tx) => tx.query('select cpf from public.customer'))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query('select public.customer_json(gen_random_uuid())'))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query(`select public.customer_apply(gen_random_uuid(), '{}')`))).rejects.toThrow(/permission denied/)
    })
  })
})

import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type G = {
  id: string
  code: string
  name: string
  state: string
  brandName: string | null
  acquisitionCost: number | null
  retailReference: number | null
  photos: { id: string; kind: string; path: string; isCover: boolean }[]
  blocks: { id: string; kind: string; from: string; to: string; note: string | null }[]
  history: { from: string | null; to: string; reason: string; userName: string }[]
  measurement: Record<string, unknown>
}

const BASE = {
  name: 'Vestido Verona',
  categorySlug: 'vestido-longo',
  brandName: 'PatBO',
  labelSize: '38',
  sizeEquiv: 'M',
  colorPrimary: 'Verde esmeralda',
  colorHex: '#0E5C4A',
  fabric: 'Crepe com fenda',
  length: 'longo',
  neckline: 'Tomara que caia',
  sleeve: 'Sem manga',
  style: 'Reto fluido',
  occasions: ['Formatura', 'Casamento'],
  fitNotes: '',
  rentalPrice: 890,
  acquisitionCost: 3200,
  retailReference: 8900,
  cleaningDays: null,
  location: 'Arara A',
}

async function create(tx: Transaction, input: Record<string, unknown> = {}): Promise<G> {
  const { rows } = await tx.query<{ g: G }>('select public.create_garment($1) as g', [JSON.stringify({ ...BASE, ...input })])
  return rows[0].g
}

async function rpc<T>(tx: Transaction, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await tx.query<{ r: T }>(`select ${sql} as r`, params)
  return rows[0].r
}

const today = async (db: PGlite) => (await db.query<{ d: string }>(`select public.store_today()::text as d`)).rows[0].d
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

describe('acervo', () => {
  let db: PGlite
  let admin: string
  let atend: string

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
  })

  afterEach(async () => {
    await db.close()
  })

  describe('create_garment', () => {
    it('gera SZ-0001 e SZ-0002, cria medidas vazias, histórico e auditoria', async () => {
      const a = await asUser(db, admin, (tx) => create(tx))
      const b = await asUser(db, admin, (tx) => create(tx, { name: 'Amalfi' }))
      expect(a.code).toBe('SZ-0001')
      expect(b.code).toBe('SZ-0002')
      expect(a.state).toBe('disponivel')
      expect(a.brandName).toBe('PatBO')
      expect(a.acquisitionCost).toBe(3200)
      expect(a.history).toEqual([
        expect.objectContaining({ from: null, to: 'disponivel', reason: 'Peça cadastrada no acervo', userName: 'Ana Admin' }),
      ])
      expect(a.measurement).toMatchObject({ bustCm: null, stretch: null })
      const { rows } = await db.query(`select 1 from public.audit_log where table_name = 'garment' and row_id = $1 and action = 'insert'`, [a.id])
      expect(rows).toHaveLength(1)
    })

    it('marca reaproveitada sem diferenciar maiúsculas', async () => {
      await asUser(db, admin, (tx) => create(tx))
      await asUser(db, admin, (tx) => create(tx, { brandName: 'patbo' }))
      const { rows } = await db.query('select name from public.brand')
      expect(rows).toEqual([{ name: 'PatBO' }])
    })

    it('atendimento (sem acervo.create) → SEM_PERMISSAO', async () => {
      await expect(asUser(db, atend, (tx) => create(tx))).rejects.toThrow('SEM_PERMISSAO')
    })

    it('nome curto → NOME_OBRIGATORIO; preço 0 → VALOR_LOCACAO_OBRIGATORIO; categoria inexistente → PARAMETRO_INVALIDO', async () => {
      await expect(asUser(db, admin, (tx) => create(tx, { name: 'A' }))).rejects.toThrow('NOME_OBRIGATORIO')
      await expect(asUser(db, admin, (tx) => create(tx, { rentalPrice: 0 }))).rejects.toThrow('VALOR_LOCACAO_OBRIGATORIO')
      await expect(asUser(db, admin, (tx) => create(tx, { categorySlug: 'nada' }))).rejects.toThrow('PARAMETRO_INVALIDO')
      await expect(asUser(db, admin, (tx) => create(tx, { acquisitionCost: -1 }))).rejects.toThrow('PARAMETRO_INVALIDO')
    })
  })

  describe('custos', () => {
    it('atendimento não vê custos; garment_costs e acervo_investment → SEM_PERMISSAO', async () => {
      const g = await asUser(db, admin, (tx) => create(tx))
      const seen = await asUser(db, atend, (tx) => rpc<G>(tx, 'public.get_garment($1)', [g.id]))
      expect(seen.acquisitionCost).toBeNull()
      expect(seen.retailReference).toBeNull()
      await expect(asUser(db, atend, (tx) => tx.query('select * from public.garment_costs($1)', [[g.id]]))).rejects.toThrow('SEM_PERMISSAO')
      await expect(asUser(db, atend, (tx) => tx.query('select public.acervo_investment()'))).rejects.toThrow('SEM_PERMISSAO')
      await expect(asUser(db, atend, (tx) => tx.query('select acquisition_cost from public.garment'))).rejects.toThrow(/permission denied/)
    })

    it('admin vê custos e investimento (sem baixadas)', async () => {
      const g = await asUser(db, admin, (tx) => create(tx))
      const h = await asUser(db, admin, (tx) => create(tx, { name: 'Baixada', acquisitionCost: 1000 }))
      await db.query(`update public.garment set state = 'baixado' where id = $1`, [h.id])
      const { rows } = await asUser(db, admin, (tx) => tx.query('select garment_id, acquisition_cost::float as c from public.garment_costs($1)', [[g.id]]))
      expect(rows).toEqual([{ garment_id: g.id, c: 3200 }])
      expect(Number(await asUser(db, admin, (tx) => rpc<string>(tx, 'public.acervo_investment()')))).toBe(3200)
    })

    it('update_garment de atendimento ignora custos', async () => {
      const g = await asUser(db, admin, (tx) => create(tx))
      await asUser(db, atend, (tx) => rpc<G>(tx, 'public.update_garment($1, $2)', [g.id, JSON.stringify({ acquisitionCost: 1, name: 'Verona II' })]))
      const { rows } = await db.query<{ name: string; c: number }>('select name, acquisition_cost::float as c from public.garment where id = $1', [g.id])
      expect(rows[0]).toEqual({ name: 'Verona II', c: 3200 })
    })
  })

  describe('busca e contagem', () => {
    beforeEach(async () => {
      await asUser(db, admin, async (tx) => {
        await create(tx)
        await create(tx, { name: 'Amalfi', colorPrimary: 'Vinho marsala', sizeEquiv: 'G' })
        const c = await create(tx, { name: 'Capri', colorPrimary: 'Azul serenity' })
        await tx.query(`select public.update_garment($1, '{}')`, [c.id])
      })
      await db.query(`update public.garment set state = 'higienizacao' where name = 'Capri'`)
      await db.query(`update public.garment set state = 'baixado' where name = 'Amalfi'`)
    })

    const search = (q: string, group: string | null = null, size: string | null = null, limit = 20) =>
      asUser(db, atend, (tx) =>
        rpc<{ items: G[]; total: number }>(tx, 'public.search_garments($1, $2, $3, $4, $5, $6)', [q, null, group, size, limit, 0]),
      )

    it('busca sem acento e sem diferenciar maiúsculas', async () => {
      expect((await search('VERÔNA')).items.map((g) => g.name)).toEqual(['Vestido Verona'])
      expect((await search('esmeralda')).total).toBe(1)
      expect((await search('sz-0003')).items.map((g) => g.name)).toEqual(['Capri'])
    })

    it('padrão esconde baixadas; todos inclui; ciclo só estados de ciclo', async () => {
      expect((await search('')).total).toBe(2)
      expect((await search('', 'todos')).total).toBe(3)
      expect((await search('', 'ciclo')).items.map((g) => g.name)).toEqual(['Capri'])
      expect((await search('', 'todos', 'G')).items.map((g) => g.name)).toEqual(['Amalfi'])
    })

    it('total correto com limite 1', async () => {
      const r = await search('', 'todos', null, 1)
      expect(r.items).toHaveLength(1)
      expect(r.total).toBe(3)
    })

    it('garment_counts', async () => {
      const c = await asUser(db, atend, (tx) => rpc<Record<string, number>>(tx, 'public.garment_counts($1, $2, $3)', ['', null, null]))
      expect(c).toEqual({ todos: 3, ativas: 2, disponivel: 1, reservado: 0, em_uso: 0, ciclo: 1, bloqueado: 0 })
    })

    it('grupo de estado inválido → PARAMETRO_INVALIDO', async () => {
      await expect(search('', 'xyz')).rejects.toThrow('PARAMETRO_INVALIDO')
    })
  })

  describe('bloqueios', () => {
    let g: G
    beforeEach(async () => {
      g = await asUser(db, admin, (tx) => create(tx))
    })

    const block = (from: string, to: string, user = atend) =>
      asUser(db, user, (tx) => rpc<G>(tx, 'public.block_garment($1, $2, $3, $4)', [g.id, from, to, 'Sessão de fotos']))

    it('período invertido → PERIODO_INVALIDO', async () => {
      await expect(block('2030-01-10', '2030-01-05')).rejects.toThrow('PERIODO_INVALIDO')
    })

    it('sobreposição → CONFLITO_AGENDA com o período no hint; liberado, o período volta a ser aceito', async () => {
      const r = await block('2030-01-10', '2030-01-12')
      expect(r.blocks).toEqual([expect.objectContaining({ kind: 'bloqueio_manual', from: '2030-01-10', to: '2030-01-12' })])
      const err = await block('2030-01-12', '2030-01-15').catch((e: { message: string; hint?: string }) => e)
      expect(err).toMatchObject({ message: 'CONFLITO_AGENDA', hint: '10/01/2030 – 12/01/2030' })
      await asUser(db, atend, (tx) => rpc<G>(tx, 'public.release_block($1, $2)', [g.id, r.blocks[0].id]))
      expect((await block('2030-01-12', '2030-01-15')).blocks).toHaveLength(1)
    })

    it('bloqueio cobrindo hoje → bloqueado; liberar → disponível (com histórico)', async () => {
      const t = await today(db)
      const r = await block(addDays(t, -1), addDays(t, 1))
      expect(r.state).toBe('bloqueado')
      const back = await asUser(db, atend, (tx) => rpc<G>(tx, 'public.release_block($1, $2)', [g.id, r.blocks[0].id]))
      expect(back.state).toBe('disponivel')
      expect(back.blocks).toEqual([])
      expect(back.history.map((h) => h.to)).toEqual(['disponivel', 'bloqueado', 'disponivel'])
    })

    it('sem acervo.block → SEM_PERMISSAO', async () => {
      await db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'acervo.block', false)`, [atend])
      await expect(block('2030-01-10', '2030-01-12')).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  describe('fotos', () => {
    let g: G
    beforeEach(async () => {
      g = await asUser(db, admin, (tx) => create(tx))
    })

    const add = (name: string, kind = 'frente') =>
      asUser(db, atend, (tx) => rpc<G>(tx, 'public.add_garment_photo($1, $2, $3)', [g.id, kind, `${g.id}/${name}`]))

    it('primeira vira capa; trocar capa; remover capa promove a próxima', async () => {
      await add('a.jpg')
      const two = await add('b.jpg', 'costas')
      expect(two.photos.map((p) => [p.path.split('/')[1], p.isCover])).toEqual([
        ['a.jpg', true],
        ['b.jpg', false],
      ])
      const swapped = await asUser(db, atend, (tx) => rpc<G>(tx, 'public.set_cover_photo($1, $2)', [g.id, two.photos[1].id]))
      expect(swapped.photos.map((p) => p.isCover)).toEqual([false, true])
      const path = await asUser(db, atend, (tx) => rpc<string>(tx, 'public.remove_garment_photo($1, $2)', [g.id, two.photos[1].id]))
      expect(path).toBe(`${g.id}/b.jpg`)
      const after = await asUser(db, atend, (tx) => rpc<G>(tx, 'public.get_garment($1)', [g.id]))
      expect(after.photos.map((p) => p.isCover)).toEqual([true])
    })

    it('caminho fora da pasta da peça → PARAMETRO_INVALIDO', async () => {
      await expect(
        asUser(db, atend, (tx) => tx.query('select public.add_garment_photo($1, $2, $3)', [g.id, 'frente', 'outra/a.jpg'])),
      ).rejects.toThrow('PARAMETRO_INVALIDO')
      await expect(
        asUser(db, atend, (tx) => tx.query('select public.add_garment_photo($1, $2, $3)', [g.id, 'frente', `${g.id}/../x.jpg`])),
      ).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('máximo de 10 fotos', async () => {
      for (let i = 0; i < 10; i++) await add(`f${i}.jpg`)
      await expect(add('f10.jpg')).rejects.toThrow('PARAMETRO_INVALIDO')
    })
  })

  describe('storage pecas-fotos', () => {
    it('bucket privado, só imagens, 10 MB', async () => {
      const { rows } = await db.query(`select public, file_size_limit::int as lim, allowed_mime_types from storage.buckets where id = 'pecas-fotos'`)
      expect(rows).toEqual([{ public: false, lim: 10485760, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] }])
    })

    const put = (user: string, name: string) =>
      asUser(db, user, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('pecas-fotos', $1)`, [name]))
    const list = (user: string) => asUser(db, user, (tx) => tx.query(`select name from storage.objects where bucket_id = 'pecas-fotos'`))

    it('quem edita o acervo envia (na pasta de uma peça), vê e apaga', async () => {
      const g = await asUser(db, admin, (tx) => create(tx))
      await put(atend, `${g.id}/a.jpg`)
      expect((await list(atend)).rows).toEqual([{ name: `${g.id}/a.jpg` }])
      const del = await asUser(db, atend, (tx) => tx.query(`delete from storage.objects where bucket_id = 'pecas-fotos' and name = $1`, [`${g.id}/a.jpg`]))
      expect(del.affectedRows).toBe(1)
    })

    it('sem acervo.edit não envia nem apaga; sem acervo.view não vê; anônimo não vê', async () => {
      const g = await asUser(db, admin, (tx) => create(tx))
      await put(admin, `${g.id}/a.jpg`)
      await db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'acervo.edit', false)`, [atend])
      await expect(put(atend, `${g.id}/b.jpg`)).rejects.toThrow(/row-level security/)
      const del = await asUser(db, atend, (tx) => tx.query(`delete from storage.objects where bucket_id = 'pecas-fotos'`))
      expect(del.affectedRows).toBe(0)
      await db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'acervo.view', false)`, [atend])
      expect((await list(atend)).rows).toEqual([])
      expect((await asAnon(db, (tx) => tx.query(`select name from storage.objects`))).rows).toEqual([])
    })
  })

  describe('anônimo', () => {
    it('não lê tabelas nem chama RPCs do acervo', async () => {
      await expect(asAnon(db, (tx) => tx.query('select id from public.garment'))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query('select public.get_garment(gen_random_uuid())'))).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(`select public.create_garment('{}')`))).rejects.toThrow(/permission denied/)
    })

    it('autenticado não chama funções internas', async () => {
      await expect(asUser(db, admin, (tx) => tx.query('select public.garment_json(gen_random_uuid())'))).rejects.toThrow(/permission denied/)
      await expect(asUser(db, admin, (tx) => tx.query(`select public.garment_set_state(gen_random_uuid(), 'baixado', 'x')`))).rejects.toThrow(/permission denied/)
    })
  })
})

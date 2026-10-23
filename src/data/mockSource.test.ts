import { isValidCPF } from '@/lib/cpf'
import { buildFixture } from './fixture'
import { createMockSource } from './mockSource'
import type { DataSource } from './source'
import { SourceError, type CustomerInput, type GarmentInput } from './types'

const TODAY = '2026-10-23'
const newSource = () => createMockSource({ latencyMs: 0, today: TODAY })

const ALL = { limit: 100, offset: 0 }

async function garmentByCode(src: DataSource, code: string) {
  const { items } = await src.searchGarments({ q: code, stateGroup: 'todos' }, ALL)
  const g = items.find((x) => x.code === code)
  if (!g) throw new Error(`peça ${code} não encontrada`)
  return g
}

async function customerByCode(src: DataSource, code: string) {
  const { items } = await src.searchCustomers(code, 'nome', ALL)
  const c = items.find((x) => x.code === code)
  if (!c) throw new Error(`cliente ${code} não encontrada`)
  return c
}

async function errorOf(p: Promise<unknown>): Promise<SourceError> {
  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(SourceError)
    return e as SourceError
  }
  throw new Error('esperava erro')
}

const garmentInput = (over: Partial<GarmentInput> = {}): GarmentInput => ({
  name: 'Vestido Girassol',
  categorySlug: 'vestido-longo',
  brandName: 'Ateliê Senzi',
  labelSize: '38',
  sizeEquiv: 'M',
  colorPrimary: 'Amarelo ouro',
  colorHex: '#E0B23A',
  fabric: 'Crepe',
  length: 'longo',
  neckline: 'V',
  sleeve: 'Sem manga',
  style: 'Reto',
  occasions: ['Festa'],
  fitNotes: '',
  rentalPrice: 500,
  acquisitionCost: 1000,
  retailReference: 3000,
  cleaningDays: null,
  location: 'Arara A · pos. 1',
  ...over,
})

const customerInput = (over: Partial<CustomerInput> = {}): CustomerInput => ({
  fullName: 'Helena Prado',
  phone: '(63) 99111-2233',
  birthDate: '1990-05-10',
  cpf: '123.456.789-09',
  ...over,
})

describe('fixture', () => {
  const fx = buildFixture(TODAY)

  it('tem 8 categorias, 10 marcas com Ateliê Senzi e as 28 peças SZ-0107…SZ-0296', () => {
    expect(fx.categories).toHaveLength(8)
    expect(fx.brands).toHaveLength(10)
    expect(fx.brands).toContain('Ateliê Senzi')
    expect(fx.garments).toHaveLength(28)
    expect(fx.garments[0]!.code).toBe('SZ-0107')
    expect(fx.garments[27]!.code).toBe('SZ-0296')
  })

  it('nada da grafia antiga da marca em lugar nenhum', () => {
    expect(JSON.stringify(fx)).not.toMatch(new RegExp('Senz' + 'ie'))
  })

  it('≥ 30 clientes, todas com CPF válido único, telefone em dígitos e nascimento', () => {
    expect(fx.customers.length).toBeGreaterThanOrEqual(30)
    const cpfs = new Set<string>()
    for (const c of fx.customers) {
      expect(isValidCPF(c.cpf), `${c.fullName} ${c.cpf}`).toBe(true)
      expect(c.cpf).toMatch(/^\d{11}$/)
      cpfs.add(c.cpf)
      expect(c.phone).toMatch(/^\d{10,11}$/)
      expect(c.birthDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(c.measurements.length).toBeGreaterThan(0)
    }
    expect(cpfs.size).toBe(fx.customers.length)
  })

  it('tem peças reservadas, em higienização e bloqueadas, e bloqueios manuais', () => {
    const states = new Set(fx.garments.map((g) => g.state))
    for (const s of ['disponivel', 'reservado', 'higienizacao', 'bloqueado']) expect(states).toContain(s)
    expect(fx.garments.flatMap((g) => g.blocks).filter((b) => b.kind === 'bloqueio_manual').length).toBeGreaterThanOrEqual(2)
  })

  it('observações e favoritos do protótipo', () => {
    const mariana = fx.customers[0]!
    expect(mariana.fullName).toBe('Mariana Fontes Ribeiro')
    expect(mariana.interactions.some((n) => n.pinned)).toBe(true)
    expect(mariana.favorites.length).toBeGreaterThan(0)
  })
})

describe('mockSource — acervo', () => {
  it('busca por cor, com e sem acento, e por código', async () => {
    const src = newSource()
    const verde = await src.searchGarments({ q: 'verde' }, ALL)
    expect(verde.items.some((g) => g.colorPrimary === 'Verde esmeralda')).toBe(true)
    const verona = await src.searchGarments({ q: 'VERÔNA' }, ALL)
    expect(verona.items.map((g) => g.name)).toContain('Vestido Verona')
    const genova = await src.searchGarments({ q: 'genova' }, ALL)
    expect(genova.items.map((g) => g.name)).toContain('Vestido Gênova')
    const code = await src.searchGarments({ q: 'sz-0107' }, ALL)
    expect(code.items.map((g) => g.code)).toEqual(['SZ-0107'])
  })

  it('stateGroup "ciclo" traz só peças em ciclo operacional; total e paginação', async () => {
    const src = newSource()
    const ciclo = await src.searchGarments({ stateGroup: 'ciclo' }, ALL)
    expect(ciclo.items.length).toBeGreaterThan(0)
    for (const g of ciclo.items) expect(['inspecao', 'higienizacao', 'ajuste', 'manutencao']).toContain(g.state)
    const page = await src.searchGarments({}, { limit: 5, offset: 0 })
    expect(page.items).toHaveLength(5)
    const todos = await src.searchGarments({ stateGroup: 'todos' }, ALL)
    expect(page.total).toBe(todos.items.filter((g) => g.state !== 'baixado').length)
    const m = await src.searchGarments({ size: 'M', cat: 'vestido-longo' }, ALL)
    for (const g of m.items) {
      expect(g.sizeEquiv).toBe('M')
      expect(g.categorySlug).toBe('vestido-longo')
    }
  })

  it('createGarment gera SZ-0297 e valida nome e preço', async () => {
    const src = newSource()
    const created = await src.createGarment(garmentInput())
    expect(created.code).toBe('SZ-0297')
    expect(created.state).toBe('disponivel')
    expect(created.history[0]!.reason).toBe('Peça cadastrada no acervo')
    expect((await src.getGarment(created.id))?.name).toBe('Vestido Girassol')

    const semPreco = await errorOf(src.createGarment(garmentInput({ rentalPrice: 0 })))
    expect(semPreco.code).toBe('VALOR_LOCACAO_OBRIGATORIO')
    expect(semPreco.field).toBe('rentalPrice')
    const semNome = await errorOf(src.createGarment(garmentInput({ name: 'A' })))
    expect(semNome.code).toBe('NOME_OBRIGATORIO')
  })

  it('blockGarment: sobreposto → CONFLITO_AGENDA; invertido → PERIODO_INVALIDO; hoje → bloqueado; liberar → disponível', async () => {
    const src = newSource()
    const verona = await garmentByCode(src, 'SZ-0107')
    const existente = verona.blocks.find((b) => b.kind === 'bloqueio_manual')!
    const conflito = await errorOf(src.blockGarment(verona.id, existente.from, existente.to, 'outro'))
    expect(conflito.code).toBe('CONFLITO_AGENDA')
    expect(conflito.hint).toMatch(/\d{2}\/\d{2}\/\d{4}/)

    const invertido = await errorOf(src.blockGarment(verona.id, '2026-10-30', '2026-10-29', ''))
    expect(invertido.code).toBe('PERIODO_INVALIDO')

    const g = await src.blockGarment(verona.id, TODAY, '2026-10-24', 'Fotos')
    expect(g.state).toBe('bloqueado')
    const novo = g.blocks.find((b) => b.from === TODAY)!
    const liberada = await src.releaseBlock(verona.id, novo.id)
    expect(liberada.state).toBe('disponivel')
    expect(liberada.blocks.find((b) => b.id === novo.id)).toBeUndefined()
    expect(liberada.history[0]!.to).toBe('disponivel')
  })

  it('fotos: primeira vira capa; remover a capa passa para a próxima', async () => {
    const src = newSource()
    const g = await garmentByCode(src, 'SZ-0114')
    const file = new File(['x'], 'frente.jpg', { type: 'image/jpeg' })
    const a = await src.addPhoto(g.id, file, 'frente')
    expect(a.photos).toHaveLength(1)
    expect(a.photos[0]!.isCover).toBe(true)
    const b = await src.addPhoto(g.id, file, 'costas')
    expect(b.photos.filter((p) => p.isCover)).toHaveLength(1)
    const c = await src.setCover(g.id, b.photos[1]!.id)
    expect(c.photos[1]!.isCover).toBe(true)
    const d = await src.removePhoto(g.id, c.photos[1]!.id)
    expect(d.photos).toHaveLength(1)
    expect(d.photos[0]!.isCover).toBe(true)
  })

  it('leituras devolvem cópias: mexer no resultado não altera o estado', async () => {
    const src = newSource()
    const g = await garmentByCode(src, 'SZ-0107')
    g.name = 'mexido'
    expect((await src.getGarment(g.id))?.name).toBe('Vestido Verona')
    expect(await src.getGarment('nao-existe')).toBeNull()
  })
})

describe('mockSource — clientes', () => {
  it('busca por telefone com máscara, por CPF e sem acento', async () => {
    const src = newSource()
    const tel = await src.searchCustomers('63 99612-4478', 'nome', ALL)
    expect(tel.items.map((c) => c.fullName)).toEqual(['Mariana Fontes Ribeiro'])
    const mariana = tel.items[0]!
    const cpf = await src.searchCustomers(mariana.cpf, 'nome', ALL)
    expect(cpf.items.map((c) => c.id)).toEqual([mariana.id])
    const cpfMasc = await src.searchCustomers('529.982.247-25', 'nome', ALL)
    expect(cpfMasc.items.map((c) => c.id)).toEqual([mariana.id])
    const ver = await src.searchCustomers('veronica', 'nome', ALL)
    expect(ver.items.map((c) => c.fullName)).toEqual(['Verônica Pontes'])
  })

  it('ordenação por nome em pt-BR e paginação com total', async () => {
    const src = newSource()
    const page = await src.searchCustomers('', 'nome', { limit: 30, offset: 0 })
    expect(page.items).toHaveLength(30)
    expect(page.total).toBeGreaterThanOrEqual(30)
    const names = page.items.map((c) => c.fullName)
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'pt-BR')))
    const gasto = await src.searchCustomers('', 'gasto', ALL)
    const spent = gasto.items.map((c) => c.stats.spent)
    expect(spent).toEqual([...spent].sort((a, b) => b - a))
  })

  it('createCustomer valida e gera o próximo CL; CPF repetido → CPF_DUPLICADO no campo cpf', async () => {
    const src = newSource()
    const created = await src.createCustomer(customerInput())
    expect(created.code).toBe('CL-0035')
    expect(created.cpf).toBe('12345678909')
    expect(created.phone).toBe('63991112233')

    const dup = await errorOf(src.createCustomer(customerInput({ cpf: '529.982.247-25' })))
    expect(dup.code).toBe('CPF_DUPLICADO')
    expect(dup.field).toBe('cpf')

    const vazio = await errorOf(src.createCustomer({ fullName: '', phone: '123', birthDate: '', cpf: '111.111.111-11' }))
    expect(vazio.issues?.map((i) => i.code)).toEqual(['NOME_CLIENTE_OBRIGATORIO', 'TELEFONE_INVALIDO', 'NASCIMENTO_INVALIDO', 'CPF_INVALIDO'])
    const futuro = await errorOf(src.createCustomer(customerInput({ cpf: '987.654.321-00', birthDate: '2026-10-24' })))
    expect(futuro.code).toBe('NASCIMENTO_INVALIDO')
    const email = await errorOf(src.createCustomer(customerInput({ cpf: '987.654.321-00', email: 'x@' })))
    expect(email.code).toBe('EMAIL_INVALIDO')
    expect((await src.searchCustomers('', 'nome', ALL)).total).toBe(35)
  })

  it('modelo ideal: medidas da peça e versão com source modelo_ideal', async () => {
    const src = newSource()
    const verona = await garmentByCode(src, 'SZ-0107')
    const ideal = await src.idealMeasurements(verona.id)
    expect(ideal).toMatchObject({ usualSize: 'M', bustCm: 88, waistCm: 70, hipCm: 96, preferredLength: 'longo' })
    const c = await src.createCustomer(customerInput({ idealGarmentId: verona.id, measurement: { ...ideal } }))
    expect(c.idealGarmentId).toBe(verona.id)
    expect(c.measurements[0]).toMatchObject({ source: 'modelo_ideal', sourceGarmentId: verona.id, bustCm: 88 })
  })

  it('medidas versionadas, observações e favoritos', async () => {
    const src = newSource()
    const c = await customerByCode(src, 'CL-0001')
    const antes = c.measurements.length
    const m = await src.addMeasurement(c.id, { usualSize: 'G', bustCm: 95 })
    expect(m.measurements).toHaveLength(antes + 1)
    expect(m.measurements[0]).toMatchObject({ usualSize: 'G', bustCm: 95, measuredAt: TODAY, source: 'manual' })

    expect((await errorOf(src.addNote(c.id, '   ', 'presencial', false))).code).toBe('OBSERVACAO_OBRIGATORIA')
    const n = await src.addNote(c.id, 'Prefere atendimento à noite.', 'whatsapp', true)
    const nota = n.interactions[0]!
    expect(nota).toMatchObject({ content: 'Prefere atendimento à noite.', pinned: true, channel: 'whatsapp' })
    expect((await src.setNotePinned(c.id, nota.id, false)).interactions[0]!.pinned).toBe(false)

    const g = await garmentByCode(src, 'SZ-0114')
    expect((await src.setFavorite(c.id, g.id, true)).favorites.map((f) => f.garmentId)).toContain(g.id)
    expect((await src.setFavorite(c.id, g.id, false)).favorites.map((f) => f.garmentId)).not.toContain(g.id)
  })

  it('recommend: cliente M que evita amarelo e ama verde', async () => {
    const src = newSource()
    await src.createGarment(garmentInput()) // M, longo, Amarelo ouro
    const mariana = await customerByCode(src, 'CL-0001')
    const recs = await src.recommend(mariana.id)
    expect(recs.length).toBeGreaterThan(0)
    expect(recs.length).toBeLessThanOrEqual(8)
    for (const r of recs) {
      expect(r.garment.colorPrimary.toLowerCase()).not.toMatch(/amarelo|laranja/)
      expect(['baixado', 'bloqueado']).not.toContain(r.garment.state)
      expect(mariana.favorites.map((f) => f.garmentId)).not.toContain(r.garment.id)
      expect(r.score).toBeGreaterThan(0)
    }
    expect(recs[0]!.garment.sizeEquiv).toBe('M')
    expect(recs[0]!.reasons).toContain('No tamanho dela (M)')
    expect(recs.some((r) => r.reasons.some((x) => x.startsWith('Cor que ela ama')))).toBe(true)
    const scores = recs.map((r) => r.score)
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
    expect(await src.recommend(mariana.id, 3)).toHaveLength(3)
  })
})

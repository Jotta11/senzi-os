/**
 * Acervo e Clientes na fonte em memória. Mesma interface e mesmos códigos de erro do banco (Plano 2B);
 * o estado vive no mundo do `MockCtx` e some ao recarregar a página.
 */
import { REALIZED_RESERVATION_STATES, STATE_GROUP_STATES } from '@/data/labels'
import { diffDays } from '@/domain/dates'
import { round2 } from '@/domain/money'
import { dateBR, normalize, onlyDigits } from '@/lib/format'
import { FIN_CAT } from '../fixture'
import { addPayable } from '../fixture/finance'
import type { AcervoClientesSource } from '../source'
import {
  SourceError,
  type Customer,
  type CustomerInput,
  type CustomerMeasurement,
  type CustomerMeasurementInput,
  type Garment,
  type GarmentEconomics,
  type GarmentFilters,
  type GarmentState,
} from '../types'
import { customerIssues, customerMeasurementIssues, fitIssues, garmentIssues, MAX_PHOTOS, measurementIssues } from '../validation'
import { fail, projectCustomer, projectGarment, type MockCtx } from './context'
import { recommendFor } from './recommend'

const nextCode = (codes: string[], prefix: 'SZ' | 'CL') => {
  const max = codes.reduce((m, c) => Math.max(m, Number(c.slice(prefix.length + 1)) || 0), 0)
  return `${prefix}-${String(max + 1).padStart(4, '0')}`
}

const overlaps = (a: { from: string; to: string }, b: { from: string; to: string }) => a.from <= b.to && b.from <= a.to

const hasMeasurement = (m: CustomerMeasurementInput | undefined) =>
  !!m && Object.entries(m).some(([k, v]) => k !== 'source' && k !== 'sourceGarmentId' && v != null && v !== '')

export function acervoClientes(ctx: MockCtx): AcervoClientesSource {
  const { db, today, userName, run, newId, garment, customer } = ctx
  const pg = (g: Garment) => projectGarment(ctx, g)
  const pc = (c: Customer) => projectCustomer(ctx, c)

  const categoryName = (slug: string) => {
    const c = db.categories.find((x) => x.slug === slug)
    if (!c) fail([{ code: 'PARAMETRO_INVALIDO', field: 'categorySlug' }])
    return c.name
  }
  const ensureBrand = (name: string | null | undefined) => {
    const n = name?.trim()
    if (!n) return null
    const found = db.brands.find((b) => normalize(b) === normalize(n))
    if (found) return found
    db.brands.push(n)
    return n
  }
  const setState = (g: Garment, to: GarmentState, reason: string) => {
    if (g.state === to) return
    g.history.unshift({ at: new Date().toISOString(), from: g.state, to, reason, userName: userName() })
    g.state = to
  }
  /** Peças que casam com busca, categoria e tamanho (o estado fica por conta de quem chama). */
  const matching = (f: Omit<GarmentFilters, 'stateGroup'>) => {
    const q = normalize(f.q)
    return db.garments
      .filter((g) => !f.cat || g.categorySlug === f.cat)
      .filter((g) => !f.size || g.sizeEquiv === f.size)
      .filter((g) => !q || [g.code, g.name, g.colorPrimary, g.fabric].some((s) => normalize(s).includes(q)))
  }
  const covering = (g: Garment, day: string) => g.blocks.some((b) => b.kind === 'bloqueio_manual' && b.from <= day && day <= b.to)

  function checkCustomer(input: Partial<CustomerInput>, partial: boolean, selfId?: string) {
    const issues = customerIssues(input, today, partial)
    if (input.cpf !== undefined && !issues.some((i) => i.field === 'cpf')) {
      const cpf = onlyDigits(input.cpf)
      if (db.customers.some((c) => c.cpf === cpf && c.id !== selfId)) issues.push({ code: 'CPF_DUPLICADO', field: 'cpf' })
    }
    if (input.idealGarmentId && !db.garments.some((g) => g.id === input.idealGarmentId)) issues.push({ code: 'PARAMETRO_INVALIDO', field: 'idealGarmentId' })
    if (issues.length) fail(issues)
  }

  function measurementFrom(input: CustomerMeasurementInput, idealGarmentId: string | null): CustomerMeasurement {
    const fromIdeal = input.source === 'modelo_ideal' || (input.source == null && !!idealGarmentId)
    return {
      measuredAt: today,
      usualSize: input.usualSize ?? null,
      bustCm: input.bustCm ?? null,
      waistCm: input.waistCm ?? null,
      hipCm: input.hipCm ?? null,
      heightCm: input.heightCm ?? null,
      shoulderCm: input.shoulderCm ?? null,
      shoeSize: input.shoeSize ?? null,
      preferredLength: input.preferredLength ?? null,
      source: fromIdeal ? 'modelo_ideal' : 'manual',
      sourceGarmentId: fromIdeal ? (input.sourceGarmentId ?? idealGarmentId) : null,
      notes: input.notes?.trim() || null,
      measuredBy: userName(),
    }
  }

  function applyCustomer(c: Customer, input: Partial<CustomerInput>) {
    if (input.fullName !== undefined) c.fullName = input.fullName.trim()
    if (input.phone !== undefined) c.phone = onlyDigits(input.phone)
    if (input.birthDate !== undefined) c.birthDate = input.birthDate
    if (input.cpf !== undefined) c.cpf = onlyDigits(input.cpf)
    if (input.instagram !== undefined) c.instagram = input.instagram?.trim() || null
    if (input.email !== undefined) c.email = input.email?.trim() || null
    if (input.city !== undefined) c.city = input.city?.trim() || null
    if (input.state !== undefined) c.state = input.state?.trim().toUpperCase() || null
    if (input.leadSource !== undefined) c.leadSource = input.leadSource
    if (input.vip !== undefined) c.vip = input.vip
    if (input.notes !== undefined) c.notes = input.notes?.trim() || null
    if (input.idealGarmentId !== undefined) c.idealGarmentId = input.idealGarmentId || null
    if (input.preferences) c.preferences = { ...c.preferences, ...input.preferences }
    if (hasMeasurement(input.measurement)) c.measurements.unshift(measurementFrom(input.measurement!, c.idealGarmentId))
  }

  /**
   * Economia da peça (spec dashboard §3.3): itens de reservas realizadas → receita (Σ líquido rateado);
   * limpeza/manutenção = contas pagas `operacao` da peça; resultado = receita − aquisição − limpeza − manutenção.
   */
  function economics(id: string): GarmentEconomics {
    const g = garment(id)
    const uses = db.reservations
      .filter((r) => REALIZED_RESERVATION_STATES.includes(r.state))
      .flatMap((r) => r.items.filter((i) => i.garmentId === id && i.itemState !== 'cancelado' && i.itemState !== 'nao_entregue').map((i) => ({ r, i })))
    const revenue = round2(uses.reduce((s, u) => s + u.i.netRevenue, 0))
    const ops = db.payables.filter((p) => p.source === 'operacao' && p.garmentId === id && p.status !== 'cancelada')
    const sum = (cats: string[]) => round2(ops.filter((p) => cats.includes(p.categoryId)).reduce((s, p) => s + (p.paidAmount ?? p.amount), 0))
    const cleaning = sum([FIN_CAT.higienizacao])
    const maintenance = sum([FIN_CAT.manutencao, FIN_CAT.ajuste])
    const cost = g.acquisitionCost
    const lastRental = uses.map((u) => u.r.eventDate ?? u.r.pickupDate).sort().at(-1) ?? null
    return {
      garmentId: id,
      rentals: uses.length,
      revenue,
      acquisitionCost: cost,
      payback: cost ? revenue / cost : null,
      paidBack: !!cost && revenue >= cost,
      cleaning,
      maintenance,
      result: round2(revenue - (cost ?? 0) - cleaning - maintenance),
      lastRental,
      idleDays: lastRental ? diffDays(lastRental, today) : null,
    }
  }

  return {
    listCategories: () => run(() => db.categories),
    listBrands: () => run(() => [...db.brands].sort((a, b) => a.localeCompare(b, 'pt-BR'))),

    searchGarments: (f, page) =>
      run(() => {
        const group = f.stateGroup
        const all = matching(f)
          .filter((g) => (group === 'todos' ? true : group ? STATE_GROUP_STATES[group].includes(g.state) : g.state !== 'baixado'))
          .sort((a, b) => a.code.localeCompare(b.code))
        return { items: all.slice(page.offset, page.offset + page.limit).map(pg), total: all.length }
      }),

    garmentCounts: (f) =>
      run(() => {
        const base = matching(f)
        const n = (states: GarmentState[]) => base.filter((g) => states.includes(g.state)).length
        return {
          todos: base.length,
          ativas: base.filter((g) => g.state !== 'baixado').length,
          disponivel: n(STATE_GROUP_STATES.disponivel),
          reservado: n(STATE_GROUP_STATES.reservado),
          em_uso: n(STATE_GROUP_STATES.em_uso),
          ciclo: n(STATE_GROUP_STATES.ciclo),
          bloqueado: n(STATE_GROUP_STATES.bloqueado),
        }
      }),

    garmentEconomics: (ids) => run(() => ids.flatMap((id) => (db.garments.some((g) => g.id === id) ? [economics(id)] : []))),

    // Exclui `baixado` de propósito (o protótipo somava todas): peça baixada não conta como investimento do acervo.
    acervoInvestment: () =>
      run(() => db.garments.filter((g) => g.state !== 'baixado').reduce((s, g) => s + (g.acquisitionCost ?? 0), 0)),

    getGarment: (id) =>
      run(() => {
        const g = db.garments.find((x) => x.id === id)
        return g ? pg(g) : null
      }),

    createGarment: (input) =>
      run(() => {
        const issues = garmentIssues(input)
        if (issues.length) fail(issues)
        const code = nextCode(db.garments.map((g) => g.code), 'SZ')
        const g: Garment = {
          id: code.toLowerCase(),
          code,
          name: input.name.trim(),
          categorySlug: input.categorySlug,
          categoryName: categoryName(input.categorySlug),
          brandName: ensureBrand(input.brandName),
          labelSize: input.labelSize,
          sizeEquiv: input.sizeEquiv,
          colorPrimary: input.colorPrimary,
          colorHex: input.colorHex,
          fabric: input.fabric,
          length: input.length,
          neckline: input.neckline,
          sleeve: input.sleeve,
          style: input.style,
          occasions: [...input.occasions],
          fitNotes: input.fitNotes,
          state: 'disponivel',
          rentalPrice: input.rentalPrice,
          acquisitionCost: input.acquisitionCost,
          retailReference: input.retailReference,
          cleaningDays: input.cleaningDays,
          location: input.location,
          fitRuns: null,
          bustComfortCm: null,
          waistMaxCm: null,
          hipMaxCm: null,
          hemHeelCm: null,
          commonAlteration: null,
          measurement: { bustCm: null, waistCm: null, hipCm: null, shoulderCm: null, totalLengthCm: null, hemAllowanceCm: null, stretch: null },
          photos: [],
          blocks: [],
          history: [{ at: new Date().toISOString(), from: null, to: 'disponivel', reason: 'Peça cadastrada no acervo', userName: userName() }],
        }
        db.garments.push(g)
        if (g.acquisitionCost && g.acquisitionCost > 0) {
          addPayable(db, {
            description: `Compra da peça — ${g.name}`,
            supplier: 'Aquisição de acervo',
            categoryId: FIN_CAT.aquisicao,
            amount: g.acquisitionCost,
            dueDate: today,
            status: 'paga',
            paidAt: new Date().toISOString(),
            paidAmount: g.acquisitionCost,
            source: 'aquisicao',
            garmentId: g.id,
            createdAt: new Date().toISOString(),
          })
        }
        return pg(g)
      }),

    updateGarment: (id, input) =>
      run(() => {
        const g = garment(id)
        const issues = garmentIssues(input, true)
        if (issues.length) fail(issues)
        const { brandName, categorySlug, ...rest } = input
        if (categorySlug !== undefined) {
          g.categoryName = categoryName(categorySlug)
          g.categorySlug = categorySlug
        }
        if (brandName !== undefined) g.brandName = ensureBrand(brandName)
        Object.assign(g, rest)
        if (rest.name !== undefined) g.name = rest.name.trim()
        return pg(g)
      }),

    updateFit: (id, input) =>
      run(() => {
        const g = garment(id)
        const issues = fitIssues(input)
        if (issues.length) fail(issues)
        return pg(Object.assign(g, input))
      }),

    updateMeasurement: (id, input) =>
      run(() => {
        const g = garment(id)
        const issues = measurementIssues(input)
        if (issues.length) fail(issues)
        g.measurement = { ...g.measurement, ...input }
        return pg(g)
      }),

    addPhoto: (id, file, kind) =>
      run(() => {
        const g = garment(id)
        if (!file.type.startsWith('image/')) fail([{ code: 'PARAMETRO_INVALIDO', field: 'file' }])
        if (g.photos.length >= MAX_PHOTOS) fail([{ code: 'PARAMETRO_INVALIDO', field: 'photos' }])
        const url = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : `blob:preview/${newId('foto')}`
        g.photos.push({ id: newId('foto'), kind, url, isCover: g.photos.length === 0 })
        return pg(g)
      }),

    removePhoto: (id, photoId) =>
      run(() => {
        const g = garment(id)
        const p = g.photos.find((x) => x.id === photoId)
        if (!p) throw new SourceError('NAO_ENCONTRADO')
        g.photos = g.photos.filter((x) => x.id !== photoId)
        if (p.isCover && g.photos[0]) g.photos[0].isCover = true
        if (p.url.startsWith('blob:') && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(p.url)
        return pg(g)
      }),

    setCover: (id, photoId) =>
      run(() => {
        const g = garment(id)
        if (!g.photos.some((x) => x.id === photoId)) throw new SourceError('NAO_ENCONTRADO')
        for (const p of g.photos) p.isCover = p.id === photoId
        return pg(g)
      }),

    blockGarment: (id, from, to, note) =>
      run(() => {
        const g = garment(id)
        if (!from || !to || to < from) fail([{ code: 'PERIODO_INVALIDO', field: 'to' }])
        const clash = g.blocks.find((b) => overlaps(b, { from, to }))
        if (clash) fail([{ code: 'CONFLITO_AGENDA', field: 'from' }], `${dateBR(clash.from)} – ${dateBR(clash.to)}`)
        g.blocks.push({ id: newId('bloq'), kind: 'bloqueio_manual', from, to, note: note.trim() || null })
        g.blocks.sort((a, b) => a.from.localeCompare(b.from))
        if (from <= today && today <= to && g.state === 'disponivel') setState(g, 'bloqueado', note.trim() || 'Bloqueio manual')
        return pg(g)
      }),

    releaseBlock: (id, blockId) =>
      run(() => {
        const g = garment(id)
        const b = g.blocks.find((x) => x.id === blockId)
        if (!b) throw new SourceError('NAO_ENCONTRADO')
        if (b.kind !== 'bloqueio_manual') fail([{ code: 'PARAMETRO_INVALIDO' }])
        g.blocks = g.blocks.filter((x) => x.id !== blockId)
        if (g.state === 'bloqueado' && !covering(g, today)) setState(g, 'disponivel', 'Bloqueio liberado')
        return pg(g)
      }),

    searchCustomers: (q, sort, page) =>
      run(() => {
        const nq = normalize(q)
        const dq = onlyDigits(q)
        const all = db.customers
          .filter((c) => {
            if (!nq) return true
            if ([c.fullName, c.instagram, c.code, c.city].some((s) => normalize(s).includes(nq))) return true
            return dq.length >= 3 && (c.phone.includes(dq) || c.cpf.includes(dq))
          })
          .map(pc)
          .sort((a, b) => {
            if (sort === 'gasto') return b.stats.spent - a.stats.spent || a.fullName.localeCompare(b.fullName, 'pt-BR')
            if (sort === 'locacoes') return b.stats.rentals - a.stats.rentals || a.fullName.localeCompare(b.fullName, 'pt-BR')
            if (sort === 'recentes') return b.createdAt.localeCompare(a.createdAt)
            return a.fullName.localeCompare(b.fullName, 'pt-BR')
          })
        return { items: all.slice(page.offset, page.offset + page.limit), total: all.length }
      }),

    getCustomer: (id) =>
      run(() => {
        const c = db.customers.find((x) => x.id === id)
        return c ? pc(c) : null
      }),

    createCustomer: (input) =>
      run(() => {
        checkCustomer(input, false)
        const code = nextCode(db.customers.map((c) => c.code), 'CL')
        const c: Customer = {
          id: code.toLowerCase(),
          code,
          fullName: '',
          phone: '',
          instagram: null,
          email: null,
          birthDate: '',
          cpf: '',
          city: null,
          state: null,
          leadSource: null,
          vip: false,
          notes: null,
          idealGarmentId: null,
          createdAt: new Date().toISOString(),
          measurements: [],
          preferences: { preferredColors: [], avoidedColors: [], preferredLengths: [], sleeve: null, neckline: null },
          interactions: [],
          favorites: [],
          stats: { rentals: 0, spent: 0, nextEvent: null },
        }
        applyCustomer(c, input)
        db.customers.push(c)
        return pc(c)
      }),

    updateCustomer: (id, input) =>
      run(() => {
        const c = customer(id)
        checkCustomer(input, true, id)
        applyCustomer(c, input)
        return pc(c)
      }),

    idealMeasurements: (garmentId) =>
      run(() => {
        const g = garment(garmentId)
        return {
          usualSize: g.sizeEquiv,
          bustCm: g.measurement.bustCm,
          waistCm: g.measurement.waistCm,
          hipCm: g.measurement.hipCm,
          shoulderCm: g.measurement.shoulderCm,
          preferredLength: g.length,
        }
      }),

    addMeasurement: (id, input) =>
      run(() => {
        const c = customer(id)
        const issues = customerMeasurementIssues(input)
        if (issues.length) fail(issues)
        c.measurements.unshift(measurementFrom({ source: 'manual', ...input }, c.idealGarmentId))
        return pc(c)
      }),

    addNote: (id, content, channel, pinned) =>
      run(() => {
        const c = customer(id)
        if (!content.trim()) fail([{ code: 'OBSERVACAO_OBRIGATORIA', field: 'content' }])
        c.interactions.unshift({ id: newId('nota'), content: content.trim(), channel, pinned, at: new Date().toISOString(), authorName: userName() })
        return pc(c)
      }),

    setNotePinned: (id, noteId, pinned) =>
      run(() => {
        const c = customer(id)
        const n = c.interactions.find((x) => x.id === noteId)
        if (!n) throw new SourceError('NAO_ENCONTRADO')
        n.pinned = pinned
        return pc(c)
      }),

    setFavorite: (id, garmentId, on) =>
      run(() => {
        const c = customer(id)
        garment(garmentId)
        const exists = c.favorites.some((f) => f.garmentId === garmentId)
        if (on && !exists) c.favorites.unshift({ garmentId, source: 'manual', note: null, at: new Date().toISOString() })
        if (!on) c.favorites = c.favorites.filter((f) => f.garmentId !== garmentId)
        return pc(c)
      }),

    recommend: (id, limit = 8) => run(() => recommendFor(customer(id), db.garments.map(pg), limit)),
  }
}


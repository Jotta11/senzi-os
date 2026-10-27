import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type Appt = {
  id: string
  kind: string
  startsAt: string
  title: string | null
  notes: string | null
  state: string
  customerId: string | null
  reservationId: string | null
  fittingId: string | null
  assignedTo: string | null
  internal: boolean
  createdBy: string | null
}
type Item = {
  id: string
  time: string
  kind: string
  customer: { id: string; fullName: string } | null
  fitting: { id: string; code: string } | null
  reservation: unknown
  garments: unknown[]
  title: string
  state: string
  internal: boolean
}
type Day = { date: string; items: Item[]; garmentBlocks: { garmentId: string; garmentCode: string; kind: string }[]; moreBlocks: number }
type Session = {
  id: string
  code: string
  customerId: string
  state: string
  scheduledAt: string
  startedAt: string | null
  endedAt: string | null
  attendantId: string | null
  eventType: string | null
  eventDate: string | null
  budget: number | null
  notes: string | null
  outcomeNotes: string | null
  reservationId: string | null
}
type Row = Session & { customerName: string; itemCount: number; approvedCount: number; discardedCount: number }
type Hist = Row & { items: { garmentId: string; garmentCode: string; garmentName: string; outcome: string; note: string | null; needsAlteration: boolean }[] }
type Detail = {
  session: Session
  customer: { id: string; fullName: string; favorites: { garmentId: string; source: string; note: string | null }[] }
  attendantName: string | null
  items: { garmentId: string; position: number; outcome: string; needsAlteration: boolean; note: string | null; recordedBy: string | null; recordedAt: string | null; garment: { code: string }; favorite: boolean }[]
  reservation: unknown
}

const GARMENT = {
  categorySlug: 'vestido-longo',
  labelSize: '38',
  colorHex: '#0E5C4A',
  colorPrimary: 'Verde',
  sizeEquiv: 'M',
  length: 'longo',
  rentalPrice: 450,
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

describe('agenda e provas', () => {
  let db: PGlite
  let admin: string
  let atend: string
  let today: string
  let cust: { id: string; fullName: string }

  const as = <T>(user: string, sql: string, params: unknown[] = []) => asUser(db, user, (tx) => rpc<T>(tx, sql, params))
  const addDays = async (n: number) => (await db.query<{ d: string }>(`select (public.store_today() + $1::int)::text d`, [n])).rows[0].d
  const deny = (user: string, perm: string) =>
    db.query(`insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, false)`, [user, perm])
  const garment = (name: string) => as<{ id: string; code: string }>(admin, 'public.create_garment($1)', [JSON.stringify({ ...GARMENT, name })])
  const range = (user: string, from: string, to: string) => as<Day[]>(user, 'public.agenda_range($1, $2)', [from, to])
  const appt = (user: string, p: Record<string, unknown>) => as<Appt>(user, 'public.create_appointment($1)', [JSON.stringify(p)])
  const fitting = (user: string, p: Record<string, unknown>) => as<Session>(user, 'public.create_fitting($1)', [JSON.stringify(p)])
  const detail = (user: string, id: string) => as<Detail | null>(user, 'public.get_fitting($1)', [id])
  const add = (id: string, g: string) => as<Detail>(atend, 'public.add_fitting_garment($1, $2)', [id, g])
  const outcome = (id: string, g: string, p: Record<string, unknown>) => as<Detail>(atend, 'public.set_fitting_outcome($1, $2, $3)', [id, g, JSON.stringify(p)])
  const close = (id: string, state: string, notes: string | null) => as<Detail>(atend, 'public.close_fitting($1, $2, $3)', [id, state, notes])
  const list = (filter: string, limit = 50, offset = 0) => as<{ items: Row[]; total: number }>(atend, 'public.list_fittings($1, $2, $3)', [filter, limit, offset])
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: { message: string; detail?: string }) => e)

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia Atendimento', role: 'atendimento' })
    today = await addDays(0)
    cust = await as(admin, 'public.create_customer($1)', [
      JSON.stringify({ fullName: 'Mariana Fontes', phone: '63996124478', birthDate: '1995-03-10', cpf: '52998224725' }),
    ])
  })

  afterEach(async () => {
    await db.close()
  })

  describe('compromissos', () => {
    it('valida como a fonte em memória (tipo, data, horário, cliente, observação, cliente inexistente)', async () => {
      const base = { date: today, time: '10:00', kind: 'interno', customerId: null, notes: 'x' }
      const cases: [Record<string, unknown>, string, string | undefined][] = [
        [{ kind: 'prova' }, 'PARAMETRO_INVALIDO', 'kind'],
        [{ date: '' }, 'DATA_OBRIGATORIA', 'date'],
        [{ date: '2026-02-31' }, 'DATA_OBRIGATORIA', 'date'],
        [{ time: '' }, 'HORARIO_OBRIGATORIO', 'time'],
        [{ time: '25:00' }, 'HORARIO_OBRIGATORIO', 'time'],
        [{ kind: 'atendimento', notes: null }, 'CLIENTE_OBRIGATORIA', 'customerId'],
        [{ kind: 'interno', notes: '  ' }, 'OBSERVACAO_OBRIGATORIA', 'notes'],
        [{ kind: 'servico', notes: null }, 'OBSERVACAO_OBRIGATORIA', 'notes'],
        [{ customerId: '00000000-0000-0000-0000-000000000000' }, 'NAO_ENCONTRADO', undefined],
      ]
      for (const [over, code, field] of cases) {
        const e = await errOf(appt(atend, { ...base, ...over }))
        expect([e?.message, e?.detail]).toEqual([code, field])
      }
    })

    it('cria (título, interno, responsável, fuso da loja), edita, cancela; some da agenda e dos dias do mês', async () => {
      const a = await appt(atend, { date: today, time: '08:00', kind: 'interno', customerId: null, notes: ' Limpar vitrine ' })
      expect(a).toMatchObject({ kind: 'interno', title: 'Limpar vitrine', notes: 'Limpar vitrine', internal: true, state: 'agendado', assignedTo: atend, createdBy: atend })
      expect(a.startsAt).toBe(`${today}T08:00:00-03:00`)
      const at = await appt(atend, { date: today, time: '07:30', kind: 'atendimento', customerId: cust.id, notes: null })
      expect(at).toMatchObject({ title: 'Atendimento', internal: false, customerId: cust.id })
      const sv = await appt(atend, { date: today, time: '09:00', kind: 'servico', customerId: cust.id, notes: '' })
      expect(sv.title).toBe('Serviço')

      let [day] = await range(atend, today, today)
      expect(day.items.map((i) => [i.time, i.kind])).toEqual([['07:30', 'atendimento'], ['08:00', 'interno'], ['09:00', 'servico']])
      expect(day.items[0]).toMatchObject({ customer: { id: cust.id, fullName: 'Mariana Fontes' }, fitting: null, reservation: null, garments: [], title: 'Atendimento' })

      const b = await as<Appt>(atend, 'public.update_appointment($1, $2)', [a.id, JSON.stringify({ date: today, time: '20:00', kind: 'interno', customerId: null, notes: 'Vitrine 2' })])
      expect(b.startsAt).toBe(`${today}T20:00:00-03:00`)
      expect(b.title).toBe('Vitrine 2')
      await as(atend, 'public.cancel_appointment($1)', [a.id])
      ;[day] = await range(atend, today, today)
      expect(day.items.some((i) => i.id === a.id)).toBe(false)
      await expect(as(atend, 'public.cancel_appointment($1)', [a.id])).rejects.toThrow('ESTADO_INVALIDO')
      await expect(as(atend, 'public.cancel_appointment(gen_random_uuid())')).rejects.toThrow('NAO_ENCONTRADO')

      const month = await as<string[]>(atend, 'public.agenda_month_days($1)', [today.slice(0, 7)])
      expect(month).toEqual([today])
      await expect(as(atend, `public.agenda_month_days('2026-13')`)).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('agenda_range: um dia por data (inclusive), meia-noite no fuso da loja, blocos do acervo (máx. 4 + moreBlocks)', async () => {
      const tomorrow = await addDays(1)
      // 23:30 local = 02:30 UTC do dia seguinte: continua no dia de hoje
      const late = await appt(atend, { date: today, time: '23:30', kind: 'interno', customerId: null, notes: 'Fechar caixa' })
      const g = []
      for (const n of ['Aurora', 'Bela', 'Cora', 'Dália', 'Eva']) g.push(await garment(n))
      for (const x of g) await as(admin, 'public.block_garment($1, $2, $3, $4)', [x.id, today, tomorrow, 'Ensaio'])
      const days = await range(atend, today, tomorrow)
      expect(days.map((d) => d.date)).toEqual([today, tomorrow])
      expect(days[0].items.map((i) => i.id)).toEqual([late.id])
      expect(days[1].items).toEqual([])
      expect(days[0].garmentBlocks.map((b) => b.garmentCode)).toEqual(g.slice(0, 4).map((x) => x.code))
      expect(days[0].garmentBlocks[0].kind).toBe('bloqueio_manual')
      expect(days[0].moreBlocks).toBe(1)
      await expect(range(atend, tomorrow, today)).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('compromisso automático (prova) não edita nem cancela', async () => {
      const f = await fitting(atend, { customerId: cust.id, date: today, time: '09:00' })
      const [day] = await range(atend, today, today)
      const auto = day.items.find((i) => i.fitting?.id === f.id)!
      expect(auto).toMatchObject({ kind: 'prova', title: 'Prova', time: '09:00', fitting: { id: f.id, code: f.code }, customer: { id: cust.id } })
      await expect(as(atend, 'public.cancel_appointment($1)', [auto.id])).rejects.toThrow('ESTADO_INVALIDO')
      await expect(
        as(atend, 'public.update_appointment($1, $2)', [auto.id, JSON.stringify({ date: today, time: '10:00', kind: 'atendimento', customerId: null, notes: null })]),
      ).rejects.toThrow('ESTADO_INVALIDO')
    })

    it('appointment_insert (para a área 3): compromisso automático com reserva fica fora das edições manuais', async () => {
      const res = '11111111-1111-1111-1111-111111111111'
      const { rows } = await db.query<{ id: string }>(
        `select public.appointment_insert('retirada', public.store_at(public.store_today(), '10:00'), 'Retirada', null, $1, $2, null, null, null) as id`,
        [cust.id, res],
      )
      const [day] = await range(atend, today, today)
      expect(day.items.find((i) => i.id === rows[0].id)).toMatchObject({ kind: 'retirada', title: 'Retirada', time: '10:00', reservation: null })
      await expect(as(atend, 'public.cancel_appointment($1)', [rows[0].id])).rejects.toThrow('ESTADO_INVALIDO')
    })

    it('permissões: agenda.view para ler, agenda.manage para escrever; list_staff só ativos, por nome', async () => {
      const off = await createUser(db, { email: 'off@senzi.test', full_name: 'Zé Inativo', role: 'atendimento', is_active: false })
      expect(off).toBeTruthy()
      const staff = await as<{ id: string; name: string; role: string }[]>(atend, 'public.list_staff()')
      expect(staff.map((u) => u.name)).toEqual(['Ana Admin', 'Bia Atendimento'])
      expect(staff[0]).toMatchObject({ id: admin, role: 'admin', email: 'ana@senzi.test' })
      await deny(atend, 'agenda.manage')
      await expect(appt(atend, { date: today, time: '10:00', kind: 'interno', customerId: null, notes: 'x' })).rejects.toThrow('SEM_PERMISSAO')
      await deny(atend, 'agenda.view')
      await expect(range(atend, today, today)).rejects.toThrow('SEM_PERMISSAO')
      await expect(as(atend, `public.agenda_month_days('2026-10')`)).rejects.toThrow('SEM_PERMISSAO')
      expect((await as<unknown[]>(atend, 'public.list_staff()')).length).toBe(2)
      await deny(atend, 'prova.view')
      await expect(as(atend, 'public.list_staff()')).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  describe('provas', () => {
    it('create_fitting valida na ordem da fonte em memória', async () => {
      const cases: [Record<string, unknown>, string, string | undefined][] = [
        [{ date: today }, 'CLIENTE_OBRIGATORIA', 'customerId'],
        [{ customerId: cust.id, date: '' }, 'DATA_OBRIGATORIA', 'date'],
        [{ customerId: cust.id, date: today, eventDate: await addDays(-1) }, 'DATAS_INCOERENTES', 'eventDate'],
        [{ customerId: cust.id, date: today, time: '9h' }, 'HORARIO_OBRIGATORIO', 'time'],
        [{ customerId: cust.id, date: today, budget: -1 }, 'PARAMETRO_INVALIDO', 'budget'],
        [{ customerId: '00000000-0000-0000-0000-000000000000', date: today }, 'NAO_ENCONTRADO', undefined],
        [{ newCustomer: { fullName: 'Helena Prado', phone: '63991112233', birthDate: '1990-05-10', cpf: '52998224725' }, date: today }, 'CPF_DUPLICADO', 'cpf'],
      ]
      for (const [p, code, field] of cases) {
        const e = await errOf(fitting(atend, p))
        expect([e?.message, e?.detail]).toEqual([code, field])
      }
      expect((await list('todas')).total).toBe(0)
    })

    it('cria PR-<ano>-NNNN, 15:00 padrão, atendente pelo nome, compromisso prova; cliente nova na mesma transação', async () => {
      const in5 = await addDays(5)
      const f = await fitting(atend, { customerId: cust.id, date: in5, time: '', eventType: ' Casamento ', eventDate: in5, budget: 800, notes: 'Quer verde', attendantName: 'Ana Admin' })
      expect(f).toMatchObject({ state: 'agendada', customerId: cust.id, eventType: 'Casamento', eventDate: in5, budget: 800, notes: 'Quer verde', attendantId: admin, startedAt: null, reservationId: null })
      expect(f.scheduledAt).toBe(`${in5}T15:00:00-03:00`)
      expect(f.code).toBe(`PR-${in5.slice(0, 4)}-0001`)
      const g = await fitting(atend, {
        newCustomer: { fullName: 'Helena Prado', phone: '63991112233', birthDate: '1990-05-10', cpf: '123.456.789-09' },
        date: today,
        time: '10:30',
        attendantName: 'Ninguém',
      })
      expect(g.code).toBe(`PR-${today.slice(0, 4)}-${today.slice(0, 4) === in5.slice(0, 4) ? '0002' : '0001'}`)
      expect(g.attendantId).toBe(atend)
      const c = await as<{ fullName: string; code: string }>(atend, 'public.get_customer($1)', [g.customerId])
      expect(c.fullName).toBe('Helena Prado')
      const [day] = await range(atend, in5, in5)
      expect(day.items).toEqual([expect.objectContaining({ kind: 'prova', time: '15:00', fitting: { id: f.id, code: f.code } })])
      const { rows } = await db.query<{ assigned_to: string; notes: string }>(`select assigned_to, notes from public.appointment where fitting_id = $1`, [f.id])
      expect(rows).toEqual([{ assigned_to: admin, notes: 'Quer verde' }])
    })

    it('cliente nova sem cliente.create → SEM_PERMISSAO e nada fica gravado', async () => {
      await deny(atend, 'cliente.create')
      await expect(
        fitting(atend, { newCustomer: { fullName: 'Helena Prado', phone: '63991112233', birthDate: '1990-05-10', cpf: '123.456.789-09' }, date: today }),
      ).rejects.toThrow('SEM_PERMISSAO')
      expect((await db.query(`select 1 from public.customer where full_name = 'Helena Prado'`)).rows).toHaveLength(0)
    })

    it('peças, resultado (nota preservada, em_curso, favorito da prova) e detalhe', async () => {
      const f = await fitting(atend, { customerId: cust.id, date: today })
      const a = await garment('Siena')
      const b = await garment('Milano')
      expect((await add(f.id, a.id)).items).toHaveLength(1)
      expect((await add(f.id, a.id)).items).toHaveLength(1)
      let d = await add(f.id, b.id)
      expect(d.items.map((i) => [i.garmentId, i.position, i.outcome])).toEqual([[a.id, 0, 'nao_provou'], [b.id, 1, 'nao_provou']])
      expect(d.items[0].garment.code).toBe(a.code)
      expect(d.customer.id).toBe(cust.id)
      expect(d.attendantName).toBe('Bia Atendimento')
      expect(d.reservation).toBeNull()

      d = await outcome(f.id, a.id, { outcome: 'gostou', note: ' Amou a cor ' })
      expect(d.session.state).toBe('em_curso')
      expect(d.session.startedAt).toMatch(/-03:00$/)
      expect(d.items[0]).toMatchObject({ outcome: 'gostou', note: 'Amou a cor', recordedBy: atend })
      d = await outcome(f.id, a.id, { outcome: 'serviu', needsAlteration: true })
      expect(d.items[0]).toMatchObject({ outcome: 'serviu', note: 'Amou a cor', needsAlteration: true })
      d = await outcome(f.id, a.id, { outcome: 'favorita' })
      expect(d.items[0].favorite).toBe(true)
      expect(d.customer.favorites).toEqual([expect.objectContaining({ garmentId: a.id, source: 'prova', note: 'Amou a cor' })])
      d = await outcome(f.id, a.id, { note: null })
      expect(d.items[0]).toMatchObject({ outcome: 'favorita', note: null, needsAlteration: true })
      expect(d.customer.favorites[0].note).toBe('Amou a cor')

      // favorito manual existente vira origem prova
      await as(atend, 'public.set_customer_favorite($1, $2, true)', [cust.id, b.id])
      d = await outcome(f.id, b.id, { outcome: 'favorita', note: 'Linda' })
      expect(d.customer.favorites.find((x) => x.garmentId === b.id)).toMatchObject({ source: 'prova', note: 'Linda' })

      await expect(outcome(f.id, a.id, { outcome: 'linda' })).rejects.toThrow('PARAMETRO_INVALIDO')
      await expect(outcome(f.id, '00000000-0000-0000-0000-000000000000', { outcome: 'gostou' })).rejects.toThrow('NAO_ENCONTRADO')
      await expect(add(f.id, '00000000-0000-0000-0000-000000000000')).rejects.toThrow('NAO_ENCONTRADO')
      d = await as(atend, 'public.remove_fitting_garment($1, $2)', [f.id, b.id])
      expect(d.items.map((i) => i.garmentId)).toEqual([a.id])
      expect(await detail(atend, '00000000-0000-0000-0000-000000000000')).toBeNull()
    })

    it('close_fitting fecha prova e compromisso; depois tudo → PROVA_ENCERRADA; no_show marca o compromisso', async () => {
      const f = await fitting(atend, { customerId: cust.id, date: today, notes: 'Antes' })
      const g = await garment('Siena')
      await add(f.id, g.id)
      await expect(close(f.id, 'convertida', null)).rejects.toThrow('PARAMETRO_INVALIDO')
      let d = await close(f.id, 'concluida', '  ')
      expect(d.session).toMatchObject({ state: 'concluida', outcomeNotes: null })
      expect(d.session.endedAt).not.toBeNull()
      let [day] = await range(atend, today, today)
      expect(day.items.find((i) => i.fitting?.id === f.id)!.state).toBe('concluido')
      for (const p of [close(f.id, 'perdida', null), add(f.id, g.id), outcome(f.id, g.id, { outcome: 'gostou' }), as(atend, 'public.remove_fitting_garment($1, $2)', [f.id, g.id])]) {
        await expect(p).rejects.toThrow('PROVA_ENCERRADA')
      }
      await expect(close('00000000-0000-0000-0000-000000000000', 'perdida', null)).rejects.toThrow('NAO_ENCONTRADO')

      const n = await fitting(atend, { customerId: cust.id, date: today, time: '11:00' })
      d = await close(n.id, 'no_show', 'Não veio')
      expect(d.session.outcomeNotes).toBe('Não veio')
      ;[day] = await range(atend, today, today)
      expect(day.items.find((i) => i.fitting?.id === n.id)!.state).toBe('no_show')
    })

    it('lista por filtro (scheduledAt desc, paginada), KPIs e conversão (fitting_convert da área 3)', async () => {
      const dates = [await addDays(-3), await addDays(-2), await addDays(-1), today, await addDays(1)]
      const ids: string[] = []
      for (const d of dates) ids.push((await fitting(atend, { customerId: cust.id, date: d })).id)
      const g = await garment('Siena')
      await add(ids[0], g.id)
      await outcome(ids[0], g.id, { outcome: 'gostou' })
      await add(ids[1], g.id)
      await outcome(ids[1], g.id, { outcome: 'descartada' })
      await close(ids[1], 'perdida', null)
      await close(ids[2], 'no_show', null)
      await close(ids[3], 'concluida', null)

      // a área 3 converte a prova quando o rascunho da reserva nasce dela
      const res = '22222222-2222-2222-2222-222222222222'
      const other = await as<{ id: string }>(admin, 'public.create_customer($1)', [
        JSON.stringify({ fullName: 'Outra Cliente', phone: '63996124400', birthDate: '1990-01-01', cpf: '12345678909' }),
      ])
      await expect(db.query('select public.fitting_convert($1, $2, $3)', [ids[0], res, other.id])).rejects.toThrow('PARAMETRO_INVALIDO')
      await expect(db.query('select public.fitting_convert($1, $2, $3)', [ids[1], res, cust.id])).rejects.toThrow('PROVA_ENCERRADA')
      await expect(db.query('select public.fitting_convert(gen_random_uuid(), $1, $2)', [res, cust.id])).rejects.toThrow('NAO_ENCONTRADO')
      await db.query('select public.fitting_convert($1, $2, $3)', [ids[0], res, cust.id])
      const conv = (await detail(atend, ids[0]))!
      expect(conv.session).toMatchObject({ state: 'convertida', reservationId: res })
      expect(conv.session.endedAt).not.toBeNull()
      const { rows } = await db.query<{ state: string }>(`select state from public.appointment where fitting_id = $1`, [ids[0]])
      expect(rows).toEqual([{ state: 'concluido' }])

      const all = await list('todas')
      expect(all.total).toBe(5)
      expect(all.items.map((r) => r.id)).toEqual([...ids].reverse())
      expect(all.items.find((r) => r.id === ids[0])).toMatchObject({ customerName: 'Mariana Fontes', itemCount: 1, approvedCount: 1, discardedCount: 0 })
      expect(all.items.find((r) => r.id === ids[1])).toMatchObject({ itemCount: 1, approvedCount: 0, discardedCount: 1 })
      const page = await list('todas', 2, 1)
      expect([page.total, page.items.map((r) => r.id)]).toEqual([5, [ids[3], ids[2]]])
      expect((await list('abertas')).items.map((r) => r.id)).toEqual([ids[4]])
      expect((await list('convertidas')).items.map((r) => r.id)).toEqual([ids[0]])
      expect((await list('perdidas')).items.map((r) => r.id)).toEqual([ids[2], ids[1]])
      await expect(list('velhas')).rejects.toThrow('PARAMETRO_INVALIDO')

      const k = await as(atend, 'public.fitting_kpis()')
      expect(k).toEqual({ open: 1, converted: 1, lost: 1, closed: 3, rate: 1 / 3, total: 5 })
    })

    it('histórico da cliente e da peça; estatísticas da peça', async () => {
      const a = await garment('Siena')
      const b = await garment('Milano')
      const f1 = await fitting(atend, { customerId: cust.id, date: await addDays(-2) })
      const f2 = await fitting(atend, { customerId: cust.id, date: await addDays(-1) })
      await add(f1.id, a.id)
      await add(f1.id, b.id)
      await outcome(f1.id, a.id, { outcome: 'precisa_ajuste', note: 'Barra longa' })
      await add(f2.id, a.id)
      await outcome(f2.id, a.id, { outcome: 'nao_gostou', note: 'Cor apagada' })
      await add(f2.id, b.id) // não provou: fora das estatísticas

      const mine = await as<Hist[]>(atend, 'public.fittings_of_customer($1)', [cust.id])
      expect(mine.map((h) => h.id)).toEqual([f2.id, f1.id])
      expect(mine[1].items.map((i) => [i.garmentCode, i.outcome, i.note])).toEqual([
        [a.code, 'precisa_ajuste', 'Barra longa'],
        [b.code, 'nao_provou', null],
      ])
      const ofA = await as<Hist[]>(atend, 'public.fittings_of_garment($1)', [a.id])
      expect(ofA.map((h) => h.id)).toEqual([f2.id, f1.id])
      expect(ofA.every((h) => h.items.length === 1 && h.items[0].garmentId === a.id)).toBe(true)

      const st = await as(atend, 'public.fitting_stats_of($1)', [a.id])
      expect(st).toEqual({
        fittings: 2,
        converted: 0,
        rate: 0,
        favorites: 0,
        discards: 1,
        alterations: 1,
        reasons: [
          { outcome: 'nao_gostou', note: 'Cor apagada' },
          { outcome: 'precisa_ajuste', note: 'Barra longa' },
        ],
      })
      expect(await as(atend, 'public.fitting_stats_of($1)', [b.id])).toMatchObject({ fittings: 0, rate: null, reasons: [] })
    })

    it('permissões: prova.view para ler, prova.manage para escrever', async () => {
      const f = await fitting(atend, { customerId: cust.id, date: today })
      await deny(atend, 'prova.manage')
      await expect(fitting(atend, { customerId: cust.id, date: today })).rejects.toThrow('SEM_PERMISSAO')
      await expect(close(f.id, 'perdida', null)).rejects.toThrow('SEM_PERMISSAO')
      expect((await detail(atend, f.id))!.session.id).toBe(f.id)
      await deny(atend, 'prova.view')
      for (const sql of ['public.fitting_kpis()', `public.list_fittings('todas', 10, 0)`]) {
        await expect(as(atend, sql)).rejects.toThrow('SEM_PERMISSAO')
      }
      await expect(detail(atend, f.id)).rejects.toThrow('SEM_PERMISSAO')
      await expect(as(atend, 'public.fittings_of_customer($1)', [cust.id])).rejects.toThrow('SEM_PERMISSAO')
    })
  })

  it('anon e authenticated sem acesso direto às tabelas nem às funções internas; auditoria', async () => {
    const f = await fitting(atend, { customerId: cust.id, date: today })
    await expect(asAnon(db, (tx) => tx.query('select id from public.appointment'))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, (tx) => tx.query(`select public.list_fittings('todas', 10, 0)`))).rejects.toThrow(/permission denied/)
    await expect(asAnon(db, (tx) => tx.query(`select public.agenda_range(current_date, current_date)`))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, admin, (tx) => tx.query('select id from public.fitting_session'))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, admin, (tx) => tx.query('select 1 from public.fitting_item'))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, admin, (tx) => tx.query('select public.fitting_convert($1, gen_random_uuid(), $2)', [f.id, cust.id]))).rejects.toThrow(/permission denied/)
    await expect(asUser(db, admin, (tx) => tx.query('select public.fitting_detail_json($1)', [f.id]))).rejects.toThrow(/permission denied/)
    const { rows } = await db.query<{ table_name: string }>(
      `select distinct table_name from public.audit_log where table_name in ('fitting_session', 'appointment') order by 1`,
    )
    expect(rows.map((r) => r.table_name)).toEqual(['appointment', 'fitting_session'])
  })
})

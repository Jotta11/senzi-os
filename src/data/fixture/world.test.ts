import { describe, expect, it } from 'vitest'
import { REALIZED_RESERVATION_STATES } from '@/data/labels'
import type { GarmentBlock, ReservationState } from '@/data/types'
import { lateFee } from '@/domain/money'
import { buildWorld } from './world'

const TODAY = '2026-10-24'
const w = buildWorld(TODAY)
const byName = (n: string) => {
  const g = w.garments.find((x) => x.name.endsWith(` ${n}`))
  if (!g) throw new Error(`peça ${n} não encontrada`)
  return g
}
const overlaps = (a: GarmentBlock, b: GarmentBlock) => a.from <= b.to && b.from <= a.to
/** Peça presa na operação com retirada encostada: o bloco da ordem termina no 1º dia da locação (alerta de risco). */
const allowedPair = (a: GarmentBlock, b: GarmentBlock) => {
  const [op, loc] = a.kind === 'locacao' ? [b, a] : [a, b]
  return loc.kind === 'locacao' && !!op.maintenanceId && op.to === loc.from
}

describe('buildWorld', () => {
  it('(a) é determinístico: mesma data → mesmo mundo', () => {
    expect(JSON.stringify(buildWorld(TODAY))).toBe(JSON.stringify(w))
    expect(JSON.stringify(buildWorld('2026-10-25'))).not.toBe(JSON.stringify(w))
  })

  it('(b) nenhuma peça tem dois blocos ativos sobrepostos (exceto a higienização encostada da operação)', () => {
    const whitelisted: string[] = []
    for (const g of w.garments) {
      for (let i = 0; i < g.blocks.length; i++) {
        for (let j = i + 1; j < g.blocks.length; j++) {
          const a = g.blocks[i]!
          const b = g.blocks[j]!
          if (!overlaps(a, b)) continue
          expect(allowedPair(a, b), `${g.name}: ${a.kind} ${a.from}–${a.to} × ${b.kind} ${b.from}–${b.to}`).toBe(true)
          whitelisted.push(g.name.split(' ').at(-1)!)
        }
      }
    }
    expect(whitelisted.sort()).toEqual(['Lecce', 'Parma'])
  })

  it('(c) Σ netRevenue dos itens = totalNet em toda reserva; totalNet = bruto − desconto', () => {
    for (const r of w.reservations) {
      const cents = Math.round(r.items.reduce((s, i) => s + i.netRevenue, 0) * 100)
      expect(cents, r.code).toBe(Math.round(r.totalNet * 100))
      expect(Math.round((r.totalGross - r.discount) * 100)).toBe(Math.round(r.totalNet * 100))
    }
  })

  it('(d) itens retirados de reservas em uso/retirada estão em uso; item pendente fica reservado', () => {
    for (const r of w.reservations.filter((x) => x.state === 'em_uso' || x.state === 'retirada')) {
      for (const it of r.items) {
        const g = w.garments.find((x) => x.id === it.garmentId)!
        if (it.itemState === 'retirado') expect(['em_uso', 'aguardando_devolucao'], `${r.code} ${g.name}`).toContain(g.state)
        if (it.itemState === 'pendente') expect(g.state, `${r.code} ${g.name}`).toBe('reservado')
      }
    }
    expect(byName('Pisa').state).toBe('reservado')
    expect(byName('Urbino').state).toBe('em_uso')
  })

  it('(e) Turim, Nápoles e Rimini nunca foram alugadas', () => {
    for (const n of ['Turim', 'Nápoles', 'Rimini']) {
      const id = byName(n).id
      const realized = w.reservations.filter((r) => REALIZED_RESERVATION_STATES.includes(r.state) && r.items.some((i) => i.garmentId === id))
      expect(realized, n).toHaveLength(0)
    }
  })

  it('(f) existem reservas em todos os estados exceto devolvida', () => {
    const all: ReservationState[] = ['rascunho', 'confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao', 'em_inspecao', 'finalizada', 'cancelada', 'no_show']
    const states = new Set(w.reservations.map((r) => r.state))
    for (const s of all) expect(states, s).toContain(s)
    expect(states).not.toContain('devolvida')
    expect(w.reservations.filter((r) => r.state === 'rascunho')).toHaveLength(2)
    expect(w.reservations.filter((r) => r.state === 'finalizada').length).toBeGreaterThan(40)
  })

  it('(g) existe prova concluída e prova no-show', () => {
    const states = w.fittings.map((f) => f.state)
    expect(states).toContain('concluida')
    expect(states).toContain('no_show')
    expect(states).toContain('em_curso')
    expect(states).toContain('agendada')
  })

  it('(h) pelo menos 2 compromissos internos; um dia com mais de 4 cartões', () => {
    const internos = w.appointments.filter((a) => a.kind === 'interno')
    expect(internos.length).toBeGreaterThanOrEqual(2)
    for (const a of internos) expect(a.internal).toBe(true)
    const perDay = new Map<string, number>()
    for (const a of w.appointments) perDay.set(a.startsAt.slice(0, 10), (perDay.get(a.startsAt.slice(0, 10)) ?? 0) + 1)
    expect(Math.max(...perDay.values())).toBeGreaterThan(4)
    expect(w.appointments.some((a) => a.title === 'Atendimento — primeira visita')).toBe(true)
    expect(w.appointments.some((a) => a.kind === 'servico' && a.title === 'Coleta da lavanderia')).toBe(true)
  })

  it('um dia com 5+ blocos de acervo (higienização, manutenção, ajuste, bloqueio, editorial)', () => {
    const kinds = ['higienizacao', 'manutencao', 'ajuste', 'bloqueio_manual', 'editorial']
    const n = w.garments.filter((g) => g.blocks.some((b) => kinds.includes(b.kind) && b.from <= TODAY && TODAY <= b.to)).length
    expect(n).toBeGreaterThanOrEqual(5)
  })

  it('(i) a multa da devolução parcial = 20% × total × 1 dia, pendente e com vencimento hoje', () => {
    const r = w.reservations.find((x) => x.state === 'aguardando_devolucao')!
    const fee = lateFee(r.totalNet, w.settings.lateFeeDailyPercent, 1)
    expect(r.lateFee).toBe(fee)
    const multa = r.payments.find((p) => p.kind === 'multa')!
    expect(multa).toMatchObject({ amount: fee, state: 'pendente', dueAt: TODAY, notes: '1 dia(s) de atraso · 1 peça(s) ainda na rua' })
    expect(r.balance.due).toBe(fee)
    expect(r.items.map((i) => i.itemState).sort()).toEqual(['devolvido', 'retirado'])
  })

  it('operação: higienização, manutenção, ajuste, bloqueada, inspeção e baixada', () => {
    const st = (n: string) => byName(n).state
    expect(st('Trastevere')).toBe('higienizacao')
    expect(st('Lecce')).toBe('higienizacao')
    expect(st('Parma')).toBe('manutencao')
    expect(st('Assis')).toBe('ajuste')
    expect(st('Gênova')).toBe('bloqueado')
    expect(st('Modena')).toBe('inspecao')
    expect(st('Ravello')).toBe('inspecao')
    expect(st('Como')).toBe('baixado')
    expect(st('Umbria')).toBe('aguardando_devolucao')
    const parma = w.maintenances.find((m) => m.garmentId === byName('Parma').id && m.state !== 'concluida')!
    expect(parma).toMatchObject({ kind: 'ziper', state: 'em_andamento', provider: 'Ateliê Dona Neuza' })
    expect(byName('Verona').blocks.find((b) => b.kind === 'bloqueio_manual')?.note).toBe('Separada para prova de noiva')
    expect(w.checklist).toHaveLength(10)
  })

  it('códigos RS em ordem cronológica de criação; contrato CT acompanha', () => {
    const sorted = [...w.reservations].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    expect(w.reservations.map((r) => r.code)).toEqual(sorted.map((r) => r.code))
    const nums = sorted.map((r) => r.code)
    expect(new Set(nums).size).toBe(nums.length)
    for (const r of w.reservations) {
      expect(r.code).toMatch(/^RS-\d{4}-\d{4}$/)
      if (r.contract) expect(r.contract.number).toBe(r.code.replace('RS', 'CT'))
    }
  })

  it('histórico: sinal 50% + saldo, contrato assinado, inspeção e higienização paga', () => {
    const fin = w.reservations.filter((r) => r.state === 'finalizada')
    for (const r of fin) {
      expect(r.items).toHaveLength(1)
      expect(r.items[0]!.itemState).toBe('inspecionado')
      expect(r.payments.map((p) => p.kind)).toEqual(['sinal', 'saldo'])
      expect(r.balance.status).toBe('pago')
      expect(r.contract?.signedAt).toBeTruthy()
      expect(w.inspections.some((i) => i.reservationId === r.id)).toBe(true)
      // As últimas locações de Trastevere, Lecce e Parma ainda têm a ordem aberta na Operação (sem despesa).
      if (w.maintenances.some((m) => m.reservationId === r.id && m.state !== 'concluida')) continue
      const hig = w.payables.find((p) => p.reservationId === r.id && p.categoryId === 'fc-higienizacao')!
      expect(hig.amount).toBeGreaterThanOrEqual(38)
      expect(hig.amount).toBeLessThanOrEqual(86)
      expect(hig).toMatchObject({ status: 'paga', source: 'operacao', supplier: 'Lavanderia Branca Neve' })
    }
    const insp = w.inspections.filter((i) => fin.some((r) => r.id === i.reservationId))
    const ressalva = insp.filter((i) => i.result === 'ressalva').length / insp.length
    expect(ressalva).toBeGreaterThan(0.03)
    expect(ressalva).toBeLessThan(0.3)
  })

  it('cancelada (Lecce) e no-show (Bari) sem blocos', () => {
    const c = w.reservations.find((r) => r.state === 'cancelada')!
    expect(c.cancelReason).toBe('Cliente adiou a festa')
    expect(c.items[0]!.garmentId).toBe(byName('Lecce').id)
    const ns = w.reservations.find((r) => r.state === 'no_show')!
    expect(ns.items[0]!.garmentId).toBe(byName('Bari').id)
    for (const g of w.garments) for (const b of g.blocks) expect([c.id, ns.id]).not.toContain(b.reservationId)
  })

  it.each(['2026-10-25', '2026-12-31', '2027-01-01', '2028-02-29'])('invariantes valem com hoje = %s (domingo, virada de ano, bissexto)', (day) => {
    const x = buildWorld(day)
    for (const g of x.garments) {
      for (let i = 0; i < g.blocks.length; i++)
        for (let j = i + 1; j < g.blocks.length; j++) if (overlaps(g.blocks[i]!, g.blocks[j]!)) expect(allowedPair(g.blocks[i]!, g.blocks[j]!), g.name).toBe(true)
    }
    for (const r of x.reservations) expect(Math.round(r.items.reduce((s, i) => s + i.netRevenue, 0) * 100)).toBe(Math.round(r.totalNet * 100))
    const codes = x.reservations.map((r) => r.code)
    expect(new Set(codes).size).toBe(codes.length)
    expect(new Set(x.reservations.map((r) => r.state)).size).toBe(10)
    expect(x.appointments.filter((a) => a.startsAt.startsWith(day)).length).toBeGreaterThan(4)
  })

  it('financeiro: categorias de sistema, aquisição por peça e contas avulsas', () => {
    const sys = w.finCategories.filter((c) => c.isSystem).map((c) => c.name).sort()
    expect(sys).toEqual(['Ajuste', 'Aquisição de acervo', 'Higienização', 'Locação', 'Manutenção'])
    const acq = w.payables.filter((p) => p.source === 'aquisicao')
    expect(acq).toHaveLength(w.garments.filter((g) => (g.acquisitionCost ?? 0) > 0).length)
    expect(w.payables.some((p) => p.source === 'manual' && p.status === 'aberta' && p.dueDate < TODAY)).toBe(true)
    expect(w.receivables.every((r) => r.source === 'avulso')).toBe(true)
    expect(w.receivables).toHaveLength(3)
    expect(w.users.find((u) => u.role === 'admin')).toMatchObject({ name: 'Júlia Senzi', email: 'julia@senzi.com.br' })
  })
})

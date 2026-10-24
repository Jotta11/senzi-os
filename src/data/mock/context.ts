/**
 * Contexto compartilhado das áreas da fonte em memória: o mundo (`db`), "hoje", quem está usando,
 * a ida simulada ao servidor e as projeções que as telas recebem (peça com blocos ativos ordenados,
 * cliente com estatísticas recalculadas das reservas).
 */
import { CLOSED_RESERVATION_STATES } from '@/data/labels'
import { STORE_TZ, todayISO } from '@/lib/format'
import { customerStats } from '@/domain/customers'
import { buildWorld, type World } from '../fixture'
import { at, USER } from './constants'
import { SourceError, type Customer, type Garment, type Reservation, type SourceIssue } from '../types'

export type MockSourceOptions = {
  /** Latência simulada em ms (padrão 150; use 0 nos testes). */
  latencyMs?: number
  /** "Hoje" em `aaaa-mm-dd` (padrão: hoje no fuso da loja). */
  today?: string
  /** Nome de quem registra observações e históricos (padrão "Júlia Senzi"). */
  userName?: () => string
}

export type MockCtx = {
  db: World
  today: string
  userName(): string
  /** Id de quem está usando (pelo nome; padrão a administradora). */
  userId(): string
  /** Instante "agora" no fuso da loja, no dia `today` da fonte (`aaaa-mm-ddThh:mm:00-03:00`). */
  now(): string
  /** Simula a ida ao servidor: espera, roda a operação e devolve uma cópia (ninguém mexe no estado por fora). */
  run<T>(fn: () => T): Promise<T>
  fail(issues: SourceIssue[], hint?: string): never
  newId(prefix: string): string
  /** `NAO_ENCONTRADO` se não existe. */
  garment(id: string): Garment
  customer(id: string): Customer
  reservation(id: string): Reservation
}

const clone = <T>(v: T): T => structuredClone(v)

export function fail(issues: SourceIssue[], hint?: string): never {
  const [first] = issues
  throw new SourceError(first!.code, { field: first!.field, issues, hint })
}

/** `HH:MM` agora no fuso da loja. */
export const storeTime = (): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: STORE_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date())

export function createMockCtx(opts: MockSourceOptions = {}): MockCtx {
  const latency = opts.latencyMs ?? 150
  const today = opts.today ?? todayISO()
  const db = buildWorld(today)
  let seq = 0
  const find = <T extends { id: string }>(list: T[], id: string): T => {
    const x = list.find((i) => i.id === id)
    if (!x) throw new SourceError('NAO_ENCONTRADO')
    return x
  }
  const userName = opts.userName ?? (() => 'Júlia Senzi')
  return {
    db,
    today,
    userName,
    userId: () => db.users.find((u) => u.name === userName())?.id ?? USER.julia.id,
    now: () => at(today, storeTime()),
    async run<T>(fn: () => T): Promise<T> {
      if (latency > 0) await new Promise((r) => setTimeout(r, latency))
      return clone(fn())
    },
    fail,
    newId: (p) => `${p}-${Date.now().toString(36)}-${++seq}`,
    garment: (id) => find(db.garments, id),
    customer: (id) => find(db.customers, id),
    reservation: (id) => find(db.reservations, id),
  }
}

/** Peça como as telas veem: só blocos ativos (locação de reserva encerrada é histórico), ordenados por início. */
export function projectGarment(ctx: MockCtx, g: Garment): Garment {
  const closed = new Set(ctx.db.reservations.filter((r) => CLOSED_RESERVATION_STATES.includes(r.state)).map((r) => r.id))
  const blocks = g.blocks.filter((b) => !(b.kind === 'locacao' && b.reservationId && closed.has(b.reservationId))).sort((a, b) => a.from.localeCompare(b.from))
  return { ...g, blocks }
}

/** Cliente com `stats` recalculadas das reservas: realizadas, Σ líquido delas e o próximo evento de reserva ativa. */
export function projectCustomer(ctx: MockCtx, c: Customer): Customer {
  return { ...c, stats: customerStats(c.id, ctx.db.reservations, ctx.today) }
}

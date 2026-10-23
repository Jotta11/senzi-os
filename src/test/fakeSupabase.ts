import { vi } from 'vitest'

export type FakeResult = { data: unknown; error: unknown; count?: number | null }

/** Registro de uma consulta `from(table)...` montada pelo código sob teste. */
export type FakeQuery = {
  table: string
  select?: string
  selectOpts?: unknown
  eq: [string, unknown][]
  in: [string, unknown[]][]
  order: [string, unknown][]
  range?: [number, number]
}

type Handlers = {
  from?: (q: FakeQuery) => FakeResult
  rpc?: (fn: string, args: Record<string, unknown> | undefined) => FakeResult
  invoke?: (name: string, opts: { body?: unknown }) => FakeResult
}

/**
 * Cliente Supabase falso e encadeável para testes de tela. Cada `from()` grava a
 * consulta em `queries` e resolve com `handlers.from(query)` ao ser aguardado.
 */
export function fakeSupabase(handlers: Handlers) {
  const queries: FakeQuery[] = []
  const from = vi.fn((table: string) => {
    const q: FakeQuery = { table, eq: [], in: [], order: [] }
    queries.push(q)
    const builder = {
      select(cols: string, opts?: unknown) {
        q.select = cols
        q.selectOpts = opts
        return builder
      },
      eq(col: string, v: unknown) {
        q.eq.push([col, v])
        return builder
      },
      in(col: string, v: unknown[]) {
        q.in.push([col, v])
        return builder
      },
      order(col: string, opts?: unknown) {
        q.order.push([col, opts])
        return builder
      },
      range(a: number, b: number) {
        q.range = [a, b]
        return builder
      },
      then<T>(resolve: (r: FakeResult) => T, reject?: (e: unknown) => T) {
        try {
          return Promise.resolve(handlers.from?.(q) ?? { data: [], error: null }).then(resolve, reject)
        } catch (e) {
          return Promise.reject(e).then(resolve, reject)
        }
      },
    }
    return builder
  })
  const rpc = vi.fn(async (fn: string, args?: Record<string, unknown>) => handlers.rpc?.(fn, args) ?? { data: null, error: null })
  const invoke = vi.fn(async (name: string, opts: { body?: unknown }) => handlers.invoke?.(name, opts) ?? { data: null, error: null })
  return { from, rpc, functions: { invoke }, queries }
}

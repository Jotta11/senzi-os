import type { PGlite } from '@electric-sql/pglite'
import { extenso, reaisExtenso } from '@/lib/extenso'
import { createTestDb } from './harness'

let db: PGlite
beforeAll(async () => {
  db = await createTestDb()
}, 120_000)

describe('contrato — extenso no banco igual ao do app', () => {
  it('inteiros e reais', async () => {
    const ints = [0, 1, 7, 15, 20, 21, 99, 100, 101, 110, 199, 200, 330, 999, 1000, 1001, 1050, 1100, 1200, 1250, 2000, 12_500, 21_000, 100_000, 999_999, 1_000_000, 2_000_500]
    const { rows } = await db.query<{ n: number; t: string }>('select n, public.extenso_int(n) as t from unnest($1::bigint[]) n', [ints])
    for (const r of rows) expect(r.t).toBe(extenso(Number(r.n)))
    const vals = [0, 0.01, 0.5, 1, 1.01, 33, 236, 330, 1180, 1250.75, 1_000_000]
    const { rows: rr } = await db.query<{ v: string; t: string }>('select v::text, public.brl_extenso(v) as t from unnest($1::numeric[]) v', [vals])
    for (const r of rr) expect(r.t).toBe(reaisExtenso(Number(r.v)))
  })

  it('data por extenso', async () => {
    const { rows } = await db.query<{ t: string }>(`select public.date_extenso('2026-11-14') as t`)
    expect(rows[0]!.t).toBe('14 de novembro de 2026')
  })
})

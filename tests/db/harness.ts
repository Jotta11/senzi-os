import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'

const root = fileURLToPath(new URL('../../', import.meta.url))
const shimPaths = ['auth.sql', 'storage.sql'].map((f) => join(root, 'supabase/tests/shims', f))
const migrationsDir = join(root, 'supabase/migrations')

/** Banco em memória com os shims de `auth` e `storage` e todas as migrations aplicadas em ordem. */
export async function createTestDb(): Promise<PGlite> {
  const db = await PGlite.create({ extensions: { btree_gist, pg_trgm, pgcrypto } })
  for (const shim of shimPaths) await db.exec(readFileSync(shim, 'utf8'))
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), 'utf8'))
    } catch (err) {
      throw new Error(`migration ${file} falhou: ${(err as Error).message}`, { cause: err })
    }
  }
  return db
}

/**
 * Executa `fn` numa transação como o papel `authenticated` (RLS aplicado),
 * com `auth.uid()` = `userId` (ou nulo). A transação desfaz-se se `fn` lançar.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('set local role authenticated')
    const claims = userId === null ? '{}' : JSON.stringify({ sub: userId })
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    return fn(tx)
  })
}

export interface NewUser {
  email: string
  full_name: string
  role: 'admin' | 'atendimento'
  is_active?: boolean
}

/** Cria `auth.users` + `app_user` como superusuário; devolve o id. */
export async function createUser(db: PGlite, user: NewUser): Promise<string> {
  const {
    rows: [row],
  } = await db.query<{ id: string }>(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [user.email],
  )
  await db.query(
    `insert into public.app_user (id, full_name, email, role, is_active)
     values ($1, $2, $3, $4, $5)`,
    [row.id, user.full_name, user.email, user.role, user.is_active ?? true],
  )
  return row.id
}

/** Executa `fn` numa transação como o papel `anon` (cliente sem login). */
export async function asAnon<T>(db: PGlite, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query('set local role anon')
    await tx.query(`select set_config('request.jwt.claims', '{}', true)`)
    return fn(tx)
  })
}

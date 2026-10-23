import type { PGlite } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

interface AuditRow {
  actor_id: string | null
  table_name: string
  row_id: string
  action: string
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
}

describe('auditoria', () => {
  let db: PGlite
  let admin: string
  let atend: string

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, {
      email: 'bia@senzi.test',
      full_name: 'Bia Atendimento',
      role: 'atendimento',
    })
    // Os inserts do setup também geram auditoria; os testes olham só o que vem depois.
    await db.query('delete from public.audit_log')
  })

  afterEach(async () => {
    await db.close()
  })

  async function auditRows(): Promise<AuditRow[]> {
    const { rows } = await db.query<AuditRow>(
      'select actor_id, table_name, row_id, action, before, after from public.audit_log order by id',
    )
    return rows
  }

  it('update de full_name por admin gera 1 linha com before/after e ator', async () => {
    await db.query(`update public.app_user set pin_hash = 'segredo' where id = $1`, [atend])
    await db.query('delete from public.audit_log')

    await asUser(db, admin, (tx) =>
      tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]),
    )
    const rows = await auditRows()
    expect(rows).toHaveLength(1)
    const [r] = rows
    expect(r.actor_id).toBe(admin)
    expect(r.table_name).toBe('app_user')
    expect(r.row_id).toBe(atend)
    expect(r.action).toBe('update')
    expect(r.before?.full_name).toBe('Bia Atendimento')
    expect(r.after?.full_name).toBe('Bia Nova')
    expect(r.before).not.toHaveProperty('pin_hash')
    expect(r.after).not.toHaveProperty('pin_hash')
  })

  it('insert e delete são auditados (before/after nulos conforme a ação)', async () => {
    const novo = await createUser(db, { email: 'caio@senzi.test', full_name: 'Caio', role: 'atendimento' })
    await db.query('delete from auth.users where id = $1', [novo])
    const rows = (await auditRows()).filter((r) => r.table_name === 'app_user')
    expect(rows.map((r) => r.action)).toEqual(['insert', 'delete'])
    expect(rows[0].before).toBeNull()
    expect(rows[0].after?.email).toBe('caio@senzi.test')
    expect(rows[0].after).not.toHaveProperty('pin_hash')
    expect(rows[1].after).toBeNull()
    expect(rows[1].before?.email).toBe('caio@senzi.test')
  })

  it('overrides são auditados com row_id da chave composta', async () => {
    await asUser(db, admin, (tx) =>
      tx.query(`select public.admin_update_user($1, 'atendimento', true, $2::jsonb)`, [
        atend,
        JSON.stringify({ 'inteligencia.view': true }),
      ]),
    )
    const rows = (await auditRows()).filter((r) => r.table_name === 'user_permission_override')
    expect(rows).toHaveLength(1)
    expect(rows[0].action).toBe('insert')
    expect(rows[0].actor_id).toBe(admin)
    expect(rows[0].row_id).toBe(`${atend}:inteligencia.view`)
  })

  it('atendimento lendo audit_log → 0 linhas; admin → ≥ 1', async () => {
    await asUser(db, admin, (tx) =>
      tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]),
    )
    const seenByAtend = await asUser(db, atend, async (tx) => (await tx.query('select * from public.audit_log')).rows)
    expect(seenByAtend).toHaveLength(0)
    const seenByAdmin = await asUser(db, admin, async (tx) => (await tx.query('select * from public.audit_log')).rows)
    expect(seenByAdmin.length).toBeGreaterThanOrEqual(1)
  })

  it('admin com config.audit revogado → 0 linhas', async () => {
    await asUser(db, admin, (tx) =>
      tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]),
    )
    await db.query(
      `insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'config.audit', false)`,
      [admin],
    )
    const rows = await asUser(db, admin, async (tx) => (await tx.query('select * from public.audit_log')).rows)
    expect(rows).toHaveLength(0)
  })

  it('atendimento delete from audit_log → 0 linhas afetadas', async () => {
    await asUser(db, admin, (tx) =>
      tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]),
    )
    const affected = await asUser(db, atend, async (tx) => {
      try {
        return (await tx.query('delete from public.audit_log')).affectedRows ?? 0
      } catch {
        return 0
      }
    })
    expect(affected).toBe(0)
    expect(await auditRows()).toHaveLength(1)
  })

  it('nenhum papel da API escreve em audit_log diretamente', async () => {
    await asUser(db, admin, (tx) =>
      tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]),
    )
    for (const sql of [
      `insert into public.audit_log (table_name, row_id, action) values ('x', '1', 'insert')`,
      `update public.audit_log set row_id = 'x'`,
      `delete from public.audit_log`,
    ]) {
      await expect(asUser(db, admin, (tx) => tx.query(sql)), sql).rejects.toThrow(/permission denied/)
      await expect(asAnon(db, (tx) => tx.query(sql)), sql).rejects.toThrow(/permission denied/)
      await expect(
        db.transaction(async (tx) => {
          await tx.query('set local role service_role')
          await tx.query(sql)
        }),
        sql,
      ).rejects.toThrow(/permission denied/)
    }
    await expect(asAnon(db, (tx) => tx.query('select 1 from public.audit_log'))).rejects.toThrow(
      /permission denied/,
    )
    expect(await auditRows()).toHaveLength(1)
  })

  it('audit_trigger não é executável diretamente pela API', async () => {
    await expect(asUser(db, admin, (tx) => tx.query('select public.audit_trigger()'))).rejects.toThrow()
  })
})

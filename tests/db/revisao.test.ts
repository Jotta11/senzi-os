import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

// Correções da revisão da branch (migration 20261023000400_fundacao_revisao.sql).

function updateUser(
  tx: Transaction,
  userId: string,
  role: 'admin' | 'atendimento',
  isActive: boolean,
  overrides: Record<string, boolean> | null = null,
) {
  return tx.query('select public.admin_update_user($1, $2::public.app_role, $3, $4::jsonb)', [
    userId,
    role,
    isActive,
    overrides === null ? null : JSON.stringify(overrides),
  ])
}

async function override(db: PGlite, userId: string, perm: string, granted: boolean) {
  await db.query(
    `insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, $3)`,
    [userId, perm, granted],
  )
}

async function hasPerm(db: PGlite, userId: string, perm: string): Promise<boolean> {
  return asUser(db, userId, async (tx) => {
    const { rows } = await tx.query<{ ok: boolean }>('select public.has_perm($1) as ok', [perm])
    return rows[0].ok
  })
}

describe('revisão da fundação', () => {
  let db: PGlite
  let admin: string
  let atend: string

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: 'ana@senzi.test', full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, { email: 'bia@senzi.test', full_name: 'Bia', role: 'atendimento' })
  })

  afterEach(async () => {
    await db.close()
  })

  describe('I2 · shim reproduz os privilégios padrão do Supabase', () => {
    it('tabela criada sem revoke é legível por anon (o shim é realista)', async () => {
      await db.exec('create table public.sem_revoke (x int); insert into public.sem_revoke values (1);')
      try {
        const rows = await asAnon(db, async (tx) => (await tx.query('select x from public.sem_revoke')).rows)
        expect(rows).toEqual([{ x: 1 }])
      } finally {
        await db.exec('drop table public.sem_revoke')
      }
    })

    it('anon não tem privilégio algum em tabelas, sequências ou funções do public', async () => {
      const { rows } = await db.query<{ obj: string }>(`
        select c.relname as obj
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p')
           and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
             or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
        union all
        select c.relname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'S'
           and (has_sequence_privilege('anon', c.oid, 'usage') or has_sequence_privilege('anon', c.oid, 'select')
             or has_sequence_privilege('anon', c.oid, 'update'))
        union all
        select p.proname
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')`)
      expect(rows.map((r) => r.obj)).toEqual([])
    })

    it('authenticated não escreve direto em tabela alguma, só full_name de app_user', async () => {
      const { rows } = await db.query<{ obj: string }>(`
        select c.relname || ':' || priv as obj
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          cross join unnest(array['insert', 'update', 'delete', 'truncate']) priv
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and has_table_privilege('authenticated', c.oid, priv)
        union all
        select c.relname || '.' || a.attname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
          join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
         where n.nspname = 'public' and c.relkind in ('r', 'p')
           and has_column_privilege('authenticated', c.oid, a.attnum, 'update')
        union all
        select c.relname
          from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relkind = 'S'
           and (has_sequence_privilege('authenticated', c.oid, 'usage')
             or has_sequence_privilege('authenticated', c.oid, 'update'))`)
      expect(rows.map((r) => r.obj).sort()).toEqual(['app_user.full_name'])
    })

    it('funções internas (triggers) não são executáveis por authenticated', async () => {
      const { rows } = await db.query<{ proname: string }>(`
        select p.proname
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and has_function_privilege('authenticated', p.oid, 'execute')
         order by 1`)
      expect(rows.map((r) => r.proname)).toEqual([
        'acervo_investment',
        'add_garment_photo',
        'admin_update_user',
        'authorize_exception',
        'block_garment',
        'create_garment',
        'current_app_user_id',
        'garment_costs',
        'garment_counts',
        'get_garment',
        'has_perm',
        'list_active_admins',
        'list_brands',
        'list_garment_categories',
        'my_permissions',
        'release_block',
        'remove_garment_photo',
        'search_garments',
        'set_cover_photo',
        'set_my_pin',
        'update_garment',
        'update_garment_fit',
        'update_garment_measurement',
      ])
    })
  })

  describe('M1 · admin_update_user sem ruído de auditoria', () => {
    async function auditCount(): Promise<number> {
      const { rows } = await db.query<{ n: number }>('select count(*)::int as n from public.audit_log')
      return rows[0].n
    }

    it('adicionar 1 concessão a quem já tem 2 overrides grava exatamente 1 linha de auditoria', async () => {
      await override(db, atend, 'inteligencia.view', true)
      await override(db, atend, 'cliente.note', false)
      await db.query('delete from public.audit_log')

      await asUser(db, admin, (tx) =>
        updateUser(tx, atend, 'atendimento', true, {
          'inteligencia.view': true,
          'cliente.note': false,
          'acervo.cost': true,
        }),
      )
      const { rows } = await db.query<{ table_name: string; action: string; row_id: string }>(
        'select table_name, action, row_id from public.audit_log',
      )
      expect(rows).toEqual([
        { table_name: 'user_permission_override', action: 'insert', row_id: `${atend}:acervo.cost` },
      ])
    })

    it('mesmos valores → nenhuma linha de auditoria', async () => {
      await override(db, atend, 'inteligencia.view', true)
      await db.query('delete from public.audit_log')
      await asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', true, { 'inteligencia.view': true }))
      await asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', true))
      expect(await auditCount()).toBe(0)
    })

    it('valor alterado → 1 update; chave removida → 1 delete (semântica de substituição)', async () => {
      await override(db, atend, 'inteligencia.view', true)
      await override(db, atend, 'cliente.note', false)
      await db.query('delete from public.audit_log')

      await asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', true, { 'cliente.note': true }))
      const { rows } = await db.query<{ action: string; row_id: string }>(
        'select action, row_id from public.audit_log order by row_id',
      )
      expect(rows).toEqual([
        { action: 'update', row_id: `${atend}:cliente.note` },
        { action: 'delete', row_id: `${atend}:inteligencia.view` },
      ])
      expect(await hasPerm(db, atend, 'inteligencia.view')).toBe(false)
      expect(await hasPerm(db, atend, 'cliente.note')).toBe(true)
    })

    it('mudança de perfil continua gravando 1 linha de app_user', async () => {
      await db.query('delete from public.audit_log')
      await asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', false))
      const { rows } = await db.query<{ table_name: string; action: string }>(
        'select table_name, action from public.audit_log',
      )
      expect(rows).toEqual([{ table_name: 'app_user', action: 'update' }])
    })
  })

  describe('M4 · bloqueio de PIN zera após sucesso', () => {
    async function authorize(pin: string) {
      return asUser(db, atend, async (tx) => {
        const { rows } = await tx.query<{ r: { ok: boolean; error?: string } }>(
          `select public.authorize_exception($1, $2, 'retirada_com_saldo', 'motivo', 'reserva', null) as r`,
          ['ana@senzi.test', pin],
        )
        return rows[0].r
      })
    }

    it('4 falhas, 1 sucesso, 1 falha → não bloqueado', async () => {
      await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('1234')`))
      for (let i = 0; i < 4; i++) expect(await authorize('0000')).toMatchObject({ ok: false })
      expect(await authorize('1234')).toMatchObject({ ok: true })
      expect(await authorize('0000')).toEqual({ ok: false, error: 'AUTORIZACAO_INVALIDA' })
      expect(await authorize('1234')).toMatchObject({ ok: true })
    })

    it('5 falhas depois de um sucesso continuam bloqueando', async () => {
      await asUser(db, admin, (tx) => tx.query(`select public.set_my_pin('1234')`))
      expect(await authorize('1234')).toMatchObject({ ok: true })
      for (let i = 0; i < 5; i++) await authorize('0000')
      expect(await authorize('1234')).toEqual({ ok: false, error: 'PIN_BLOQUEADO' })
    })
  })

  describe('M5 · sempre resta alguém com config.users', () => {
    it('admin_update_user toma a trava consultiva dos admins', async () => {
      const { rows } = await db.query<{ src: string }>(
        `select prosrc as src from pg_proc where proname = 'admin_update_user'`,
      )
      expect(rows[0].src).toContain(`pg_advisory_xact_lock(hashtext('app_user_admins'))`)
    })

    it('revogar config.users do último detentor ativo → ULTIMO_ADMIN', async () => {
      // Escrita direta (service_role / SQL), sem passar pela RPC.
      await expect(override(db, admin, 'config.users', false)).rejects.toThrow('ULTIMO_ADMIN')
      expect(await hasPerm(db, admin, 'config.users')).toBe(true)
    })

    it('desativar o único detentor que não é admin (concessão) → ULTIMO_ADMIN', async () => {
      await override(db, atend, 'config.users', true)
      await override(db, admin, 'config.users', false)
      await expect(
        db.query('update public.app_user set is_active = false where id = $1', [atend]),
      ).rejects.toThrow('ULTIMO_ADMIN')
      await expect(db.query('delete from public.user_permission_override where user_id = $1', [atend])).rejects.toThrow(
        'ULTIMO_ADMIN',
      )
    })

    it('via RPC: tirar config.users de outro detentor é permitido enquanto quem chama mantém', async () => {
      const outro = await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await asUser(db, admin, (tx) => updateUser(tx, outro, 'admin', true, { 'config.users': false }))
      expect(await hasPerm(db, outro, 'config.users')).toBe(false)
      // Agora `admin` é o último detentor e não pode perder a permissão por escrita alguma.
      await expect(override(db, admin, 'config.users', false)).rejects.toThrow('ULTIMO_ADMIN')
    })

    it('auto-revogação continua AUTO_REBAIXAMENTO (prioridade sobre ULTIMO_ADMIN)', async () => {
      await expect(
        asUser(db, admin, (tx) => updateUser(tx, admin, 'admin', true, { 'config.users': false })),
      ).rejects.toThrow('AUTO_REBAIXAMENTO')
    })
  })

  describe('M6 · role/is_active só pela RPC', () => {
    it('update direto de role ou is_active → permission denied (até para admin)', async () => {
      for (const sql of [
        `update public.app_user set role = 'admin' where id = $1`,
        `update public.app_user set is_active = false where id = $1`,
      ]) {
        await expect(asUser(db, admin, (tx) => tx.query(sql, [atend])), sql).rejects.toThrow(/permission denied/)
      }
    })

    it('update direto de full_name continua permitido a quem tem config.users', async () => {
      await asUser(db, admin, (tx) => tx.query(`update public.app_user set full_name = 'Bia Nova' where id = $1`, [atend]))
      const { rows } = await db.query<{ full_name: string }>('select full_name from public.app_user where id = $1', [atend])
      expect(rows[0].full_name).toBe('Bia Nova')
    })
  })
})

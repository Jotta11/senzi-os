import type { PGlite, Transaction } from '@electric-sql/pglite'
import { PERMISSIONS } from '../../src/auth/permissions'
import { asAnon, asUser, createTestDb, createUser } from './harness'

async function hasPerm(tx: Transaction, perm: string): Promise<boolean> {
  const { rows } = await tx.query<{ ok: boolean }>('select public.has_perm($1) as ok', [perm])
  return rows[0].ok
}

async function grantOverride(db: PGlite, userId: string, perm: string, granted: boolean) {
  await db.query(
    `insert into public.user_permission_override (user_id, permission_key, granted) values ($1, $2, $3)`,
    [userId, perm, granted],
  )
}

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

describe('acesso: perfis, permissões e RLS', () => {
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
  })

  afterEach(async () => {
    await db.close()
  })

  describe('has_perm', () => {
    it('admin ativo tem config.users', async () => {
      expect(await asUser(db, admin, (tx) => hasPerm(tx, 'config.users'))).toBe(true)
    })

    it('atendimento não tem config.users', async () => {
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'config.users'))).toBe(false)
    })

    it('atendimento tem operacao.inspect e agenda.manage', async () => {
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'operacao.inspect'))).toBe(true)
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'agenda.manage'))).toBe(true)
    })

    it('atendimento não tem permissões restritas ao admin', async () => {
      for (const p of [
        'acervo.cost',
        'financeiro.consolidated',
        'financeiro.geral',
        'inteligencia.view',
        'reserva.authorize',
        'config.view',
      ]) {
        expect(await asUser(db, atend, (tx) => hasPerm(tx, p)), p).toBe(false)
      }
    })

    it('sem sessão (auth.uid() nulo) → false', async () => {
      expect(await asUser(db, null, (tx) => hasPerm(tx, 'dashboard.view'))).toBe(false)
    })

    it('override concedido: atendimento com inteligencia.view → true', async () => {
      await grantOverride(db, atend, 'inteligencia.view', true)
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'inteligencia.view'))).toBe(true)
    })

    it('override revogado: admin sem config.audit → false', async () => {
      await grantOverride(db, admin, 'config.audit', false)
      expect(await asUser(db, admin, (tx) => hasPerm(tx, 'config.audit'))).toBe(false)
      expect(await asUser(db, admin, (tx) => hasPerm(tx, 'config.users'))).toBe(true)
    })

    it('my_permissions aplica perfil + concedidas − revogadas', async () => {
      await grantOverride(db, atend, 'inteligencia.view', true)
      await grantOverride(db, atend, 'cliente.note', false)
      const perms = await asUser(db, atend, async (tx) => {
        const { rows } = await tx.query<{ p: string }>('select p from public.my_permissions() p')
        return rows.map((r) => r.p)
      })
      expect(perms).toContain('inteligencia.view')
      expect(perms).toContain('cliente.view')
      expect(perms).not.toContain('cliente.note')
      expect(perms).not.toContain('config.users')
    })
  })

  describe('usuário inativo', () => {
    it('has_perm é false e app_user devolve 0 linhas', async () => {
      const inativo = await createUser(db, {
        email: 'caio@senzi.test',
        full_name: 'Caio Inativo',
        role: 'admin',
        is_active: false,
      })
      expect(await asUser(db, inativo, (tx) => hasPerm(tx, 'dashboard.view'))).toBe(false)
      const rows = await asUser(db, inativo, async (tx) => (await tx.query('select id from public.app_user')).rows)
      expect(rows).toHaveLength(0)
      const perms = await asUser(db, inativo, async (tx) => (await tx.query('select * from public.my_permissions()')).rows)
      expect(perms).toHaveLength(0)
    })
  })

  describe('RLS de app_user', () => {
    it('atendimento vê apenas a própria linha', async () => {
      const rows = await asUser(
        db,
        atend,
        async (tx) => (await tx.query<{ id: string }>('select id from public.app_user')).rows,
      )
      expect(rows.map((r) => r.id)).toEqual([atend])
    })

    it('admin vê todas as linhas', async () => {
      const rows = await asUser(
        db,
        admin,
        async (tx) => (await tx.query<{ id: string }>('select id from public.app_user')).rows,
      )
      expect(rows.map((r) => r.id).sort()).toEqual([admin, atend].sort())
    })

    it('atendimento não consegue se promover (update direto de role → permission denied)', async () => {
      await expect(
        asUser(db, atend, (tx) => tx.query(`update public.app_user set role = 'admin' where id = $1`, [atend])),
      ).rejects.toThrow(/permission denied/)
      const { rows } = await db.query<{ role: string }>('select role from public.app_user where id = $1', [atend])
      expect(rows[0].role).toBe('atendimento')
    })

    it('atendimento não lê overrides de outros usuários', async () => {
      await grantOverride(db, admin, 'config.audit', false)
      const rows = await asUser(
        db,
        atend,
        async (tx) => (await tx.query('select * from public.user_permission_override')).rows,
      )
      expect(rows).toHaveLength(0)
    })

    it('admin não contorna as regras com update direto no próprio perfil', async () => {
      await expect(
        asUser(db, admin, (tx) =>
          tx.query(`update public.app_user set role = 'atendimento' where id = $1`, [admin]),
        ),
      ).rejects.toThrow(/permission denied/)
    })

    it('defesa em profundidade: o trigger recusa auto-rebaixamento mesmo sem passar pelo grant', async () => {
      // Superusuário (como service_role/SQL direto) com a sessão do próprio admin.
      await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await expect(
        db.transaction(async (tx) => {
          await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: admin })])
          await tx.query(`update public.app_user set role = 'atendimento' where id = $1`, [admin])
        }),
      ).rejects.toThrow('AUTO_REBAIXAMENTO')
    })
  })

  describe('admin_update_user', () => {
    it('desativar ou rebaixar o único admin ativo → ULTIMO_ADMIN', async () => {
      // Quem chama é um atendimento com config.users concedida, para isolar a regra do último admin
      // da regra de auto-rebaixamento.
      await grantOverride(db, atend, 'config.users', true)
      await expect(asUser(db, atend, (tx) => updateUser(tx, admin, 'admin', false))).rejects.toThrow(
        'ULTIMO_ADMIN',
      )
      await expect(asUser(db, atend, (tx) => updateUser(tx, admin, 'atendimento', true))).rejects.toThrow(
        'ULTIMO_ADMIN',
      )
      // Admin inativo não conta como admin ativo restante.
      await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin', is_active: false })
      await expect(asUser(db, atend, (tx) => updateUser(tx, admin, 'admin', false))).rejects.toThrow(
        'ULTIMO_ADMIN',
      )
    })

    it('com dois admins ativos, desativar um é permitido', async () => {
      const outro = await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await asUser(db, admin, (tx) => updateUser(tx, outro, 'admin', false))
      const { rows } = await db.query<{ is_active: boolean }>(
        'select is_active from public.app_user where id = $1',
        [outro],
      )
      expect(rows[0].is_active).toBe(false)
    })

    it('admin mudando o próprio perfil → AUTO_REBAIXAMENTO', async () => {
      await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await expect(asUser(db, admin, (tx) => updateUser(tx, admin, 'atendimento', true))).rejects.toThrow(
        'AUTO_REBAIXAMENTO',
      )
      await expect(asUser(db, admin, (tx) => updateUser(tx, admin, 'admin', false))).rejects.toThrow(
        'AUTO_REBAIXAMENTO',
      )
    })

    it('atendimento chamando → SEM_PERMISSAO', async () => {
      await expect(asUser(db, atend, (tx) => updateUser(tx, atend, 'admin', true))).rejects.toThrow(
        'SEM_PERMISSAO',
      )
    })

    it('admin altera outro usuário e substitui os overrides', async () => {
      await grantOverride(db, atend, 'cliente.note', false)
      await asUser(db, admin, (tx) =>
        updateUser(tx, atend, 'atendimento', true, { 'inteligencia.view': true, 'acervo.edit': false }),
      )
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'inteligencia.view'))).toBe(true)
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'acervo.edit'))).toBe(false)
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'cliente.note'))).toBe(true)

      await asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', false))
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'dashboard.view'))).toBe(false)
    })
  })

  describe('ajustes (20261023000150)', () => {
    it('my_permissions documenta a equivalência da fórmula', async () => {
      const { rows } = await db.query<{ src: string }>(
        `select prosrc as src from pg_proc where proname = 'my_permissions'`,
      )
      expect(rows[0].src).toMatch(/exclusiv/i)
    })

    it('guarda do último admin usa trava consultiva, não "for update" em ordem', async () => {
      const { rows } = await db.query<{ src: string }>(
        `select prosrc as src from pg_proc where proname = 'app_user_guard_admins'`,
      )
      expect(rows[0].src).toContain('pg_advisory_xact_lock')
      expect(rows[0].src).not.toMatch(/for\s+update/i)
    })

    it('apagar o último admin ativo (cascata de auth.users) → ULTIMO_ADMIN', async () => {
      await expect(db.query('delete from auth.users where id = $1', [admin])).rejects.toThrow('ULTIMO_ADMIN')
      await expect(db.query('delete from public.app_user where id = $1', [admin])).rejects.toThrow(
        'ULTIMO_ADMIN',
      )
    })

    it('apagar um admin quando há outro ativo é permitido', async () => {
      await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await db.query('delete from auth.users where id = $1', [admin])
      const { rows } = await db.query('select 1 from public.app_user where id = $1', [admin])
      expect(rows).toHaveLength(0)
    })

    it('apagar atendimento é permitido', async () => {
      await db.query('delete from auth.users where id = $1', [atend])
      const { rows } = await db.query('select 1 from public.app_user where id = $1', [atend])
      expect(rows).toHaveLength(0)
    })

    it('remover de si mesmo a concessão de config.users com {} → AUTO_REBAIXAMENTO', async () => {
      await grantOverride(db, atend, 'config.users', true)
      await expect(asUser(db, atend, (tx) => updateUser(tx, atend, 'atendimento', true, {}))).rejects.toThrow(
        'AUTO_REBAIXAMENTO',
      )
      expect(await asUser(db, atend, (tx) => hasPerm(tx, 'config.users'))).toBe(true)
    })

    it('chave de override desconhecida → PARAMETRO_INVALIDO', async () => {
      await expect(
        asUser(db, admin, (tx) => updateUser(tx, atend, 'atendimento', true, { 'nao.existe': true })),
      ).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('anon não lê tabelas nem chama has_perm/admin_update_user', async () => {
      for (const t of ['app_user', 'permission', 'role_permission', 'user_permission_override']) {
        await expect(asAnon(db, (tx) => tx.query(`select 1 from public.${t}`)), t).rejects.toThrow(
          /permission denied/,
        )
      }
      await expect(asAnon(db, (tx) => tx.query(`select public.has_perm('config.users')`))).rejects.toThrow(
        /permission denied/,
      )
      await expect(
        asAnon(db, (tx) => tx.query(`select public.admin_update_user($1, 'admin', true, null)`, [atend])),
      ).rejects.toThrow(/permission denied/)
    })

    it('authenticated não altera pin_hash nem insere override diretamente', async () => {
      await expect(
        asUser(db, admin, (tx) => tx.query(`update public.app_user set pin_hash = 'x' where id = $1`, [atend])),
      ).rejects.toThrow(/permission denied/)
      await expect(
        asUser(db, admin, (tx) =>
          tx.query(
            `insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'config.users', true)`,
            [atend],
          ),
        ),
      ).rejects.toThrow(/permission denied/)
    })

    it('authenticated não lê pin_hash (nem de si mesmo)', async () => {
      await expect(
        asUser(db, admin, (tx) => tx.query(`select pin_hash from public.app_user`)),
      ).rejects.toThrow(/permission denied/)
      const rows = await asUser(
        db,
        admin,
        async (tx) =>
          (
            await tx.query(
              `select id, full_name, email, role, is_active, created_at, updated_at from public.app_user`,
            )
          ).rows,
      )
      expect(rows).toHaveLength(2)
    })
  })

  describe('catálogo', () => {
    it('tabela permission está em sincronia com src/auth/permissions.ts', async () => {
      const { rows } = await db.query<{ key: string; label: string }>(
        'select key, label from public.permission order by key',
      )
      expect(rows.map((r) => r.key)).toEqual(Object.keys(PERMISSIONS).sort())
      expect(Object.fromEntries(rows.map((r) => [r.key, r.label]))).toEqual(PERMISSIONS)
    })

    it('admin tem todas as permissões', async () => {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from public.role_permission where role = 'admin'`,
      )
      expect(rows[0].n).toBe(Object.keys(PERMISSIONS).length)
    })
  })
})

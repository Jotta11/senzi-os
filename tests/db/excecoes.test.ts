import type { PGlite, Transaction } from '@electric-sql/pglite'
import { asAnon, asUser, createTestDb, createUser } from './harness'

type AuthResult = { ok: true; id: string } | { ok: false; error: string }

async function authorize(
  tx: Transaction,
  email: string,
  pin: string,
  opts: { kind?: string; reason?: string; refType?: string | null; refId?: string | null } = {},
): Promise<AuthResult> {
  const { rows } = await tx.query<{ r: AuthResult }>(
    'select public.authorize_exception($1, $2, $3, $4, $5, $6) as r',
    [
      email,
      pin,
      opts.kind ?? 'retirada_com_saldo',
      opts.reason ?? 'Cliente pagará o saldo na devolução',
      opts.refType ?? 'reserva',
      opts.refId ?? null,
    ],
  )
  return rows[0].r
}

function setPin(tx: Transaction, pin: string) {
  return tx.query('select public.set_my_pin($1)', [pin])
}

describe('exceções: PIN e autorização', () => {
  let db: PGlite
  let admin: string
  let atend: string
  const ADMIN_EMAIL = 'ana@senzi.test'

  beforeEach(async () => {
    db = await createTestDb()
    admin = await createUser(db, { email: ADMIN_EMAIL, full_name: 'Ana Admin', role: 'admin' })
    atend = await createUser(db, {
      email: 'bia@senzi.test',
      full_name: 'Bia Atendimento',
      role: 'atendimento',
    })
    await asUser(db, admin, (tx) => setPin(tx, '1234'))
  })

  afterEach(async () => {
    await db.close()
  })

  describe('set_my_pin', () => {
    it('grava hash bcrypt, nunca o PIN em claro', async () => {
      const { rows } = await db.query<{ h: string }>('select pin_hash as h from public.app_user where id = $1', [
        admin,
      ])
      expect(rows[0].h).toMatch(/^\$2[abxy]?\$/)
      expect(rows[0].h).not.toContain('1234')
    })

    it("PIN '12' → PIN_INVALIDO", async () => {
      await expect(asUser(db, admin, (tx) => setPin(tx, '12'))).rejects.toThrow('PIN_INVALIDO')
    })

    it('PIN com letras, longo demais ou nulo → PIN_INVALIDO', async () => {
      for (const pin of ['12a4', '1234567', ' 1234', null]) {
        await expect(
          asUser(db, admin, (tx) => tx.query('select public.set_my_pin($1)', [pin])),
          String(pin),
        ).rejects.toThrow('PIN_INVALIDO')
      }
    })

    it('aceita 4 a 6 dígitos', async () => {
      await asUser(db, admin, (tx) => setPin(tx, '123456'))
      expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '123456'))).toMatchObject({ ok: true })
    })

    it('atendimento chamando → erro (SEM_PERMISSAO)', async () => {
      await expect(asUser(db, atend, (tx) => setPin(tx, '1234'))).rejects.toThrow('SEM_PERMISSAO')
    })

    it('anon não executa set_my_pin', async () => {
      await expect(asAnon(db, (tx) => setPin(tx, '1234'))).rejects.toThrow(/permission denied/)
    })
  })

  describe('authorize_exception', () => {
    it('PIN correto → ok com id; linha com authorized_by = admin e requested_by = atendimento', async () => {
      const refId = '6b1f8c34-6f0a-4c0e-9a51-0d3d6c1f0a11'
      const res = await asUser(db, atend, (tx) =>
        authorize(tx, ADMIN_EMAIL, '1234', { kind: 'desconto_acima_limite', refId }),
      )
      expect(res.ok).toBe(true)
      if (!res.ok) return
      expect(res.id).toMatch(/^[0-9a-f-]{36}$/)
      const { rows } = await db.query<Record<string, unknown>>(
        'select * from public.exception_authorization where id = $1',
        [res.id],
      )
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({
        kind: 'desconto_acima_limite',
        reason: 'Cliente pagará o saldo na devolução',
        ref_type: 'reserva',
        ref_id: refId,
        requested_by: atend,
        authorized_by: admin,
      })
    })

    it('PIN errado e e-mail inexistente → ambos AUTORIZACAO_INVALIDA', async () => {
      expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '9999'))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })
      expect(await asUser(db, atend, (tx) => authorize(tx, 'ninguem@senzi.test', '1234'))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })
      const { rows } = await db.query('select 1 from public.exception_authorization')
      expect(rows).toHaveLength(0)
    })

    it('admin inativo, admin sem PIN e e-mail de atendimento → AUTORIZACAO_INVALIDA', async () => {
      const outro = await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await asUser(db, outro, (tx) => setPin(tx, '4321'))
      await db.query('update public.app_user set is_active = false where id = $1', [outro])
      expect(await asUser(db, atend, (tx) => authorize(tx, 'duda@senzi.test', '4321'))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })

      await createUser(db, { email: 'edu@senzi.test', full_name: 'Edu', role: 'admin' })
      expect(await asUser(db, atend, (tx) => authorize(tx, 'edu@senzi.test', ''))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })

      expect(await asUser(db, admin, (tx) => authorize(tx, 'bia@senzi.test', '1234'))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })
    })

    it('admin com reserva.authorize revogado → AUTORIZACAO_INVALIDA', async () => {
      await db.query(
        `insert into public.user_permission_override (user_id, permission_key, granted) values ($1, 'reserva.authorize', false)`,
        [admin],
      )
      expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))).toEqual({
        ok: false,
        error: 'AUTORIZACAO_INVALIDA',
      })
    })

    it('falhas persistem entre transações: 5 erros → 6ª com PIN certo → PIN_BLOQUEADO', async () => {
      for (let i = 0; i < 5; i++) {
        // Cada asUser é uma transação própria, como cada chamada RPC no PostgREST.
        expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '0000'))).toEqual({
          ok: false,
          error: 'AUTORIZACAO_INVALIDA',
        })
      }
      const { rows: attempts } = await db.query<{ n: number }>(
        'select count(*)::int as n from public.pin_attempt where admin_id = $1 and not ok',
        [admin],
      )
      expect(attempts[0].n).toBe(5)

      expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))).toEqual({
        ok: false,
        error: 'PIN_BLOQUEADO',
      })
      const { rows } = await db.query('select 1 from public.exception_authorization')
      expect(rows).toHaveLength(0)
    })

    it('bloqueio é por admin: outro admin continua autorizando', async () => {
      const outro = await createUser(db, { email: 'duda@senzi.test', full_name: 'Duda', role: 'admin' })
      await asUser(db, outro, (tx) => setPin(tx, '4321'))
      for (let i = 0; i < 5; i++) await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '0000'))
      expect(await asUser(db, atend, (tx) => authorize(tx, 'duda@senzi.test', '4321'))).toMatchObject({
        ok: true,
      })
    })

    it('falhas com mais de 15 minutos não contam', async () => {
      for (let i = 0; i < 5; i++) await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '0000'))
      await db.query(`update public.pin_attempt set at = now() - interval '16 minutes'`)
      expect(await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))).toMatchObject({ ok: true })
    })

    it('tentativa bem-sucedida também é registrada', async () => {
      await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))
      const { rows } = await db.query<{ ok: boolean }>('select ok from public.pin_attempt where admin_id = $1', [
        admin,
      ])
      expect(rows.map((r) => r.ok)).toEqual([true])
    })

    it('motivo vazio ou só espaços → MOTIVO_OBRIGATORIO', async () => {
      for (const reason of ['', '   ']) {
        await expect(
          asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234', { reason })),
        ).rejects.toThrow('MOTIVO_OBRIGATORIO')
      }
      await expect(
        asUser(db, atend, (tx) =>
          tx.query(`select public.authorize_exception($1, '1234', 'retirada_com_saldo', null, null, null)`, [
            ADMIN_EMAIL,
          ]),
        ),
      ).rejects.toThrow('MOTIVO_OBRIGATORIO')
    })

    it('tipo de exceção desconhecido → PARAMETRO_INVALIDO', async () => {
      await expect(
        asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234', { kind: 'qualquer_coisa' })),
      ).rejects.toThrow('PARAMETRO_INVALIDO')
    })

    it('usuário inativo chamando → SEM_PERMISSAO; anon → permission denied', async () => {
      const inativo = await createUser(db, {
        email: 'caio@senzi.test',
        full_name: 'Caio',
        role: 'atendimento',
        is_active: false,
      })
      await expect(asUser(db, inativo, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))).rejects.toThrow(
        'SEM_PERMISSAO',
      )
      await expect(asAnon(db, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))).rejects.toThrow(/permission denied/)
    })

    it('API não lê pin_attempt nem escreve em exception_authorization', async () => {
      await expect(asUser(db, admin, (tx) => tx.query('select * from public.pin_attempt'))).rejects.toThrow(
        /permission denied/,
      )
      await expect(
        asUser(db, admin, (tx) =>
          tx.query(
            `insert into public.exception_authorization (kind, reason, authorized_by) values ('retirada_com_saldo', 'x', $1)`,
            [admin],
          ),
        ),
      ).rejects.toThrow(/permission denied/)
      await expect(
        asUser(db, admin, (tx) => tx.query(`delete from public.pin_attempt`)),
      ).rejects.toThrow(/permission denied/)
    })

    it('exception_authorization: envolvidos e auditor leem; terceiros não', async () => {
      const res = await asUser(db, atend, (tx) => authorize(tx, ADMIN_EMAIL, '1234'))
      expect(res.ok).toBe(true)
      const terceiro = await createUser(db, { email: 'gil@senzi.test', full_name: 'Gil', role: 'atendimento' })
      const count = (uid: string) =>
        asUser(db, uid, async (tx) => (await tx.query('select id from public.exception_authorization')).rows.length)
      expect(await count(atend)).toBe(1)
      expect(await count(admin)).toBe(1)
      expect(await count(terceiro)).toBe(0)
    })
  })

  describe('list_active_admins', () => {
    it('atendimento recebe os admins ativos com PIN, ordenados pelo nome', async () => {
      const zeca = await createUser(db, { email: 'zeca@senzi.test', full_name: 'Zeca Admin', role: 'admin' })
      await asUser(db, zeca, (tx) => setPin(tx, '5555'))
      await createUser(db, { email: 'semPin@senzi.test', full_name: 'Bruno Sem Pin', role: 'admin' })
      const inativo = await createUser(db, { email: 'ines@senzi.test', full_name: 'Inês', role: 'admin' })
      await asUser(db, inativo, (tx) => setPin(tx, '5555'))
      await db.query('update public.app_user set is_active = false where id = $1', [inativo])

      const rows = await asUser(
        db,
        atend,
        async (tx) =>
          (await tx.query<{ id: string; full_name: string; email: string }>('select * from public.list_active_admins()'))
            .rows,
      )
      expect(rows).toEqual([
        { id: admin, full_name: 'Ana Admin', email: ADMIN_EMAIL },
        { id: zeca, full_name: 'Zeca Admin', email: 'zeca@senzi.test' },
      ])
    })

    it('usuário inativo → SEM_PERMISSAO; anon → permission denied', async () => {
      const inativo = await createUser(db, {
        email: 'caio@senzi.test',
        full_name: 'Caio',
        role: 'atendimento',
        is_active: false,
      })
      await expect(
        asUser(db, inativo, (tx) => tx.query('select * from public.list_active_admins()')),
      ).rejects.toThrow('SEM_PERMISSAO')
      await expect(asAnon(db, (tx) => tx.query('select * from public.list_active_admins()'))).rejects.toThrow(
        /permission denied/,
      )
    })
  })
})

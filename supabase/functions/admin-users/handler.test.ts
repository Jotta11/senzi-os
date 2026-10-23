import { describe, expect, it, vi } from 'vitest'
import { EmailTakenError, handleAdminUsers, type AdminUsersDeps } from './handler'

function deps(over: Partial<AdminUsersDeps> = {}): AdminUsersDeps {
  return {
    getCaller: vi.fn(async () => ({ id: 'admin-1', canManageUsers: true })),
    createAuthUser: vi.fn(async () => 'new-id'),
    insertAppUser: vi.fn(async () => {}),
    deleteAuthUser: vi.fn(async () => {}),
    ...over,
  }
}

const valid = { action: 'create', email: 'bia@senzi.com.br', full_name: 'Bia Lima', role: 'atendimento', password: 'segredo123' }

function req(body: unknown, token: string | null = 'tok', method = 'POST') {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  return new Request('http://localhost/admin-users', {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  })
}

describe('handleAdminUsers', () => {
  it('OPTIONS responde ao preflight com cabeçalhos CORS', async () => {
    const res = await handleAdminUsers(req(null, null, 'OPTIONS'), deps())
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(res.headers.get('access-control-allow-headers')).toMatch(/authorization/)
  })

  it('sem token → 401 e não consulta o chamador', async () => {
    const d = deps()
    const res = await handleAdminUsers(req(valid, null), d)
    expect(res.status).toBe(401)
    expect(res.headers.get('access-control-allow-origin')).toBe('*')
    expect(d.getCaller).not.toHaveBeenCalled()
  })

  it('token inválido → 401', async () => {
    const res = await handleAdminUsers(req(valid), deps({ getCaller: vi.fn(async () => null) }))
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('Sessão inválida. Entre novamente.')
  })

  it('chamador sem permissão → 403 e nada é criado', async () => {
    const d = deps({ getCaller: vi.fn(async () => ({ id: 'x', canManageUsers: false })) })
    const res = await handleAdminUsers(req(valid), d)
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('Você não tem permissão para gerenciar usuários.')
    expect(d.createAuthUser).not.toHaveBeenCalled()
  })

  it('e-mail inválido → 400 em pt-BR', async () => {
    const d = deps()
    const res = await handleAdminUsers(req({ ...valid, email: 'nao-e-email' }), d)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Informe um e-mail válido.')
    expect(d.createAuthUser).not.toHaveBeenCalled()
  })

  it('senha com menos de 8 caracteres → 400 em pt-BR', async () => {
    const res = await handleAdminUsers(req({ ...valid, password: '1234567' }), deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('A senha deve ter ao menos 8 caracteres.')
  })

  it('perfil fora de admin/atendimento → 400', async () => {
    const res = await handleAdminUsers(req({ ...valid, role: 'gerente' }), deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Perfil inválido.')
  })

  it('nome vazio → 400', async () => {
    const res = await handleAdminUsers(req({ ...valid, full_name: '   ' }), deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Informe o nome.')
  })

  it('ação desconhecida → 400', async () => {
    const res = await handleAdminUsers(req({ ...valid, action: 'delete' }), deps())
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Ação inválida.')
  })

  it('corpo que não é JSON → 400', async () => {
    const r = new Request('http://localhost/admin-users', { method: 'POST', headers: { authorization: 'Bearer tok' }, body: '{' })
    const res = await handleAdminUsers(r, deps())
    expect(res.status).toBe(400)
  })

  it('método diferente de POST → 405', async () => {
    const res = await handleAdminUsers(req(null, 'tok', 'GET'), deps())
    expect(res.status).toBe(405)
  })

  it('sucesso → 201 com {id} e insertAppUser recebe o perfil pedido', async () => {
    const d = deps()
    const res = await handleAdminUsers(req({ ...valid, role: 'admin', email: ' Bia@Senzi.com.br ' }), d)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ id: 'new-id' })
    expect(d.getCaller).toHaveBeenCalledWith('tok')
    expect(d.createAuthUser).toHaveBeenCalledWith({ email: 'bia@senzi.com.br', password: 'segredo123', full_name: 'Bia Lima' })
    expect(d.insertAppUser).toHaveBeenCalledWith({ id: 'new-id', email: 'bia@senzi.com.br', full_name: 'Bia Lima', role: 'admin' })
    expect(d.deleteAuthUser).not.toHaveBeenCalled()
  })

  it('e-mail já cadastrado no auth → 409', async () => {
    const d = deps({ createAuthUser: vi.fn(async () => { throw new EmailTakenError() }) })
    const res = await handleAdminUsers(req(valid), d)
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('Já existe um usuário com este e-mail.')
    expect(d.insertAppUser).not.toHaveBeenCalled()
  })

  it('falha ao inserir app_user desfaz o usuário do auth e responde 500', async () => {
    const d = deps({ insertAppUser: vi.fn(async () => { throw new Error('boom') }) })
    const res = await handleAdminUsers(req(valid), d)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('Não foi possível criar o usuário. Tente novamente.')
    expect(d.deleteAuthUser).toHaveBeenCalledWith('new-id')
  })

  it('e-mail duplicado em app_user também desfaz o auth e responde 409', async () => {
    const d = deps({ insertAppUser: vi.fn(async () => { throw new EmailTakenError() }) })
    const res = await handleAdminUsers(req(valid), d)
    expect(res.status).toBe(409)
    expect(d.deleteAuthUser).toHaveBeenCalledWith('new-id')
  })

  it('falha inesperada ao criar no auth → 500 sem vazar detalhes', async () => {
    const d = deps({ createAuthUser: vi.fn(async () => { throw new Error('segredo interno') }) })
    const res = await handleAdminUsers(req(valid), d)
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toMatch(/segredo interno/)
  })
})

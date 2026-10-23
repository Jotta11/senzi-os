import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Perm } from '@/auth/permissions'
import { fakeSupabase, type FakeQuery, type FakeResult } from '@/test/fakeSupabase'
import { ConfigPage } from './ConfigPage'

const sbMock = vi.hoisted(() => ({ getSupabase: vi.fn() }))
const authMock = vi.hoisted(() => ({ user: null as unknown, perms: [] as string[] }))
vi.mock('@/lib/supabase', () => sbMock)
vi.mock('@/auth/useAuth', () => ({ useAuth: () => ({ status: 'signed_in', user: authMock.user }) }))
vi.mock('@/auth/usePermissions', () => ({
  usePermissions: () => ({
    can: (p: Perm) => authMock.perms.includes(p),
    perms: new Set(authMock.perms),
    isLoading: false,
  }),
}))

const ANA = { id: 'u1', full_name: 'Ana Souza', email: 'ana@senzi.com.br', role: 'admin', is_active: true, created_at: '2026-10-01T12:00:00Z' }
const BIA = { id: 'u2', full_name: 'Bia Lima', email: 'bia@senzi.com.br', role: 'atendimento', is_active: false, created_at: '2026-10-02T12:00:00Z' }
const ADMIN_PERMS = ['config.view', 'config.users', 'config.audit']

type From = (q: FakeQuery) => FakeResult | undefined
type Rpc = (fn: string, args: Record<string, unknown> | undefined) => FakeResult | undefined

function setup(opts: { role?: 'admin' | 'atendimento'; perms?: string[]; from?: From; rpc?: Rpc; invoke?: (name: string, o: { body?: unknown }) => FakeResult } = {}) {
  authMock.user = { ...ANA, role: opts.role ?? 'admin' }
  authMock.perms = opts.perms ?? ADMIN_PERMS
  const client = fakeSupabase({
    from: (q) => {
      const custom = opts.from?.(q)
      if (custom) return custom
      if (q.table === 'app_user' && q.single) {
        const id = q.eq.find(([c]) => c === 'id')?.[1]
        return { data: [ANA, BIA].find((u) => u.id === id) ?? null, error: null }
      }
      if (q.table === 'app_user') return { data: [ANA, BIA], error: null }
      if (q.table === 'role_permission') return { data: [{ role: 'atendimento', permission_key: 'dashboard.view' }, { role: 'atendimento', permission_key: 'cliente.view' }], error: null }
      if (q.table === 'user_permission_override') return { data: [], error: null }
      if (q.table === 'audit_log') return { data: [], error: null, count: 0 }
      return { data: [], error: null }
    },
    rpc: (fn, args) => opts.rpc?.(fn, args) ?? { data: null, error: null },
    invoke: opts.invoke,
  })
  sbMock.getSupabase.mockReturnValue(client)
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ConfigPage />
    </QueryClientProvider>,
  )
  return client
}

const tab = (name: string) => screen.getByRole('tab', { name })

beforeEach(() => vi.clearAllMocks())

describe('ConfigPage — abas', () => {
  it('admin vê as quatro abas acessíveis', () => {
    setup()
    expect(screen.getByRole('tablist', { name: 'Configurações' })).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Usuários', 'Permissões', 'PIN', 'Auditoria'])
    expect(tab('Usuários')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel', { name: 'Usuários' })).toBeInTheDocument()
  })

  it('aba PIN só aparece para admin', () => {
    setup({ role: 'atendimento', perms: ['config.view', 'config.users', 'config.audit'] })
    expect(screen.queryByRole('tab', { name: 'PIN' })).toBeNull()
    expect(tab('Usuários')).toBeInTheDocument()
  })

  it('sem config.audit não mostra Auditoria; sem config.users não mostra Usuários nem Permissões', () => {
    setup({ perms: ['config.view'] })
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['PIN'])
  })

  it('sem nenhuma aba disponível mostra aviso', () => {
    setup({ role: 'atendimento', perms: ['config.view'] })
    expect(screen.queryByRole('tab')).toBeNull()
    expect(screen.getByText('Nenhuma configuração disponível para o seu perfil.')).toBeInTheDocument()
  })

  it('setas do teclado trocam de aba', async () => {
    setup()
    tab('Usuários').focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(tab('Permissões')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Permissões')).toHaveFocus()
  })
})

describe('Usuários', () => {
  it('lista usuários com perfil e status, sem select("*")', async () => {
    const c = setup()
    const panel = screen.getByRole('tabpanel', { name: 'Usuários' })
    const ana = (await within(panel).findByText('Ana Souza')).closest('tr')!
    expect(within(ana).getByText('Administrador')).toBeInTheDocument()
    expect(within(ana).getByText('Ativo')).toBeInTheDocument()
    const bia = within(panel).getByText('Bia Lima').closest('tr')!
    expect(within(bia).getByText('Atendimento')).toBeInTheDocument()
    expect(within(bia).getByText('Inativo')).toBeInTheDocument()
    for (const q of c.queries) expect(q.select).not.toMatch(/\*/)
  })

  it('desativar a si mesmo exibe a mensagem de AUTO_REBAIXAMENTO', async () => {
    const c = setup({ rpc: (fn) => (fn === 'admin_update_user' ? { data: null, error: { message: 'AUTO_REBAIXAMENTO' } } : undefined) })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Souza' }))
    await userEvent.click(screen.getByLabelText('Usuário ativo'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Você não pode desativar ou rebaixar a si mesmo.')).toBeInTheDocument()
    expect(c.rpc).toHaveBeenCalledWith('admin_update_user', { p_user_id: 'u1', p_role: 'admin', p_is_active: false, p_overrides: null })
  })

  it('ULTIMO_ADMIN exibe a mensagem de último administrador', async () => {
    setup({ rpc: (fn) => (fn === 'admin_update_user' ? { data: null, error: { message: 'ULTIMO_ADMIN' } } : undefined) })
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Ana Souza' }))
    await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'atendimento')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('É preciso manter ao menos um administrador ativo.')).toBeInTheDocument()
  })

  it('salvar com sucesso fecha o formulário e recarrega a lista', async () => {
    const c = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Bia Lima' }))
    await userEvent.click(screen.getByLabelText('Usuário ativo'))
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull())
    expect(c.rpc).toHaveBeenCalledWith('admin_update_user', { p_user_id: 'u2', p_role: 'atendimento', p_is_active: true, p_overrides: null })
    expect(c.queries.filter((q) => q.table === 'app_user').length).toBeGreaterThanOrEqual(2)
  })

  it('novo usuário chama a função admin-users e mostra erro 409 em pt-BR', async () => {
    const c = setup({
      invoke: () => ({
        data: null,
        error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ error: 'Já existe um usuário com este e-mail.' }), { status: 409 }) },
      }),
    })
    await userEvent.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Caio Reis')
    await userEvent.type(screen.getByLabelText('E-mail'), 'caio@senzi.com.br')
    await userEvent.selectOptions(screen.getByLabelText('Perfil'), 'atendimento')
    await userEvent.type(screen.getByLabelText('Senha inicial'), 'segredo123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))
    expect(await screen.findByText('Já existe um usuário com este e-mail.')).toBeInTheDocument()
    expect(c.functions.invoke).toHaveBeenCalledWith('admin-users', {
      body: { action: 'create', full_name: 'Caio Reis', email: 'caio@senzi.com.br', role: 'atendimento', password: 'segredo123' },
    })
  })

  it('novo usuário com senha curta não chama a função', async () => {
    const c = setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Novo usuário' }))
    await userEvent.type(screen.getByLabelText('Nome completo'), 'Caio Reis')
    await userEvent.type(screen.getByLabelText('E-mail'), 'caio@senzi.com.br')
    await userEvent.type(screen.getByLabelText('Senha inicial'), '123')
    await userEvent.click(screen.getByRole('button', { name: 'Criar usuário' }))
    expect(await screen.findByText('A senha deve ter ao menos 8 caracteres.')).toBeInTheDocument()
    expect(c.functions.invoke).not.toHaveBeenCalled()
  })
})

describe('Permissões por usuário', () => {
  const overrides = [
    { user_id: 'u2', permission_key: 'cliente.edit', granted: true },
    { user_id: 'u2', permission_key: 'dashboard.view', granted: false },
  ]

  it('mostra o catálogo com estado herdado/concedido/revogado e salva os overrides', async () => {
    const c = setup({ from: (q) => (q.table === 'user_permission_override' ? { data: overrides, error: null } : undefined) })
    await userEvent.click(tab('Permissões'))
    await userEvent.selectOptions(await screen.findByLabelText('Usuário'), 'u2')

    const painel = await screen.findByRole('combobox', { name: 'Ver o painel do dia' })
    await waitFor(() => expect(painel).toHaveValue('revogado'))
    expect(screen.getByRole('combobox', { name: 'Editar cadastro e medidas' })).toHaveValue('concedido')
    expect(screen.getByRole('combobox', { name: 'Ver clientes' })).toHaveValue('herdado')
    // rótulo do herdado diz o que o perfil dá
    const verClientes = screen.getByRole('combobox', { name: 'Ver clientes' })
    expect(within(verClientes).getByRole('option', { name: 'Herdado do perfil (permitido)' })).toBeInTheDocument()
    const agenda = screen.getByRole('combobox', { name: 'Ver a agenda' })
    expect(within(agenda).getByRole('option', { name: 'Herdado do perfil (não permitido)' })).toBeInTheDocument()
    // catálogo completo
    expect(screen.getByRole('combobox', { name: 'Exportar e regenerar dados' })).toBeInTheDocument()

    await userEvent.selectOptions(agenda, 'concedido')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }))
    await waitFor(() =>
      expect(c.rpc).toHaveBeenCalledWith('admin_update_user', {
        p_user_id: 'u2',
        p_role: 'atendimento',
        p_is_active: false,
        p_overrides: { 'cliente.edit': true, 'dashboard.view': false, 'agenda.view': true },
      }),
    )
    expect(await screen.findByText('Permissões salvas.')).toBeInTheDocument()
  })

  it('falha ao carregar os overrides: alerta, Salvar desabilitado e nada é gravado', async () => {
    let failing = true
    const c = setup({
      from: (q) =>
        q.table === 'user_permission_override'
          ? failing
            ? { data: null, error: { message: 'network' } }
            : { data: overrides, error: null }
          : undefined,
    })
    await userEvent.click(tab('Permissões'))
    await userEvent.selectOptions(await screen.findByLabelText('Usuário'), 'u2')
    expect(await screen.findByText('Não foi possível carregar as permissões deste usuário.')).toBeInTheDocument()
    const salvar = screen.getByRole('button', { name: 'Salvar permissões' })
    expect(salvar).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Ver o painel do dia' })).toBeDisabled()
    await userEvent.click(salvar)
    expect(c.rpc).not.toHaveBeenCalledWith('admin_update_user', expect.anything())

    failing = false
    await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Ver o painel do dia' })).toHaveValue('revogado'))
    expect(screen.getByRole('button', { name: 'Salvar permissões' })).toBeEnabled()
    expect(screen.queryByText('Não foi possível carregar as permissões deste usuário.')).toBeNull()
  })

  it('salvar usa perfil e status lidos do banco na hora, não do cache da lista', async () => {
    const c = setup({
      from: (q) =>
        q.table === 'app_user' && q.single ? { data: { id: 'u2', role: 'admin', is_active: true }, error: null } : undefined,
    })
    await userEvent.click(tab('Permissões'))
    await userEvent.selectOptions(await screen.findByLabelText('Usuário'), 'u2')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Ver a agenda' }), 'concedido')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }))
    await waitFor(() =>
      expect(c.rpc).toHaveBeenCalledWith('admin_update_user', {
        p_user_id: 'u2',
        p_role: 'admin',
        p_is_active: true,
        p_overrides: { 'agenda.view': true },
      }),
    )
    const fresh = c.queries.find((q) => q.table === 'app_user' && q.single)!
    expect(fresh.select).toBe('id, role, is_active')
    expect(fresh.eq).toContainEqual(['id', 'u2'])
  })

  it('erro AUTO_REBAIXAMENTO ao salvar as próprias permissões aparece em pt-BR', async () => {
    setup({ rpc: (fn) => (fn === 'admin_update_user' ? { data: null, error: { message: 'AUTO_REBAIXAMENTO' } } : undefined) })
    await userEvent.click(tab('Permissões'))
    await userEvent.selectOptions(await screen.findByLabelText('Usuário'), 'u1')
    await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Gerenciar usuários e permissões' }), 'revogado')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar permissões' }))
    expect(await screen.findByText('Você não pode desativar ou rebaixar a si mesmo.')).toBeInTheDocument()
  })
})

describe('PIN', () => {
  it('salva o PIN com set_my_pin', async () => {
    const c = setup()
    await userEvent.click(tab('PIN'))
    const pin = screen.getByLabelText('Novo PIN')
    expect(pin).toHaveAttribute('inputmode', 'numeric')
    expect(pin).toHaveAttribute('type', 'password')
    await userEvent.type(pin, '1234')
    await userEvent.type(screen.getByLabelText('Confirmar PIN'), '1234')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('PIN salvo.')).toBeInTheDocument()
    expect(c.rpc).toHaveBeenCalledWith('set_my_pin', { p_pin: '1234' })
  })

  it('PINs diferentes não chamam o banco', async () => {
    const c = setup()
    await userEvent.click(tab('PIN'))
    await userEvent.type(screen.getByLabelText('Novo PIN'), '1234')
    await userEvent.type(screen.getByLabelText('Confirmar PIN'), '1235')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('Os PINs não conferem.')).toBeInTheDocument()
    expect(c.rpc).not.toHaveBeenCalledWith('set_my_pin', expect.anything())
  })

  it('PIN_INVALIDO do banco aparece em pt-BR e limpa os dois campos', async () => {
    setup({ rpc: (fn) => (fn === 'set_my_pin' ? { data: null, error: { message: 'PIN_INVALIDO' } } : undefined) })
    await userEvent.click(tab('PIN'))
    await userEvent.type(screen.getByLabelText('Novo PIN'), '12')
    await userEvent.type(screen.getByLabelText('Confirmar PIN'), '12')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('O PIN deve ter de 4 a 6 dígitos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Novo PIN')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar PIN')).toHaveValue('')
  })

  it('falha de rede no set_my_pin também limpa os campos', async () => {
    setup({ rpc: (fn) => { if (fn === 'set_my_pin') throw new Error('network'); return undefined } })
    await userEvent.click(tab('PIN'))
    await userEvent.type(screen.getByLabelText('Novo PIN'), '1234')
    await userEvent.type(screen.getByLabelText('Confirmar PIN'), '1234')
    await userEvent.click(screen.getByRole('button', { name: 'Salvar PIN' }))
    expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
    expect(screen.getByLabelText('Novo PIN')).toHaveValue('')
    expect(screen.getByLabelText('Confirmar PIN')).toHaveValue('')
  })
})

describe('Auditoria', () => {
  const rows = [
    { id: 2, at: '2026-10-23T14:30:00Z', actor_id: 'u1', table_name: 'app_user', row_id: 'u2', action: 'update', before: { is_active: true }, after: { is_active: false } },
    { id: 1, at: '2026-10-22T03:05:00Z', actor_id: null, table_name: 'user_permission_override', row_id: 'u2:cliente.edit', action: 'insert', before: null, after: { granted: true } },
  ]
  const auditFrom: From = (q) => {
    if (q.table === 'audit_log') return { data: rows, error: null, count: 120 }
    if (q.table === 'app_user' && q.in.length) return { data: [{ id: 'u1', full_name: 'Ana Souza' }], error: null }
    return undefined
  }
  const auditQueries = (c: ReturnType<typeof setup>) => c.queries.filter((q) => q.table === 'audit_log')

  it('lista data/hora em Araguaína, ator, tabela e ação em pt-BR', async () => {
    const c = setup({ from: auditFrom })
    await userEvent.click(tab('Auditoria'))
    const r1 = (await screen.findByText('23/10/2026 11:30')).closest('tr')!
    expect(await within(r1).findByText('Ana Souza')).toBeInTheDocument()
    expect(within(r1).getByText('Usuários')).toBeInTheDocument()
    expect(within(r1).getByText('alteração')).toBeInTheDocument()
    const r2 = screen.getByText('22/10/2026 00:05').closest('tr')!
    expect(within(r2).getByText('Sistema')).toBeInTheDocument()
    expect(within(r2).getByText('inserção')).toBeInTheDocument()
    expect(within(r2).getByText('Permissões por usuário')).toBeInTheDocument()

    const q = auditQueries(c).at(-1)!
    expect(q.select).not.toMatch(/\*/)
    expect(q.range).toEqual([0, 49])
    expect(q.order[0]?.[0]).toBe('at')
    const actorQ = c.queries.find((x) => x.table === 'app_user' && x.in.length)!
    expect(actorQ.in[0]).toEqual(['id', ['u1']])
    expect(actorQ.select).toBe('id, full_name')
  })

  it('filtra por tabela e pagina de 50 em 50', async () => {
    const c = setup({ from: auditFrom })
    await userEvent.click(tab('Auditoria'))
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Próxima' }))
    expect(await screen.findByText('Página 2 de 3')).toBeInTheDocument()
    expect(auditQueries(c).at(-1)!.range).toEqual([50, 99])

    await userEvent.selectOptions(screen.getByLabelText('Tabela'), 'app_user')
    expect(await screen.findByText('Página 1 de 3')).toBeInTheDocument()
    const last = auditQueries(c).at(-1)!
    expect(last.eq).toContainEqual(['table_name', 'app_user'])
    expect(last.range).toEqual([0, 49])
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
  })

  it('expande antes/depois em JSON', async () => {
    setup({ from: auditFrom })
    await userEvent.click(tab('Auditoria'))
    const r1 = (await screen.findByText('23/10/2026 11:30')).closest('tr')!
    await userEvent.click(within(r1).getByText('Ver detalhes'))
    expect(within(r1).getByText(/"is_active": false/)).toBeInTheDocument()
  })
})

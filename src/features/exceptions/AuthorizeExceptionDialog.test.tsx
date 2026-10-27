import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSupabase, type FakeResult } from '@/test/fakeSupabase'
import { AuthorizeExceptionDialog } from './AuthorizeExceptionDialog'

const sbMock = vi.hoisted(() => ({ getSupabase: vi.fn() }))
vi.mock('@/lib/supabase', () => sbMock)

const ADMINS = [
  { id: 'a1', full_name: 'Ana Souza', email: 'ana@senzi.com.br' },
  { id: 'a2', full_name: 'Carla Dias', email: 'carla@senzi.com.br' },
]

function setup(authorize: () => FakeResult, maxAmount?: number) {
  const client = fakeSupabase({
    rpc: (fn) => (fn === 'list_active_admins' ? { data: ADMINS, error: null } : authorize()),
  })
  sbMock.getSupabase.mockReturnValue(client)
  const onAuthorized = vi.fn()
  const onCancel = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <AuthorizeExceptionDialog kind="retirada_com_saldo" refType="reserva" refId="r-1" maxAmount={maxAmount} onAuthorized={onAuthorized} onCancel={onCancel} />
    </QueryClientProvider>,
  )
  return { client, onAuthorized, onCancel }
}

async function fill(reason = 'Cliente antiga, paga na devolução') {
  await screen.findByRole('option', { name: 'Carla Dias (carla@senzi.com.br)' })
  await userEvent.selectOptions(screen.getByLabelText('Administrador'), 'carla@senzi.com.br')
  await userEvent.type(screen.getByLabelText('PIN'), '4321')
  if (reason) await userEvent.type(screen.getByLabelText('Motivo'), reason)
  await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }))
}

beforeEach(() => vi.clearAllMocks())

describe('AuthorizeExceptionDialog', () => {
  it('é um diálogo acessível com o PIN mascarado e numérico', async () => {
    setup(() => ({ data: { ok: true, id: 'x' }, error: null }))
    expect(screen.getByRole('dialog', { name: 'Autorizar exceção' })).toBeInTheDocument()
    expect(screen.getByText('Retirada com saldo em aberto')).toBeInTheDocument()
    const pin = screen.getByLabelText('PIN')
    expect(pin).toHaveAttribute('type', 'password')
    expect(pin).toHaveAttribute('inputmode', 'numeric')
    expect(await screen.findByRole('option', { name: 'Carla Dias (carla@senzi.com.br)' })).toBeInTheDocument()
  })

  it('sucesso chama onAuthorized com o id e envia os parâmetros certos', async () => {
    const { client, onAuthorized } = setup(() => ({ data: { ok: true, id: 'auth-9' }, error: null }))
    await fill()
    await vi.waitFor(() => expect(onAuthorized).toHaveBeenCalledWith('auth-9'))
    await vi.waitFor(() => expect(screen.getByLabelText('PIN')).toHaveValue(''))
    expect(client.rpc).toHaveBeenCalledWith('authorize_exception', {
      p_admin_email: 'carla@senzi.com.br',
      p_pin: '4321',
      p_kind: 'retirada_com_saldo',
      p_reason: 'Cliente antiga, paga na devolução',
      p_ref_type: 'reserva',
      p_ref_id: 'r-1',
      p_max_amount: null,
    })
  })

  it('envia o valor que a exceção cobre (maxAmount)', async () => {
    const { client, onAuthorized } = setup(() => ({ data: { ok: true, id: 'auth-10' }, error: null }), 320.5)
    await fill()
    await vi.waitFor(() => expect(onAuthorized).toHaveBeenCalledWith('auth-10'))
    expect(client.rpc).toHaveBeenCalledWith('authorize_exception', expect.objectContaining({ p_max_amount: 320.5 }))
  })

  it('AUTORIZACAO_INVALIDA (retornado) → Administrador ou PIN inválido', async () => {
    const { onAuthorized } = setup(() => ({ data: { ok: false, error: 'AUTORIZACAO_INVALIDA' }, error: null }))
    await fill()
    expect(await screen.findByText('Administrador ou PIN inválido')).toBeInTheDocument()
    expect(onAuthorized).not.toHaveBeenCalled()
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('PIN_BLOQUEADO (retornado) → bloqueado, aguardar ou a administradora redefinir', async () => {
    setup(() => ({ data: { ok: false, error: 'PIN_BLOQUEADO' }, error: null }))
    await fill()
    expect(
      await screen.findByText('PIN bloqueado por muitas tentativas. Tente de novo em 15 minutos; se continuar bloqueado, a administradora precisa redefinir o PIN.'),
    ).toBeInTheDocument()
  })

  it('MOTIVO_OBRIGATORIO (exceção do banco) → Informe o motivo', async () => {
    setup(() => ({ data: null, error: { message: 'MOTIVO_OBRIGATORIO' } }))
    await fill('x')
    expect(await screen.findByText('Informe o motivo')).toBeInTheDocument()
  })

  it('erro lançado pela RPC também limpa o PIN', async () => {
    setup(() => ({ data: null, error: { message: 'SEM_PERMISSAO' } }))
    await fill()
    expect(await screen.findByText('Você não tem permissão para esta ação.')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('falha de rede limpa o PIN e mostra mensagem genérica', async () => {
    setup(() => {
      throw new Error('network')
    })
    await fill()
    expect(await screen.findByText('Algo deu errado. Tente novamente.')).toBeInTheDocument()
    expect(screen.getByLabelText('PIN')).toHaveValue('')
  })

  it('motivo em branco é barrado antes de chamar o banco', async () => {
    const { client } = setup(() => ({ data: { ok: true, id: 'x' }, error: null }))
    await fill('')
    expect(await screen.findByText('Informe o motivo')).toBeInTheDocument()
    expect(client.rpc).not.toHaveBeenCalledWith('authorize_exception', expect.anything())
  })

  it('Cancelar chama onCancel', async () => {
    const { onCancel } = setup(() => ({ data: null, error: null }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(onCancel).toHaveBeenCalled()
  })
})

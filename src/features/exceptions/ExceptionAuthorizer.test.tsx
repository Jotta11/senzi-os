import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import { createMockSource } from '@/data/mockSource'
import { AuthorizeExceptionDialog } from './AuthorizeExceptionDialog'
import { ExceptionAuthorizerProvider, sourceAuthorizer } from './ExceptionAuthorizer'

function setup() {
  const src = createMockSource({ latencyMs: 0, today: '2026-10-24' })
  const onAuthorized = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ExceptionAuthorizerProvider value={sourceAuthorizer(src, 'PIN de demonstração: 1234')}>
        <AuthorizeExceptionDialog kind="dispensa_sinal_minimo" refType="reserva" refId="r-1" onAuthorized={onAuthorized} />
      </ExceptionAuthorizerProvider>
    </QueryClientProvider>,
  )
  return { onAuthorized }
}

async function fill(pin: string) {
  await screen.findByRole('option', { name: 'Júlia Senzi (julia@senzi.com.br)' })
  await userEvent.selectOptions(screen.getByLabelText('Administrador'), 'julia@senzi.com.br')
  await userEvent.type(screen.getByLabelText('PIN'), pin)
  await userEvent.type(screen.getByLabelText('Motivo'), 'Cliente antiga')
  await userEvent.click(screen.getByRole('button', { name: 'Autorizar' }))
}

describe('ExceptionAuthorizer (prévia em memória)', () => {
  it('mostra a dica do PIN de demonstração e autoriza com Júlia Senzi / 1234', async () => {
    const { onAuthorized } = setup()
    expect(screen.getByText('PIN de demonstração: 1234')).toBeInTheDocument()
    await fill('1234')
    await vi.waitFor(() => expect(onAuthorized).toHaveBeenCalledWith(expect.stringMatching(/^exc-/)))
  })

  it('PIN errado → Administrador ou PIN inválido', async () => {
    const { onAuthorized } = setup()
    await fill('9999')
    expect(await screen.findByText('Administrador ou PIN inválido')).toBeInTheDocument()
    expect(onAuthorized).not.toHaveBeenCalled()
  })
})

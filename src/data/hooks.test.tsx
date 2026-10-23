import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { errorMessage } from '@/lib/errorMessages'
import { useCreateCustomer, useCustomer, useCustomers, useGarment, useRecommendations, useSetFavorite } from './hooks'
import { createMockSource } from './mockSource'
import { DataSourceProvider } from './source'

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const source = createMockSource({ latencyMs: 0, today: '2026-10-23' })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <DataSourceProvider source={source}>{children}</DataSourceProvider>
    </QueryClientProvider>
  )
}

describe('hooks de dados', () => {
  it('criar cliente atualiza a lista; erro traz código com mensagem pt-BR', async () => {
    const { result } = renderHook(() => ({ list: useCustomers('', 'nome', { limit: 100, offset: 0 }), create: useCreateCustomer() }), { wrapper: wrapper() })
    await waitFor(() => expect(result.current.list.data?.total).toBe(34))
    await act(() => result.current.create.mutateAsync({ fullName: 'Helena Prado', phone: '63991112233', birthDate: '1990-05-10', cpf: '12345678909' }))
    await waitFor(() => expect(result.current.list.data?.total).toBe(35))
    await act(async () => {
      await expect(result.current.create.mutateAsync({ fullName: 'Outra', phone: '63991112233', birthDate: '1990-05-10', cpf: '12345678909' })).rejects.toMatchObject({ code: 'CPF_DUPLICADO', field: 'cpf' })
    })
    await waitFor(() => expect(errorMessage(result.current.create.error)).toBe('Já existe uma cliente com este CPF.'))
  })

  it('favoritar atualiza a ficha e as sugestões; id inexistente → null', async () => {
    const { result } = renderHook(
      () => ({ c: useCustomer('cl-0001'), recs: useRecommendations('cl-0001'), fav: useSetFavorite('cl-0001'), none: useGarment('nao-existe') }),
      { wrapper: wrapper() },
    )
    await waitFor(() => expect(result.current.recs.data?.length).toBeGreaterThan(0))
    const first = result.current.recs.data![0]!.garment.id
    await act(() => result.current.fav.mutateAsync({ garmentId: first, on: true }))
    await waitFor(() => expect(result.current.c.data?.favorites.map((f) => f.garmentId)).toContain(first))
    await waitFor(() => expect(result.current.recs.data!.map((r) => r.garment.id)).not.toContain(first))
    await waitFor(() => expect(result.current.none.isSuccess).toBe(true))
    expect(result.current.none.data).toBeNull()
  })
})

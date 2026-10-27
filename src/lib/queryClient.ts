import { QueryClient } from '@tanstack/react-query'
import { SourceError } from '@/data/types'

/** Tentativas extras para falhas de rede (a primeira chamada não conta). */
const NETWORK_RETRIES = 2

/**
 * Repete só o que pode dar certo na próxima vez: falha de rede (o `fetch` não chegou ao servidor) ou resposta sem
 * código (ex.: 502 com página HTML). Não repete `SourceError` (regra de negócio, `SEM_PERMISSAO`, `NAO_ENCONTRADO`…)
 * nem erro com código do PostgREST/Postgres (`PGRST…`, `42501`…): o servidor respondeu e a resposta não vai mudar.
 */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= NETWORK_RETRIES) return false
  if (error instanceof SourceError) return false
  const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code: unknown }).code : undefined
  return !(typeof code === 'string' && code !== '')
}

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: shouldRetryQuery } },
})

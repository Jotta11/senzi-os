import { describe, expect, it } from 'vitest'
import { fromDbError } from '@/data/supabase/acervo'
import { SourceError } from '@/data/types'
import { shouldRetryQuery } from './queryClient'

describe('shouldRetryQuery', () => {
  it('não repete SourceError (regra de negócio nem SEM_PERMISSAO)', () => {
    expect(shouldRetryQuery(0, new SourceError('SEM_PERMISSAO'))).toBe(false)
    expect(shouldRetryQuery(0, fromDbError({ message: 'NAO_ENCONTRADO', details: '', hint: '', code: 'P0001' } as never))).toBe(false)
  })

  it('não repete erro com código do servidor (PostgREST/Postgres)', () => {
    expect(shouldRetryQuery(0, fromDbError({ message: 'permission denied for function x', details: '', hint: '', code: '42501' } as never))).toBe(false)
    expect(shouldRetryQuery(0, fromDbError({ message: 'Could not find the function', details: '', hint: '', code: 'PGRST202' } as never))).toBe(false)
  })

  it('repete falha de rede (código vazio) até 2 vezes', () => {
    const net = fromDbError({ message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' } as never)
    expect(shouldRetryQuery(0, net)).toBe(true)
    expect(shouldRetryQuery(1, net)).toBe(true)
    expect(shouldRetryQuery(2, net)).toBe(false)
    expect(shouldRetryQuery(0, new TypeError('Failed to fetch'))).toBe(true)
  })
})

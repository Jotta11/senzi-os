import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { msUntilStoreMidnight, useToday } from './useToday'

afterEach(() => vi.useRealTimers())

describe('useToday', () => {
  it('conta até a meia-noite do fuso da loja (UTC−3)', () => {
    // 23:00 em Araguaína = 02:00 UTC do dia seguinte → falta 1 h (+1 s de folga).
    expect(msUntilStoreMidnight(new Date('2026-10-25T02:00:00Z'))).toBe(3_600_000 + 1000)
  })

  it('devolve o dia da loja e troca à meia-noite da loja', () => {
    vi.useFakeTimers({ now: new Date('2026-10-25T02:59:59Z') }) // 23:59:59 do dia 24 na loja
    const { result } = renderHook(() => useToday())
    expect(result.current).toBe('2026-10-24')
    act(() => {
      vi.advanceTimersByTime(2_500)
    })
    expect(result.current).toBe('2026-10-25')
  })
})

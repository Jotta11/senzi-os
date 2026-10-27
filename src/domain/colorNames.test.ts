import { describe, expect, it } from 'vitest'
import { colorHexFor } from './colorNames'

describe('colorHexFor', () => {
  it('reconhece o nome mais específico, sem acento e sem diferenciar maiúsculas', () => {
    expect(colorHexFor('Azul royal')).toBe('#2647A8')
    expect(colorHexFor('azul')).toBe('#3A6EA5')
    expect(colorHexFor('Salmão')).toBe('#F2A38A')
    expect(colorHexFor('Off-white')).toBe('#F4EFE6')
  })

  it('nome desconhecido ou vazio → null', () => {
    expect(colorHexFor('')).toBeNull()
    expect(colorHexFor('Estampa floral')).toBeNull()
  })
})

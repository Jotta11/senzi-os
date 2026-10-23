import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { contrastRatio } from './contrast'

const PALETA = {
  cranberry: '#3F1116',
  beige: '#FEEFDC',
  vivo: '#6E2027',
  papel: '#FBF3E8',
  areia: '#E1D1B9',
  tinta: '#1C1A18',
  nevoa: '#6F645B',
  branco: '#FFFFFF',
}

const TONS = ['green', 'wine', 'amber', 'indigo', 'teal', 'ochre', 'stone', 'red'] as const

function lerTokens(): Record<string, string> {
  const css = readFileSync(resolve(__dirname, '../styles/tokens.css'), 'utf8')
  const out: Record<string, string> = {}
  for (const m of css.matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})\b/g)) out[m[1]] = m[2]
  return out
}

describe('contrastRatio', () => {
  it('preto sobre branco ≈ 21', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1)
  })

  it('é simétrico e 1 para cores iguais', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 1)
    expect(contrastRatio('#6E2027', '#6E2027')).toBeCloseTo(1, 5)
  })

  it.each([
    ['Beige/Cranberry', PALETA.beige, PALETA.cranberry, 14.27],
    ['Branco/Vivo', PALETA.branco, PALETA.vivo, 11.06],
    ['Tinta/Papel', PALETA.tinta, PALETA.papel, 15.77],
    ['Tinta/Branco', PALETA.tinta, PALETA.branco, 17.35],
    ['Névoa/Papel', PALETA.nevoa, PALETA.papel, 5.23],
    ['Névoa/Branco', PALETA.nevoa, PALETA.branco, 5.75],
    ['Vivo/Papel', PALETA.vivo, PALETA.papel, 10.05],
  ])('%s ≥ 4.5 (≈ %s)', (_nome, fg, bg, esperado) => {
    const r = contrastRatio(fg, bg)
    expect(r).toBeGreaterThanOrEqual(4.5)
    expect(r).toBeCloseTo(esperado as number, 1)
  })
})

describe('tokens.css', () => {
  const tokens = lerTokens()

  it('declara a paleta exata da marca', () => {
    expect(tokens.cranberry?.toUpperCase()).toBe(PALETA.cranberry)
    expect(tokens.beige?.toUpperCase()).toBe(PALETA.beige)
    expect(tokens.vivo?.toUpperCase()).toBe(PALETA.vivo)
    expect(tokens.papel?.toUpperCase()).toBe(PALETA.papel)
    expect(tokens.areia?.toUpperCase()).toBe(PALETA.areia)
    expect(tokens.tinta?.toUpperCase()).toBe(PALETA.tinta)
    expect(tokens.nevoa?.toUpperCase()).toBe(PALETA.nevoa)
    expect(tokens.surface?.toUpperCase()).toBe(PALETA.branco)
  })

  it.each(TONS)('tom %s: texto ≥ 4.5 sobre o próprio fundo', (tom) => {
    const fg = tokens[`t-${tom}`]
    const bg = tokens[`t-${tom}-bg`]
    expect(fg).toBeDefined()
    expect(bg).toBeDefined()
    expect(tokens[`t-${tom}-line`]).toBeDefined()
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })
})

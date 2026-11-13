import { dataExtenso, extenso, percentExtenso, reaisExtenso } from './extenso'

describe('extenso', () => {
  it.each([
    [0, 'zero'],
    [1, 'um'],
    [16, 'dezesseis'],
    [21, 'vinte e um'],
    [100, 'cem'],
    [101, 'cento e um'],
    [330, 'trezentos e trinta'],
    [1000, 'mil'],
    [1050, 'mil e cinquenta'],
    [1200, 'mil e duzentos'],
    [1250, 'mil duzentos e cinquenta'],
    [21_000, 'vinte e um mil'],
    [1_000_000, 'um milhão'],
  ])('%i → %s', (n, s) => expect(extenso(n)).toBe(s))

  it('reais', () => {
    expect(reaisExtenso(330)).toBe('trezentos e trinta reais')
    expect(reaisExtenso(33)).toBe('trinta e três reais')
    expect(reaisExtenso(1)).toBe('um real')
    expect(reaisExtenso(600)).toBe('seiscentos reais')
    expect(reaisExtenso(0.5)).toBe('cinquenta centavos')
    expect(reaisExtenso(1250.01)).toBe('mil duzentos e cinquenta reais e um centavo')
    expect(reaisExtenso(0)).toBe('zero real')
  })

  it('percentual e data', () => {
    expect(percentExtenso(10)).toBe('10% (dez por cento)')
    expect(percentExtenso(2.5)).toBe('2,5%')
    expect(dataExtenso('2026-11-14')).toBe('14 de novembro de 2026')
  })
})

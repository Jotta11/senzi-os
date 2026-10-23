import { cpfFromBase, isValidCPF } from './cpf'

describe('isValidCPF', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true)
    expect(isValidCPF('52998224725')).toBe(true)
  })
  it('rejeita dígitos iguais, verificador errado e tamanho errado', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false)
    expect(isValidCPF('529.982.247-24')).toBe(false)
    expect(isValidCPF('5299822472')).toBe(false)
    expect(isValidCPF('')).toBe(false)
  })
  it('cpfFromBase completa os verificadores', () => {
    expect(cpfFromBase('529982247')).toBe('52998224725')
    expect(isValidCPF(cpfFromBase('123456789'))).toBe(true)
  })
})

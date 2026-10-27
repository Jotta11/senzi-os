import { ageFrom, brl, dateBR, dateTimeBR, hideCPF, maskCPF, maskPhone, normalize, onlyDigits } from './format'

describe('format', () => {
  it('brl com e sem centavos (espaço comum)', () => {
    expect(brl(890)).toBe('R$ 890,00')
    expect(brl(890, { cents: false })).toBe('R$ 890')
    expect(brl(12500.5)).toBe('R$ 12.500,50')
  })

  it('máscaras de CPF e telefone, inclusive parciais', () => {
    expect(maskCPF('52998224725')).toBe('529.982.247-25')
    expect(maskCPF('529.982.247-25')).toBe('529.982.247-25')
    expect(maskCPF('5299')).toBe('529.9')
    expect(maskPhone('63996124478')).toBe('(63) 99612-4478')
    expect(maskPhone('6332154478')).toBe('(63) 3215-4478')
    expect(maskPhone('639')).toBe('(63) 9')
    expect(hideCPF('52998224725')).toBe('***.982.247-**')
    expect(hideCPF('***982247**')).toBe('***.982.247-**')
    expect(hideCPF('')).toBe('***.***.***-**')
  })

  it('onlyDigits e normalize', () => {
    expect(onlyDigits('(63) 99612-4478')).toBe('63996124478')
    expect(normalize('Verônica')).toBe('veronica')
    expect(normalize('  GÊNOVA ')).toBe('genova')
  })

  it('datas em dd/mm/aaaa no fuso da loja', () => {
    expect(dateBR('2026-10-23')).toBe('23/10/2026')
    // 02:30 UTC ainda é 22/10 em Araguaína (UTC−3)
    expect(dateBR('2026-10-23T02:30:00Z')).toBe('22/10/2026')
    expect(dateTimeBR('2026-10-23T13:05:00Z')).toBe('23/10/2026 10:05')
  })

  it('ageFrom conta aniversário ainda não feito', () => {
    expect(ageFrom('1994-03-21', '2026-10-23')).toBe(32)
    expect(ageFrom('1994-11-02', '2026-10-23')).toBe(31)
    expect(ageFrom('1994-10-23', '2026-10-23')).toBe(32)
  })
})

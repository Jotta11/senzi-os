import { customerIssues, isValidISODate } from './validation'

const ok = { fullName: 'Maria Teste', phone: '63996124478', birthDate: '1990-05-10', cpf: '52998224725' }
const codes = (input: Parameters<typeof customerIssues>[0]) => customerIssues(input, '2026-10-23').map((i) => `${i.code}:${i.field}`)

describe('validação de cliente', () => {
  it('cadastro válido não tem problemas', () => {
    expect(codes(ok)).toEqual([])
  })

  it('datas impossíveis (31/02, 30/02, 31/04, mês 13) são rejeitadas; 29/02 só em ano bissexto', () => {
    for (const d of ['2026-02-31', '2023-02-29', '2001-02-30', '1999-04-31', '1999-13-01', '1999-00-10', '1999-01-00']) {
      expect(isValidISODate(d)).toBe(false)
      expect(codes({ ...ok, birthDate: d })).toEqual(['NASCIMENTO_INVALIDO:birthDate'])
    }
    expect(isValidISODate('2024-02-29')).toBe(true)
    expect(codes({ ...ok, birthDate: '2024-02-29' })).toEqual([])
  })

  it('nascimento no futuro é rejeitado; hoje é aceito', () => {
    expect(codes({ ...ok, birthDate: '2026-10-24' })).toEqual(['NASCIMENTO_INVALIDO:birthDate'])
    expect(codes({ ...ok, birthDate: '2026-10-23' })).toEqual([])
  })

  it('medidas fora da faixa (ou texto inválido) acusam no campo', () => {
    expect(codes({ ...ok, measurement: { bustCm: 88, waistCm: -2, heightCm: Number.NaN, shoulderCm: 999 } })).toEqual([
      'PARAMETRO_INVALIDO:waistCm',
      'PARAMETRO_INVALIDO:heightCm',
      'PARAMETRO_INVALIDO:shoulderCm',
    ])
  })
})

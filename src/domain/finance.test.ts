import { nextRecurrence, payableStatus, receivableStatus } from './finance'

describe('finance — recorrência e status', () => {
  it('mensal mantém o fim do mês: 31/01 → 28/02; com âncora volta ao 31 em março', () => {
    expect(nextRecurrence('2026-01-31', 'mensal')).toBe('2026-02-28')
    expect(nextRecurrence('2026-02-28', 'mensal')).toBe('2026-03-28')
    expect(nextRecurrence('2026-02-28', 'mensal', 31)).toBe('2026-03-31')
    expect(nextRecurrence('2028-01-31', 'mensal')).toBe('2028-02-29')
  })
  it('dezembro vira janeiro; semanal soma 7 dias; anual 29/02 → 28/02; nenhuma → null', () => {
    expect(nextRecurrence('2026-12-15', 'mensal')).toBe('2027-01-15')
    expect(nextRecurrence('2026-12-28', 'semanal')).toBe('2027-01-04')
    expect(nextRecurrence('2028-02-29', 'anual')).toBe('2029-02-28')
    expect(nextRecurrence('2026-01-31', 'nenhuma')).toBeNull()
  })
  it('vencido/vencida só quando em aberto (ou parcial) e antes de hoje', () => {
    const t = '2026-10-24'
    expect(receivableStatus({ status: 'aberto', dueDate: '2026-10-23' }, t)).toBe('vencido')
    expect(receivableStatus({ status: 'parcial', dueDate: '2026-10-23' }, t)).toBe('vencido')
    expect(receivableStatus({ status: 'aberto', dueDate: t }, t)).toBe('aberto')
    expect(receivableStatus({ status: 'pago', dueDate: '2026-01-01' }, t)).toBe('pago')
    expect(receivableStatus({ status: 'cancelado', dueDate: '2026-01-01' }, t)).toBe('cancelado')
    expect(payableStatus({ status: 'aberta', dueDate: '2026-10-23' }, t)).toBe('vencida')
    expect(payableStatus({ status: 'paga', dueDate: '2026-10-23' }, t)).toBe('paga')
  })
})

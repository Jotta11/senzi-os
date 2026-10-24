import { describe, expect, it } from 'vitest'
import { createMockSource } from '@/data/mockSource'
import { messages, waLink } from './whatsapp'

describe('WhatsApp', () => {
  it('waLink monta wa.me com 55 + dígitos e texto codificado', () => {
    expect(waLink('63 99612-4478', 'Olá')).toBe('https://wa.me/5563996124478?text=Ol%C3%A1')
    expect(waLink('+55 (63) 99612-4478', 'Oi')).toBe('https://wa.me/5563996124478?text=Oi')
  })

  it('as 6 mensagens usam o primeiro nome, nunca {link}', async () => {
    const source = createMockSource({ latencyMs: 0, today: '2026-10-24' })
    const rows = (await source.listReservations('rascunhos', { limit: 5, offset: 0 })).items
    const d = (await source.getReservation(rows[0]!.id))!
    const list = messages(d, await source.getSettings(), '2026-10-24')
    expect(list.map((m) => m.key)).toEqual(['contrato', 'confirmacao', 'retirada', 'devolucao', 'atraso', 'saldo'])
    for (const m of list) {
      expect(m.text).not.toMatch(/\{/)
      expect(m.text).not.toContain(['Senzi', 'e'].join(''))
      expect(m.text.startsWith(`Olá, ${d.customer.fullName.split(' ')[0]}!`)).toBe(true)
    }
    expect(list[0]!.text).toContain('O PDF segue em anexo.')
    expect(list[4]!.text).toMatch(/multa diária de 20% por dia de atraso/)
  })
})

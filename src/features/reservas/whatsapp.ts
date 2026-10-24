import type { ReservationDetail, Settings } from '@/data/types'
import { brl, dateBR, phoneDigits, todayISO } from '@/lib/format'
import { firstName } from './reservaFormat'

export type WaKey = 'contrato' | 'confirmacao' | 'retirada' | 'devolucao' | 'atraso' | 'saldo'
export type WaMessage = { key: WaKey; label: string; text: string }

/** `https://wa.me/55{dígitos}?text=…` (envio manual). DDI colado (+55) não duplica. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/55${phoneDigits(phone)}?text=${encodeURIComponent(text)}`
}

const dm = (iso: string) => dateBR(iso).slice(0, 5)

/**
 * As 6 mensagens da spec §5.4 (Decisão 8: sem `{link}`, entra a frase "O PDF segue em anexo."),
 * com saudação pelo primeiro nome da cliente.
 */
export function messages(d: ReservationDetail, settings: Pick<Settings, 'lateFeeDailyPercent'>, today: string = todayISO()): WaMessage[] {
  const n = firstName(d.customer.fullName)
  const ct = d.contract?.number ?? d.code.replace('RS', 'CT')
  const names = d.garments.map((g) => g.name).join(', ')
  const pecas = `${d.items.length} peça(s)`
  const { devido, pago, due } = d.balance
  const pct = d.contract?.terms.lateFeeDailyPercent ?? settings.lateFeeDailyPercent
  return [
    { key: 'contrato', label: 'Cópia do contrato', text: `Olá, ${n}! Segue a cópia do contrato ${ct} da sua reserva na Senzi. O PDF segue em anexo.` },
    {
      key: 'confirmacao',
      label: 'Confirmação da reserva',
      text: `Olá, ${n}! Sua reserva ${d.code} está confirmada. ${pecas}: ${names}. Retirada ${dateBR(d.pickupDate)}, devolução ${dateBR(d.returnDueDate)} até as 18h. Valor total ${brl(devido)}; pago ${brl(pago)}; saldo ${brl(due)} na retirada. O PDF segue em anexo.`,
    },
    {
      key: 'retirada',
      label: 'Lembrete de retirada',
      text: `Olá, ${n}! Lembrando que sua retirada na Senzi é amanhã (${dm(d.pickupDate)}).${due > 0 ? ` Falta ${brl(due)} do saldo.` : ''} Qualquer dúvida é só chamar.`,
    },
    {
      key: 'devolucao',
      label: 'Lembrete de devolução',
      text: `Olá, ${n}! Sua devolução na Senzi está prevista para ${d.returnDueDate === today ? 'hoje' : dm(d.returnDueDate)} até as 18h.`,
    },
    {
      key: 'atraso',
      label: 'Devolução em atraso',
      text: `Olá, ${n}! A devolução da reserva ${d.code} estava prevista para ${dm(d.returnDueDate)}. Pode nos avisar quando traz as peças? Conforme o contrato, há multa diária de ${pct}% por dia de atraso.`,
    },
    { key: 'saldo', label: 'Saldo pendente', text: `Olá, ${n}! Falta ${brl(due)} da reserva ${d.code}, com vencimento na retirada (${dm(d.pickupDate)}).` },
  ]
}

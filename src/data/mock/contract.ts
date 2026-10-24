/**
 * Contrato de locação em texto plano (template provisório da spec reservas §5.1, com "Senzi Club").
 * Usado pelo mundo fictício (contratos do cenário) e pela fonte em memória (gerar/regerar no rascunho).
 */
import { minSignal, round2 } from '@/domain/money'
import { brl, dateBR, maskCPF, maskPhone } from '@/lib/format'
import type { World } from '../fixture/world'
import type { Reservation } from '../types'

const COL = 40

/** Corpo do contrato da reserva. `date` = data do "Local e data" (padrão: geração do contrato ou hoje). */
export function renderContract(world: World, r: Reservation, date?: string): string {
  const c = world.customers.find((x) => x.id === r.customerId)
  const name = c?.fullName ?? '—'
  const cpf = c?.cpf ? ` — CPF ${maskCPF(c.cpf)}` : ''
  const phone = c?.phone ? maskPhone(c.phone) : '—'
  const email = c?.email ? ` · ${c.email}` : ''
  const garments = r.items.map((i) => ({ item: i, g: world.garments.find((x) => x.id === i.garmentId) }))
  const lines = garments.map(({ item, g }) => `• ${g?.code ?? '—'} — ${g?.name ?? 'Peça'} (${g?.colorPrimary ?? '—'}, tam. ${g?.labelSize ?? '—'}) — ${brl(item.grossAmount)}`)
  const reference = round2(garments.reduce((s, { item, g }) => s + (g?.retailReference || item.unitPrice * 4), 0))
  const paid = r.payments.filter((p) => p.state === 'pago' && (p.kind === 'sinal' || p.kind === 'integral')).reduce((s, p) => s + p.amount, 0)
  const sinal = paid > 0 ? round2(paid) : minSignal(r.totalNet, world.settings.minSignalPercent)
  const pct = r.contract?.terms.lateFeeDailyPercent ?? world.settings.lateFeeDailyPercent
  const when = date ?? r.contract?.generatedAt.slice(0, 10) ?? world.today
  const number = r.contract?.number || r.code.replace('RS', 'CT')

  return [
    `CONTRATO DE LOCAÇÃO DE VESTUÁRIO Nº ${number}`,
    '',
    'LOCADORA: Senzi Club — locação de vestuário feminino.',
    `LOCATÁRIA: ${name}${cpf}`,
    `Telefone: ${phone}${email}`,
    '',
    '1. OBJETO',
    'A LOCADORA cede à LOCATÁRIA, a título de locação temporária, a(s) peça(s):',
    ...lines,
    '',
    `Valor de referência do acervo cedido: ${brl(reference)}.`,
    '',
    '2. PRAZO',
    `Retirada: ${dateBR(r.pickupDate)}`,
    `Evento: ${r.eventDate ? dateBR(r.eventDate) : '—'}${r.eventType ? ` — ${r.eventType}` : ''}`,
    `Devolução prevista: ${dateBR(r.returnDueDate)} até as 18h.`,
    '',
    '3. VALORES',
    `Locação: ${brl(r.totalGross)}`,
    `Desconto: ${brl(r.discount)}`,
    `Total: ${brl(r.totalNet)}`,
    `Caução: ${r.depositAmount > 0 ? brl(r.depositAmount) : 'dispensada'}`,
    `Sinal: ${brl(sinal)} · Saldo: ${brl(Math.max(0, round2(r.totalNet - sinal)))} até a retirada.`,
    '',
    '4. RESPONSABILIDADES DA LOCATÁRIA',
    '4.1 Utilizar a peça exclusivamente no evento indicado, zelando por sua conservação.',
    '4.2 Não lavar, passar, tingir, cortar ou submeter a peça a qualquer processo de',
    '    higienização por conta própria. A higienização é realizada pela LOCADORA.',
    '4.3 Não ceder, sublocar ou emprestar a peça a terceiros.',
    '4.4 Comunicar imediatamente qualquer dano ocorrido durante o uso.',
    '',
    '5. ATRASO NA DEVOLUÇÃO',
    `O atraso implica multa diária de ${pct}% sobre o valor da locação,`,
    'por dia corrido de atraso, sem prejuízo da responsabilidade por prejuízos causados',
    'a reservas subsequentes da mesma peça.',
    '',
    '6. DANOS',
    '6.1 Desgaste natural de uso não gera cobrança.',
    '6.2 Manchas e danos recuperáveis: a LOCATÁRIA arca com o custo do reparo, mediante',
    '    orçamento apresentado pela LOCADORA.',
    '6.3 Dano irrecuperável ou extravio: a LOCATÁRIA arca com o valor de reposição da',
    '    peça, correspondente ao seu valor de referência.',
    '',
    '7. CANCELAMENTO',
    '7.1 Até 15 dias antes da retirada: devolução integral dos valores pagos.',
    '7.2 Entre 14 e 7 dias: retenção de 30% do valor da locação.',
    '7.3 A menos de 7 dias: retenção de 50% do valor da locação.',
    '7.4 Não comparecimento (no-show): retenção integral.',
    '',
    '8. PROVA E AJUSTES',
    'Ajustes de barra e pences, quando possíveis, são realizados pela LOCADORA sem custo',
    'adicional e são desfeitos após a devolução. Alterações irreversíveis não são permitidas.',
    '',
    `Local e data: ______________________, ${dateBR(when)}`,
    '',
    '',
    `${'_'.repeat(31).padEnd(COL - 1)}${'_'.repeat(31)}`,
    `${name.padEnd(COL)}Senzi Club`,
    `${'LOCATÁRIA'.padEnd(COL)}LOCADORA`,
  ].join('\n')
}

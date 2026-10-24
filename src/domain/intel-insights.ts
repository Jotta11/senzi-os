/**
 * Os 11 insights da Inteligência ("Leitura do período"), na ordem de geração e com os textos da spec
 * dashboard §3.3. `html` só usa `<b>`; `ref` = id do card de origem; #4 e #5 exigem `acervo.cost`.
 */
import type { IntelInsight, IntelReport } from '@/data/types'
import { brl } from '@/lib/format'
import type { IntelBase, customerTotals } from './intel-base'

const pct = (x: number) => `${Math.round(x * 100)}%`
const pct1 = (x: number) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
const num1 = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const brl0 = (n: number) => brl(n, { cents: false })
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
/** Até 4 códigos e "…" se houver mais. */
const codes = (cs: string[]) => cs.slice(0, 4).join(', ') + (cs.length > 4 ? '…' : '')

export function intelInsights(r: Omit<IntelReport, 'insights'>, base: IntelBase, totals: ReturnType<typeof customerTotals>): IntelInsight[] {
  const out: IntelInsight[] = []
  const add = (i: IntelInsight) => out.push(i)
  const N = r.kpis.rentals
  const totalAcervo = base.acervo.length

  // 1. tamanho com mais locações
  const top = r.sizes[0]
  if (N > 0 && top) {
    const inSize = base.acervo.filter((g) => g.sizeEquiv === top.size).length
    add({
      id: 'tamanho-top',
      tone: 'green',
      icon: 'subir',
      group: 'comprar',
      ref: 'card-tamanhos',
      html: `Tamanho <b>${top.size}</b> concentra <b>${pct(top.rentals / N)}</b> das locações do período (${top.rentals} de ${N}).`,
      why: `O acervo tem ${plural(inSize, 'peça', 'peças')} nesse tamanho, de ${totalAcervo}. Próximas compras deveriam respeitar essa proporção.`,
    })
  }

  // 2. cores que giram ≥ 2,5× por peça (2 mais locadas)
  for (const c of r.colors.slice(0, 2)) {
    if (c.inStock === 0) {
      add({
        id: 'cor-giro',
        tone: 'amber',
        icon: 'raio',
        group: 'comprar',
        ref: 'card-cores',
        html: `<b>${c.color}</b> gira ${c.rentals}× sem estoque ativo — alta procura com estoque baixo.`,
        why: `${plural(c.rentals, 'locação', 'locações')} e nenhuma peça ativa nessa cor no acervo. Cada nova peça nessa cor tende a alugar sozinha.`,
      })
      continue
    }
    const perPiece = c.rentals / c.inStock
    if (perPiece < 2.5) continue
    add({
      id: 'cor-giro',
      tone: 'amber',
      icon: 'raio',
      group: 'comprar',
      ref: 'card-cores',
      html: `<b>${c.color}</b> gira ${num1(perPiece)}× por peça — alta procura com estoque baixo.`,
      why: `${plural(c.rentals, 'locação', 'locações')} distribuídas em apenas ${plural(c.inStock, 'peça', 'peças')}. Cada nova peça nessa cor tende a alugar sozinha.`,
    })
  }

  // 3. categorias com ocupação acima de 14% (2 maiores)
  for (const c of r.occupancyByCategory.slice(0, 2)) {
    if (c.rate <= 0.14) continue
    add({
      id: 'ocupacao-categoria',
      tone: 'green',
      icon: 'inteligencia',
      group: 'comprar',
      ref: 'card-ocupacao',
      html: `Categoria <b>${c.category}</b> está com <b>${pct(c.rate)}</b> de ocupação nos últimos ${r.period.days} dias.`,
      why: `${c.occupiedDays} dias de peça alugados sobre ${c.garments * r.period.days} dias disponíveis (${plural(c.garments, 'peça', 'peças')}). Faixas: atenção > 14%, falta acervo > 25%.`,
    })
  }

  // 4. peças paradas
  if (r.idleCapital.length > 0) {
    const n = r.idleCapital.length
    const list = [...r.idleCapital].sort((a, b) => a.code.localeCompare(b.code)).map((g) => g.code)
    const capital = r.idleCapital.reduce((s, g) => s + (g.cost ?? 0), 0)
    add({
      id: 'pecas-paradas',
      tone: 'red',
      icon: 'descer',
      group: 'rendimento',
      ref: 'card-capital',
      requires: 'acervo.cost',
      html: `<b>${plural(n, 'peça', 'peças')}</b> sem locação nos últimos ${r.idleAlertDays} dias.`,
      why: `${codes(list)} — ${brl0(capital)} de capital parado. Avaliar redução de preço, reposicionamento na vitrine ou baixa.`,
    })
  }

  // 5. payback (2 primeiras)
  for (const p of r.paidBack.slice(0, 2)) {
    add({
      id: 'payback',
      tone: 'green',
      icon: 'moeda',
      group: 'rendimento',
      ref: 'card-pagas',
      requires: 'acervo.cost',
      html: `<b>${p.code} — ${p.name}</b> recuperou o investimento após ${p.rentalsToPayback} locações.`,
      why: `${brl0(p.revenue)} de receita sobre ${brl0(p.cost)} de custo. A partir daqui, cada locação é margem quase integral.`,
    })
  }

  // 6. recorrência
  if (r.kpis.recurrentCount > 0) {
    const all = totals.reduce((s, t) => s + t.spent, 0)
    add({
      id: 'recorrencia',
      tone: 'green',
      icon: 'clientes',
      group: 'clientes',
      ref: 'card-recorrentes',
      html: `<b>${pct(r.kpis.recurrenceRate)}</b> das clientes que já alugaram voltaram pelo menos uma segunda vez.`,
      why: `${r.kpis.recurrentCount} de ${r.kpis.activeCustomers}. Clientes recorrentes respondem por ${brl0(r.customerRevenue.recurrent)} — ${pct(r.customerRevenue.recurrent / Math.max(1, all))} da receita acumulada.`,
    })
  }

  // 7. muito provada, pouco alugada (até 2)
  for (const g of r.fittedNotRented.slice(0, 2)) {
    const result = g.converted === 0 ? '<b>nenhuma</b> virou locação' : `apenas ${g.converted} virou locação`
    const adj = g.alterations > 0 ? `${g.alterations} clientes precisaram de ajuste. ` : ''
    const note = g.lastNote ? `A equipe registrou: “${g.lastNote.trim().replace(/\.$/, '')}”. ` : ''
    add({
      id: 'prova-sem-conversao',
      tone: 'amber',
      icon: 'descer',
      group: 'provas',
      ref: 'card-encanta',
      html: `<b>${g.code} — ${g.name}</b>: ${g.fittings} provas e ${result} — ${pct(g.rate ?? 0)} de conversão.`,
      why: `Alta experimentação e baixa conversão. ${adj}${note}Revisar caimento, preço, conservação ou posicionamento na arara.`,
    })
  }

  // 8. tamanho de maior pressão (com ≥ 2 peças)
  const hot = r.pressureBySize.find((p) => p.garments >= 2)
  if (hot && hot.pressure > 0) {
    add({
      id: 'pressao-tamanho',
      tone: 'amber',
      icon: 'raio',
      group: 'comprar',
      ref: 'card-pressao-tamanho',
      html: `Tamanho <b>${hot.key}</b> tem a maior pressão do acervo: ${num1(hot.pressure)} procuras por peça.`,
      why: `${hot.rentals} locações e ${hot.fittings} provas distribuídas em ${hot.garments} peças, com ${pct1(hot.occupancy)} de ocupação. Pressão mede procura por peça — não volume absoluto, que só reflete quantas peças existem naquele tamanho.`,
    })
  }

  // 9. quase nunca provadas
  if (r.rarelyFitted.length >= 2) {
    add({
      id: 'pouco-provadas',
      tone: 'stone',
      icon: 'olhoOff',
      group: 'provas',
      ref: 'card-pouco-provadas',
      html: `<b>${plural(r.rarelyFitted.length, 'peça', 'peças')}</b> quase nunca são sequer provadas.`,
      why: `${codes(r.rarelyFitted.map((g) => g.code))} — pouca prova costuma indicar exposição ruim, foto fraca ou posição desfavorável na loja, não falta de demanda. Antes de baixar do acervo, vale testar reposicionamento.`,
    })
  }

  // 10. conversão de prova do período
  const rate = r.kpis.fittingConversion
  if (rate != null) {
    add({
      id: 'taxa-prova',
      tone: rate >= 0.5 ? 'green' : 'amber',
      icon: 'prova',
      group: 'provas',
      ref: 'card-funil',
      html: `<b>${pct(rate)}</b> das provas encerradas no período viraram reserva.`,
      why: `${r.fittingFunnel.converted} conversões em ${r.kpis.closedFittings} provas encerradas. Cada ponto dessa taxa vale mais que um ponto de tráfego: a cliente já está na loja e já vestiu a peça.`,
    })
  }

  // 11. categoria de maior ticket
  const best = r.ticketByCategory[0]
  if (best) {
    add({
      id: 'ticket-categoria',
      tone: 'stone',
      icon: 'tag',
      group: 'negocio',
      ref: 'card-ticket-categoria',
      html: `Maior valor médio por locação: <b>${best.category}</b>, a ${brl0(best.avgTicket)}.`,
      why: `${plural(best.rentals, 'locação', 'locações')} no período. Comparar com o ticket médio geral de ${brl0(r.kpis.avgTicket)} ao decidir a próxima compra.`,
    })
  }
  return out
}

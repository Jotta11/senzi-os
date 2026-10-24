/**
 * Financeiro fictício (spec `operacao-financeiro.md` §2.4 e §2.7): categorias de sistema e livres,
 * compra de cada peça (`aquisicao`), despesas da operação (`operacao`) e a "fixture sugerida" de
 * contas a pagar e receitas avulsas. Parcelas de reserva não ficam aqui: derivam das reservas.
 */
import { addDays } from '@/lib/format'
import type { FinCategory, Payable, Receivable } from '../types'
import { acquiredDaysAgo } from './garments'
import { at, USER } from './kit'
import type { World } from './world'

/** Ids fixos das categorias de sistema (a economia da peça e a Operação dependem deles). */
export const FIN_CAT = {
  locacao: 'fc-locacao',
  aquisicao: 'fc-aquisicao',
  higienizacao: 'fc-higienizacao',
  manutencao: 'fc-manutencao',
  ajuste: 'fc-ajuste',
} as const

const PALETTE = ['#7A2E3A', '#5E6B3C', '#1D4E63', '#B4633F', '#A98BC4', '#C9A961', '#3C3F46', '#C98A99']

const CATEGORIES: [id: string, name: string, type: FinCategory['type'], system: boolean][] = [
  [FIN_CAT.locacao, 'Locação', 'receita', true],
  ['fc-venda', 'Venda de peça', 'receita', false],
  ['fc-outras-receitas', 'Outros', 'receita', false],
  [FIN_CAT.aquisicao, 'Aquisição de acervo', 'despesa', true],
  [FIN_CAT.higienizacao, 'Higienização', 'despesa', true],
  [FIN_CAT.manutencao, 'Manutenção', 'despesa', true],
  [FIN_CAT.ajuste, 'Ajuste', 'despesa', true],
  ['fc-aluguel', 'Aluguel', 'despesa', false],
  ['fc-energia', 'Energia e água', 'despesa', false],
  ['fc-internet', 'Internet e telefone', 'despesa', false],
  ['fc-folha', 'Folha / pró-labore', 'despesa', false],
  ['fc-marketing', 'Marketing', 'despesa', false],
  ['fc-contabilidade', 'Contabilidade', 'despesa', false],
  ['fc-impostos', 'Impostos', 'despesa', false],
  ['fc-embalagens', 'Embalagens e materiais', 'despesa', false],
  ['fc-outras-despesas', 'Outros', 'despesa', false],
]

export function buildFinCategories(): FinCategory[] {
  return CATEGORIES.map(([id, name, type, isSystem], i) => ({ id, name, type, color: PALETTE[i % PALETTE.length]!, isSystem, archived: false }))
}

type PayableSpec = Partial<Payable> & Pick<Payable, 'description' | 'categoryId' | 'amount' | 'dueDate'>

/** Acrescenta uma conta a pagar com os padrões do fixture (manual, aberta, sem recorrência). */
export function addPayable(w: World, spec: PayableSpec): Payable {
  const p: Payable = {
    id: `pg-${String(w.payables.length + 1).padStart(4, '0')}`,
    supplier: null,
    status: 'aberta',
    paidAt: null,
    paidAmount: null,
    method: null,
    recurrence: 'nenhuma',
    recurrenceEnd: null,
    recurrenceParentId: null,
    source: 'manual',
    garmentId: null,
    maintenanceId: null,
    reservationId: null,
    notes: null,
    createdBy: USER.julia.id,
    createdAt: at(spec.dueDate, '09:00'),
    ...spec,
  }
  w.payables.push(p)
  return p
}

/** Despesa automática da Operação (nasce paga, somente leitura). */
export function addOperationExpense(
  w: World,
  e: { date: string; categoryId: string; amount: number; supplier: string; description: string; garmentId: string; maintenanceId: string; reservationId: string | null },
): Payable {
  return addPayable(w, {
    description: e.description,
    supplier: e.supplier,
    categoryId: e.categoryId,
    amount: e.amount,
    dueDate: e.date,
    status: 'paga',
    paidAt: at(e.date, '17:00'),
    paidAmount: e.amount,
    method: 'pix',
    source: 'operacao',
    garmentId: e.garmentId,
    maintenanceId: e.maintenanceId,
    reservationId: e.reservationId,
    createdBy: USER.bruna.id,
    createdAt: at(e.date, '17:00'),
  })
}

const pad = (n: number) => String(n).padStart(2, '0')
/** Dia `day` do mês `today + k meses` (último dia do mês quando não existe). */
function monthDay(today: string, k: number, day: number): string {
  const y0 = Number(today.slice(0, 4))
  const m0 = Number(today.slice(5, 7)) - 1 + k
  const y = y0 + Math.floor(m0 / 12)
  const m = ((m0 % 12) + 12) % 12
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
  return `${y}-${pad(m + 1)}-${pad(Math.min(day, last))}`
}

/** Conta recorrente mensal: ocorrências passadas pagas (6 meses) + a próxima em aberto. */
function monthly(w: World, desc: string, supplier: string, categoryId: string, amount: number, day: number) {
  const today = w.today
  let parent: string | null = null
  for (let k = -6; k <= 1; k++) {
    const due = monthDay(today, k, day)
    const paid = due <= today
    const p = addPayable(w, {
      description: desc,
      supplier,
      categoryId,
      amount,
      dueDate: due,
      recurrence: 'mensal',
      recurrenceParentId: parent,
      status: paid ? 'paga' : 'aberta',
      paidAt: paid ? at(due, '10:00') : null,
      paidAmount: paid ? amount : null,
      method: paid ? 'transferencia' : null,
    })
    parent ??= p.id
    if (!paid) break
  }
}

/** Categorias, aquisições, despesas fixas e avulsas. Despesas da operação entram pelo histórico e pela operação. */
export function buildFinance(w: World): void {
  w.finCategories = buildFinCategories()
  w.garments.forEach((g, idx) => {
    if (!g.acquisitionCost) return
    const d = addDays(w.today, -acquiredDaysAgo(idx))
    addPayable(w, {
      description: `Compra da peça — ${g.name}`,
      supplier: 'Aquisição de acervo',
      categoryId: FIN_CAT.aquisicao,
      amount: g.acquisitionCost,
      dueDate: d,
      status: 'paga',
      paidAt: at(d, '10:00'),
      paidAmount: g.acquisitionCost,
      method: 'transferencia',
      source: 'aquisicao',
      garmentId: g.id,
      createdAt: at(d, '10:00'),
    })
  })

  monthly(w, 'Aluguel da loja', 'Imobiliária Capital', 'fc-aluguel', 3200, 5)
  monthly(w, 'Energia elétrica', 'Energisa', 'fc-energia', 380, 12)
  monthly(w, 'Internet da loja', 'Vivo Fibra', 'fc-internet', 140, 15)
  monthly(w, 'Honorários do contador', 'Contabilidade Tocantins', 'fc-contabilidade', 450, 10)

  const D = (n: number) => addDays(w.today, n)
  addPayable(w, { description: 'Cabides e capas protetoras', supplier: 'Embalagens Palmas', categoryId: 'fc-embalagens', amount: 260, dueDate: D(-3) })
  addPayable(w, {
    description: 'DAS — Simples Nacional',
    supplier: 'Receita Federal',
    categoryId: 'fc-impostos',
    amount: 890,
    dueDate: w.today,
    status: 'paga',
    paidAt: at(w.today, '09:40'),
    paidAmount: 890,
    method: 'pix',
  })
  addPayable(w, { description: 'Manutenção do ar-condicionado', supplier: 'Clima Norte', categoryId: 'fc-outras-despesas', amount: 350, dueDate: D(5) })
  addPayable(w, { description: 'Impulsionamento no Instagram — coleção de verão', supplier: 'Meta', categoryId: 'fc-marketing', amount: 600, dueDate: D(12) })

  const rec = (r: Omit<Receivable, 'id' | 'source' | 'kind' | 'reservationId' | 'reservationCode' | 'customerId' | 'customerName' | 'isCustody'> & { customerId?: string | null; customerName?: string | null }): void => {
    w.receivables.push({
      id: `rc-${String(w.receivables.length + 1).padStart(4, '0')}`,
      source: 'avulso',
      kind: 'avulso',
      reservationId: null,
      reservationCode: null,
      isCustody: false,
      customerId: r.customerId ?? null,
      customerName: r.customerName ?? null,
      ...r,
    })
  }
  rec({ description: 'Venda de clutch do mostruário', categoryId: 'fc-venda', payerName: 'Cliente de passagem', amount: 120, paidAmount: 120, dueDate: D(-8), status: 'pago', receivedAt: at(D(-8), '15:20'), method: 'pix', notes: null })
  rec({ description: 'Aluguel do espaço para ensaio fotográfico', categoryId: 'fc-outras-receitas', payerName: 'Estúdio Luz Norte', amount: 300, paidAmount: 0, dueDate: D(6), status: 'aberto', receivedAt: null, method: null, notes: 'Ensaio de sábado à tarde.' })
  rec({ description: 'Consultoria de styling — evento corporativo', categoryId: 'fc-outras-receitas', payerName: 'Grupo Araguaia', amount: 250, paidAmount: 0, dueDate: D(-4), status: 'aberto', receivedAt: null, method: null, notes: null })
}

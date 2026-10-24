/**
 * Rótulos e tons das demais telas (agenda, provas, reservas, operação, financeiro, painel).
 * Valores verbatim das specs em `docs/superpowers/specs/telas/`. Tom sempre acompanha o rótulo de texto.
 */
import type { IconName, Tone } from '@/ui'
import type { AlertSeverity, AppointmentKind, AppointmentState, Channel, ExceptionKind, FitOutcome, FittingState, InspectionResult, ItemState, MaintenanceKind, MaintenanceState, PayableStatus, PaymentKind, PaymentMethod, PaymentState, PayStatus, ReceivableStatus, Recurrence, ReservationState, Severity } from './types'

type LT = { label: string; tone: Tone }

export const AG_KIND: Record<AppointmentKind, LT> = {
  prova: { label: 'Prova', tone: 'indigo' },
  retirada: { label: 'Retirada', tone: 'wine' },
  devolucao: { label: 'Devolução', tone: 'teal' },
  atendimento: { label: 'Atendimento', tone: 'stone' },
  evento: { label: 'Evento', tone: 'amber' },
  servico: { label: 'Serviço', tone: 'ochre' },
  /** Visual próprio (borda tracejada + ícone) na tela. */
  interno: { label: 'Interno', tone: 'stone' },
}

export const APPOINTMENT_STATE: Record<AppointmentState, LT> = {
  agendado: { label: 'Agendado', tone: 'indigo' },
  concluido: { label: 'Concluído', tone: 'green' },
  cancelado: { label: 'Cancelado', tone: 'stone' },
  no_show: { label: 'No-show', tone: 'red' },
}

export const FITTING_STATE: Record<FittingState, LT> = {
  agendada: { label: 'Agendada', tone: 'indigo' },
  em_curso: { label: 'Em curso', tone: 'amber' },
  concluida: { label: 'Concluída', tone: 'teal' },
  convertida: { label: 'Convertida', tone: 'green' },
  perdida: { label: 'Sem conversão', tone: 'stone' },
  no_show: { label: 'No-show', tone: 'red' },
}

/** `positive`: `true` aprovada, `false` descartada/ressalva, `null` neutro (estado inicial). */
export const FIT_OUTCOME: Record<FitOutcome, LT & { icon: IconName; positive: boolean | null }> = {
  favorita: { label: 'Favorita', tone: 'wine', icon: 'coracao', positive: true },
  serviu: { label: 'Serviu', tone: 'green', icon: 'check', positive: true },
  gostou: { label: 'Gostou', tone: 'green', icon: 'check', positive: true },
  precisa_ajuste: { label: 'Precisa ajuste', tone: 'ochre', icon: 'costura', positive: true },
  apertada: { label: 'Ficou apertada', tone: 'amber', icon: 'alerta', positive: false },
  larga: { label: 'Ficou larga', tone: 'amber', icon: 'alerta', positive: false },
  nao_gostou: { label: 'Não gostou', tone: 'stone', icon: 'x', positive: false },
  descartada: { label: 'Descartada', tone: 'red', icon: 'x', positive: false },
  nao_provou: { label: 'Não provou', tone: 'stone', icon: 'relogio', positive: null },
}

export const RESERVATION_STATE: Record<ReservationState, LT> = {
  rascunho: { label: 'Rascunho', tone: 'stone' },
  confirmada: { label: 'Confirmada', tone: 'wine' },
  pronta_retirada: { label: 'Pronta para retirada', tone: 'wine' },
  retirada: { label: 'Retirada', tone: 'indigo' },
  em_uso: { label: 'Em uso', tone: 'indigo' },
  aguardando_devolucao: { label: 'Aguardando devolução', tone: 'amber' },
  devolvida: { label: 'Devolvida', tone: 'teal' },
  em_inspecao: { label: 'Em inspeção', tone: 'teal' },
  finalizada: { label: 'Finalizada', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'stone' },
  no_show: { label: 'No-show', tone: 'red' },
}

export const ITEM_STATE: Record<ItemState, LT> = {
  pendente: { label: 'A retirar', tone: 'wine' },
  retirado: { label: 'Com a cliente', tone: 'indigo' },
  nao_entregue: { label: 'Não entregue', tone: 'stone' },
  devolvido: { label: 'Devolvido', tone: 'teal' },
  inspecionado: { label: 'Inspecionado', tone: 'green' },
  cancelado: { label: 'Cancelado', tone: 'stone' },
}

export const PAYMENT_KIND: Record<PaymentKind, string> = {
  sinal: 'Sinal',
  saldo: 'Saldo',
  integral: 'Integral',
  caucao: 'Caução',
  multa: 'Multa por atraso',
  estorno: 'Estorno',
}

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  pix: 'PIX',
  credito: 'Cartão de crédito',
  debito: 'Cartão de débito',
  dinheiro: 'Dinheiro',
  link: 'Link de pagamento',
  transferencia: 'Transferência',
  outro: 'Outros',
}

export const PAYMENT_STATE: Record<PaymentState, LT> = {
  pago: { label: 'Pago', tone: 'green' },
  pendente: { label: 'Pendente', tone: 'amber' },
  parcial: { label: 'Parcial', tone: 'stone' },
  estornado: { label: 'Estornado', tone: 'stone' },
  cancelado: { label: 'Cancelado', tone: 'stone' },
}

export const PAYSTATUS: Record<PayStatus, LT> = {
  nao_pago: { label: 'Não pago', tone: 'red' },
  parcial: { label: 'Parcial', tone: 'amber' },
  pago: { label: 'Pago', tone: 'green' },
}

export const EXCEPTION_KIND: Record<ExceptionKind, string> = {
  retirada_com_saldo: 'Retirada com saldo em aberto',
  desconto_acima_limite: 'Desconto acima do limite',
  dispensa_sinal_minimo: 'Dispensa do sinal mínimo',
}

export const CHANNEL: Record<Channel, string> = { loja: 'Loja', whatsapp: 'WhatsApp', instagram: 'Instagram' }

export const MAINTENANCE_KIND: Record<MaintenanceKind, string> = {
  higienizacao: 'Higienização',
  costura: 'Costura',
  barra: 'Barra',
  ziper: 'Zíper',
  pedraria: 'Pedraria',
  ajuste: 'Ajuste',
  mancha: 'Mancha',
  restauracao: 'Restauração',
  outros: 'Outros',
}

export const MAINTENANCE_STATE: Record<MaintenanceState, LT> = {
  aberta: { label: 'Aberta', tone: 'amber' },
  em_andamento: { label: 'Em andamento', tone: 'indigo' },
  concluida: { label: 'Concluída', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'stone' },
}

export const INSPECTION_RESULT: Record<InspectionResult, LT> = {
  aprovada: { label: 'Aprovada', tone: 'green' },
  ressalva: { label: 'Com ressalva', tone: 'amber' },
  reprovada: { label: 'Reprovada (dano)', tone: 'red' },
  perda: { label: 'Possível perda', tone: 'red' },
}

export const SEVERITY: Record<Severity, string> = { leve: 'leve', media: 'média', grave: 'grave' }

export const RECURRENCE: Record<Recurrence, string> = { nenhuma: 'Não se repete', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' }

/** `vencida` é derivado (aberta com vencimento antes de hoje). */
export const PAYABLE_STATUS: Record<PayableStatus | 'vencida', LT> = {
  aberta: { label: 'Em aberto', tone: 'amber' },
  vencida: { label: 'Vencida', tone: 'red' },
  paga: { label: 'Paga', tone: 'green' },
  cancelada: { label: 'Cancelada', tone: 'stone' },
}

/** `vencido` é derivado. */
export const RECEIVABLE_STATUS: Record<ReceivableStatus | 'vencido', LT> = {
  aberto: { label: 'Em aberto', tone: 'amber' },
  vencido: { label: 'Vencida', tone: 'red' },
  parcial: { label: 'Parcial', tone: 'amber' },
  pago: { label: 'Recebida', tone: 'green' },
  cancelado: { label: 'Cancelada', tone: 'stone' },
}

export const ALERT_SEVERITY: Record<AlertSeverity, LT> = {
  critico: { label: 'Crítico', tone: 'red' },
  atencao: { label: 'Atenção', tone: 'amber' },
  info: { label: 'Info', tone: 'stone' },
}

/** Estados que comprometem a peça (alertas, estatísticas da cliente). */
export const ACTIVE_RESERVATION_STATES: readonly ReservationState[] = ['confirmada', 'pronta_retirada', 'retirada', 'em_uso', 'aguardando_devolucao']
/** Peça na rua (com a cliente): a multa por atraso corre nesses estados. */
export const OUT_RESERVATION_STATES: readonly ReservationState[] = ['retirada', 'em_uso', 'aguardando_devolucao']
/** Sem conta a receber: rascunho ainda não cobra; cancelada e no-show encerram o que estava pendente. */
export const NO_RECEIVABLE_RESERVATION_STATES: readonly ReservationState[] = ['rascunho', 'cancelada', 'no_show']
/** Locações realizadas (receita da peça/cliente, Inteligência). */
export const REALIZED_RESERVATION_STATES: readonly ReservationState[] = ['retirada', 'em_uso', 'aguardando_devolucao', 'devolvida', 'em_inspecao', 'finalizada']
/** Encerradas: não mudam mais (a caução retida já pode voltar à cliente). */
export const CLOSED_RESERVATION_STATES: readonly ReservationState[] = ['finalizada', 'cancelada', 'no_show']

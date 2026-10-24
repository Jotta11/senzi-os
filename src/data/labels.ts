import type { Tone } from '@/ui'
import type { BlockKind, ContactChannel, FabricStretch, FitRuns, GarmentLength, GarmentState, LeadSource, PhotoKind, SizeEquiv, StateGroup } from './types'

/** Rótulo, tom do badge e rótulo curto (cards da galeria) de cada estado — protótipo `SZ.GARMENT_STATE`. */
export const GARMENT_STATE: Record<GarmentState, { label: string; tone: Tone; short: string }> = {
  disponivel: { label: 'Disponível', tone: 'green', short: 'Livre' },
  reservado: { label: 'Reservado', tone: 'wine', short: 'Reserv.' },
  retirado: { label: 'Retirado', tone: 'indigo', short: 'Retir.' },
  em_uso: { label: 'Em uso', tone: 'indigo', short: 'Em uso' },
  aguardando_devolucao: { label: 'Aguardando devolução', tone: 'amber', short: 'Aguard.' },
  higienizacao: { label: 'Higienização', tone: 'teal', short: 'Higien.' },
  inspecao: { label: 'Inspeção', tone: 'teal', short: 'Inspeç.' },
  ajuste: { label: 'Ajuste', tone: 'ochre', short: 'Ajuste' },
  manutencao: { label: 'Manutenção', tone: 'ochre', short: 'Manut.' },
  bloqueado: { label: 'Bloqueado', tone: 'stone', short: 'Bloq.' },
  baixado: { label: 'Baixado do acervo', tone: 'stone', short: 'Baixa' },
}

/** Estados de cada grupo do filtro (sem `todos`, que é qualquer um). */
export const STATE_GROUP_STATES: Record<Exclude<StateGroup, 'todos'>, GarmentState[]> = {
  disponivel: ['disponivel'],
  reservado: ['reservado'],
  em_uso: ['retirado', 'em_uso', 'aguardando_devolucao'],
  ciclo: ['inspecao', 'higienizacao', 'ajuste', 'manutencao'],
  bloqueado: ['bloqueado'],
}

export const STATE_GROUP_LABEL: Record<StateGroup, string> = {
  todos: 'Qualquer estado',
  disponivel: 'Disponível',
  reservado: 'Reservado',
  em_uso: 'Em uso',
  ciclo: 'Em ciclo operacional',
  bloqueado: 'Bloqueado',
}

export const SIZES: SizeEquiv[] = ['PP', 'P', 'M', 'G', 'GG', 'U']

export const LENGTH_LABEL: Record<GarmentLength, string> = { curto: 'Curto', midi: 'Midi', longo: 'Longo' }

export const FIT_RUNS_LABEL: Record<FitRuns, string> = {
  menor: 'Veste menor que a etiqueta',
  fiel: 'Veste fiel à etiqueta',
  maior: 'Veste maior que a etiqueta',
}

export const STRETCH_LABEL: Record<FabricStretch, string> = { nenhum: 'Sem elasticidade', leve: 'Elasticidade leve', alto: 'Elasticidade alta' }

export const PHOTO_KIND_LABEL: Record<PhotoKind, string> = {
  frente: 'Frente',
  costas: 'Costas',
  lateral: 'Lateral',
  detalhe: 'Detalhe',
  editorial: 'Editorial',
  manequim: 'Manequim',
  saida: 'Saída',
  devolucao: 'Devolução',
  dano: 'Dano',
  manutencao: 'Manutenção',
}

export const BLOCK_KIND: Record<BlockKind, { label: string; tone: Tone }> = {
  locacao: { label: 'Locação', tone: 'wine' },
  higienizacao: { label: 'Higienização', tone: 'teal' },
  inspecao: { label: 'Inspeção', tone: 'teal' },
  ajuste: { label: 'Ajuste', tone: 'ochre' },
  manutencao: { label: 'Manutenção', tone: 'ochre' },
  bloqueio_manual: { label: 'Bloqueio manual', tone: 'stone' },
  editorial: { label: 'Editorial', tone: 'indigo' },
}

export const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  indicacao: 'Indicação',
  instagram: 'Instagram',
  passante: 'Passante',
  evento: 'Evento',
  google: 'Google',
  outro: 'Outro',
}

export const CHANNEL_LABEL: Record<ContactChannel, string> = {
  presencial: 'Presencial',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  telefone: 'Telefone',
}

export * from './labels-ops'

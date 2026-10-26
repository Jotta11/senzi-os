import type { AppointmentKind } from '@/data/types'

export type AgendaView = 'dia' | 'semana' | 'mes'
export type AgendaFilter = 'todos' | AppointmentKind

export const KIND_ORDER: AppointmentKind[] = ['prova', 'retirada', 'devolucao', 'atendimento', 'evento', 'servico', 'interno']
export const isAgendaFilter = (v: string | null): v is AgendaFilter => v === 'todos' || KIND_ORDER.includes(v as AppointmentKind)
export const isAgendaView = (v: string | null): v is AgendaView => v === 'dia' || v === 'semana' || v === 'mes'

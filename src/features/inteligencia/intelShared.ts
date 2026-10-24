/** Metadados das 5 seções da Inteligência (Decisão 12), rolagem por âncora e formatadores locais. */
import type { IntelGroup } from '@/data/types'

export type SectionMeta = { group: IntelGroup; id: string; title: string; eyebrow: string; short: string }

export const SECTIONS: SectionMeta[] = [
  { group: 'negocio', id: 'sec-negocio', title: 'Como está o negócio?', eyebrow: 'Visão geral', short: 'Negócio' },
  { group: 'comprar', id: 'sec-comprar', title: 'O que devo comprar?', eyebrow: 'Demanda × oferta', short: 'Compras' },
  { group: 'rendimento', id: 'sec-rendimento', title: 'Quais peças não estão rendendo?', eyebrow: 'Capital e retorno', short: 'Rendimento' },
  { group: 'provas', id: 'sec-provas', title: 'As provas viram locação?', eyebrow: 'Funil de prova', short: 'Provas' },
  { group: 'clientes', id: 'sec-clientes', title: 'Quem são as clientes?', eyebrow: 'Clientes', short: 'Clientes' },
]

export const sectionOf = (g: IntelGroup): SectionMeta => SECTIONS.find((s) => s.group === g)!

/** Rola suavemente até o elemento (seção ou card) e leva o foco junto, sem pular de novo. */
export function scrollToId(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

/** Faixas de ocupação (Decisão 12): atenção > 14%, falta acervo > 25%. */
export const OCC_WARN = 0.14
export const OCC_SHORT = 0.25
export const occZone = (rate: number): { label: string; color: string } | null =>
  rate > OCC_SHORT ? { label: 'falta acervo', color: 'var(--t-red)' } : rate > OCC_WARN ? { label: 'atenção', color: 'var(--t-amber)' } : null

export const pct1 = (x: number) => `${(x * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
export const num1 = (x: number) => x.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const times = (n: number) => `${n}×`
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

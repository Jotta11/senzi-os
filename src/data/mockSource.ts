/**
 * Fonte de dados em memória para a prévia visual: compõe as áreas (Acervo/Clientes agora; Agenda, Reservas,
 * Operação, Financeiro e Painel nas próximas tarefas) sobre um único mundo fictício (`MockCtx`).
 * Mesma interface e mesmos códigos de erro do banco (Plano 2B); o estado some ao recarregar a página.
 */
import { agenda } from './mock/agenda'
import { acervoClientes } from './mock/acervoClientes'
import { createMockCtx, type MockSourceOptions } from './mock/context'
import type { DataSource } from './source'

export type { MockSourceOptions } from './mock/context'

export function createMockSource(opts: MockSourceOptions = {}): DataSource {
  const ctx = createMockCtx(opts)
  const base = acervoClientes(ctx)
  return { ...base, ...agenda(ctx, base.createCustomer) }
}
